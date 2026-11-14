//! Embedded browser for the workspace panel.
//!
//! Each browser is a native child webview placed over a rectangle of the main window that
//! the frontend reports. It is built directly with `wry` (`WebViewBuilder::build_as_child`)
//! instead of through Tauri, which is what keeps it isolated from the app:
//! - Tauri never sees it, so it gets none of Tauri's initialization scripts
//!   (`__TAURI_INTERNALS__`, the invoke key), no `ipc://` / `tauri://` protocol handlers and
//!   no IPC message handler. There is nothing for a page to call, and capabilities (which
//!   Tauri matches by window/webview label) never apply to it.
//! - It uses a non-persistent data store (`incognito`; on macOS
//!   `WKWebsiteDataStore.nonPersistentDataStore`), separate from the app's own webview.
//! - Navigation is limited to http(s) (plus `about:`/`blob:`/`data:` needed by subframes);
//!   new-window requests navigate in place; downloads are refused.
//!
//! wry webviews are not `Send`: they are created, used and dropped on the main thread only
//! (see [`on_main`]). Shared, thread-safe state lives in [`STATES`].
//!
//! Commands: `browser_open`, `browser_set_bounds`, `browser_set_visible`, `browser_navigate`,
//! `browser_back`, `browser_forward`, `browser_reload`, `browser_stop`, `browser_close`,
//! `browser_open_external`, `browser_state`, `browser_normalize_url`.
//! Event: `browser:state { id, url, title, loading, canGoBack, canGoForward }`.

mod url_policy;
pub mod agent;
pub mod tool;

use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tracing::{debug, info, warn};

use crate::terminal::validate_id;
pub use url_policy::normalize_input;
use url_policy::{is_web_url, navigation_allowed};

const MAX_BROWSERS: usize = 4;
const MAIN_WINDOW: &str = "main";

#[derive(Deserialize, Clone, Copy, Debug)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct BrowserState {
    pub id: String,
    pub url: String,
    pub title: String,
    pub loading: bool,
    pub can_go_back: bool,
    pub can_go_forward: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BrowserOpenResult {
    pub id: String,
}

struct BrowserView {
    // Field order matters: the webview must be dropped before its context.
    webview: wry::WebView,
    _context: Box<wry::WebContext>,
}

thread_local! {
    /// Main-thread only.
    static VIEWS: RefCell<HashMap<String, BrowserView>> = RefCell::new(HashMap::new());
}

/// Last known state per browser (title comes from the title-changed callback).
static STATES: Lazy<Mutex<HashMap<String, BrowserState>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Page loads finished per browser. The agent's Browser tool compares this
/// before and after a navigation so it never reads the page it is leaving.
static LOADS: Lazy<Mutex<HashMap<String, u64>>> = Lazy::new(|| Mutex::new(HashMap::new()));

/// How many page loads this browser has finished.
pub fn finished_loads(id: &str) -> u64 {
    LOADS.lock().unwrap().get(id).copied().unwrap_or(0)
}

/// Whether the platform webview is still loading a page (None where unknown).
pub(crate) async fn is_loading(app: &AppHandle, id: &str) -> Option<bool> {
    let id = id.to_string();
    on_main(app, move |_| {
        Ok(VIEWS.with(|views| views.try_borrow().ok()?.get(&id).and_then(platform_nav_state).map(|s| s.2)))
    })
    .await
    .ok()
    .flatten()
}

static WINDOW_HOOKED: AtomicBool = AtomicBool::new(false);

// ---------------------------------------------------------------------------
// Main-thread plumbing
// ---------------------------------------------------------------------------

/// Run `f` on the main thread and wait for its result.
async fn on_main<T, F>(app: &AppHandle, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&AppHandle) -> Result<T, String> + Send + 'static,
{
    let (tx, rx) = tokio::sync::oneshot::channel();
    let app2 = app.clone();
    app.run_on_main_thread(move || {
        let _ = tx.send(f(&app2));
    })
    .map_err(|e| format!("Failed to reach the main thread: {e}"))?;
    rx.await
        .map_err(|_| "Main thread task was dropped".to_string())?
}

/// Queue `f` on the main thread without running it inline. wry callbacks run on the main
/// thread inside WebKit delegate calls, and `run_on_main_thread` from the main thread runs
/// synchronously, so callbacks use this to avoid re-entering the webview.
fn post_to_main<F>(app: &AppHandle, f: F)
where
    F: FnOnce(&AppHandle) + Send + 'static,
{
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let app2 = app.clone();
        let _ = app.run_on_main_thread(move || f(&app2));
    });
}

fn with_view<T>(id: &str, f: impl FnOnce(&BrowserView) -> Result<T, String>) -> Result<T, String> {
    VIEWS.with(|views| {
        let views = views
            .try_borrow()
            .map_err(|_| "Browser is busy, try again".to_string())?;
        let view = views
            .get(id)
            .ok_or_else(|| format!("No browser with id {id:?}"))?;
        f(view)
    })
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window(MAIN_WINDOW)
        .ok_or_else(|| "The main window is not available yet".to_string())
}

fn to_rect(b: Bounds) -> wry::Rect {
    let x = if b.x.is_finite() { b.x } else { 0.0 };
    let y = if b.y.is_finite() { b.y } else { 0.0 };
    let w = if b.width.is_finite() { b.width.max(0.0) } else { 0.0 };
    let h = if b.height.is_finite() { b.height.max(0.0) } else { 0.0 };
    wry::Rect {
        position: wry::dpi::LogicalPosition::new(x, y).into(),
        size: wry::dpi::LogicalSize::new(w, h).into(),
    }
}

// ---------------------------------------------------------------------------
// State reporting
// ---------------------------------------------------------------------------

/// Navigation flags straight from the platform webview, where available.
fn platform_nav_state(view: &BrowserView) -> Option<(bool, bool, bool)> {
    #[cfg(target_os = "macos")]
    {
        use wry::WebViewExtMacOS;
        let wk = view.webview.webview();
        #[allow(unused_unsafe)]
        unsafe {
            Some((wk.canGoBack(), wk.canGoForward(), wk.isLoading()))
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = view;
        None
    }
}

/// The address the webview is on, or None when it has none yet (for example after a
/// first navigation that failed to connect).
///
/// wry's own `url()` unwraps the platform value and panics the whole app when WebKit
/// reports no URL, so on macOS ask WebKit directly.
fn current_url(view: &BrowserView) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        use wry::WebViewExtMacOS;
        let wk = view.webview.webview();
        #[allow(unused_unsafe)]
        unsafe {
            wk.URL()
                .and_then(|url| url.absoluteString())
                .map(|s| s.to_string())
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        view.webview.url().ok()
    }
}

/// Re-read the webview, merge into STATES and return the state. Main thread only.
fn refresh_state(id: &str) -> Option<BrowserState> {
    let live = VIEWS.with(|views| {
        let views = views.try_borrow().ok()?;
        let view = views.get(id)?;
        let url = current_url(view);
        Some((url, platform_nav_state(view)))
    })?;
    let mut states = STATES.lock().unwrap();
    let state = states.entry(id.to_string()).or_insert_with(|| BrowserState {
        id: id.to_string(),
        ..Default::default()
    });
    if let Some(url) = live.0.filter(|u| !u.is_empty()) {
        state.url = url;
    }
    if let Some((back, forward, loading)) = live.1 {
        state.can_go_back = back;
        state.can_go_forward = forward;
        state.loading = loading;
    }
    Some(state.clone())
}

fn emit_state(app: &AppHandle, state: &BrowserState) {
    if let Err(e) = app.emit("browser:state", state) {
        debug!("[browser] emit failed: {e}");
    }
}

fn refresh_and_emit(app: &AppHandle, id: &str) {
    if let Some(state) = refresh_state(id) {
        emit_state(app, &state);
    }
}

fn update_state(id: &str, f: impl FnOnce(&mut BrowserState)) {
    let mut states = STATES.lock().unwrap();
    if let Some(state) = states.get_mut(id) {
        f(state);
    }
}

// ---------------------------------------------------------------------------
// Creation / teardown
// ---------------------------------------------------------------------------

fn create_view(app: &AppHandle, id: &str, url: &str, bounds: Bounds, visible: bool, restricted_origin: Option<String>) -> Result<BrowserView, String> {
    let window = main_window(app)?;
    hook_main_window(&window);

    let nav_id = id.to_string();
    let load_app = app.clone();
    let load_id = id.to_string();
    let title_app = app.clone();
    let title_id = id.to_string();
    let popup_app = app.clone();
    let popup_id = id.to_string();

    let popup_origin = restricted_origin.clone();
    let mut context = Box::new(wry::WebContext::new(browser_data_dir(app)));
    let builder = wry::WebViewBuilder::new_with_web_context(&mut context)
        .with_url(url)
        .with_bounds(to_rect(bounds))
        .with_incognito(true)
        .with_initialization_script(include_str!("observe.js"))
        .with_visible(visible)
        .with_devtools(true)
        .with_accept_first_mouse(true)
        .with_back_forward_navigation_gestures(true)
        .with_clipboard(true)
        .with_navigation_handler(move |target: String| {
            let allowed = navigation_allowed(&target) && restricted_origin.as_ref().is_none_or(|o| target == "about:blank" || url::Url::parse(&target).is_ok_and(|u| u.origin().ascii_serialization() == *o));
            if !allowed {
                warn!("[browser] {nav_id}: blocked navigation to {target}");
            }
            allowed
        })
        .with_new_window_req_handler(move |target: String, _features| {
            // target=_blank / window.open: navigate in place instead of spawning a window.
            if is_web_url(&target) && popup_origin.as_ref().is_none_or(|o| url::Url::parse(&target).is_ok_and(|u|u.origin().ascii_serialization()==*o)) {
                let id = popup_id.clone();
                post_to_main(&popup_app, move |app| {
                    let _ = with_view(&id, |v| {
                        v.webview.load_url(&target).map_err(|e| e.to_string())
                    });
                    refresh_and_emit(app, &id);
                });
            } else {
                debug!("[browser] {popup_id}: ignored new window for {target}");
            }
            wry::NewWindowResponse::Deny
        })
        .with_on_page_load_handler(move |event, page_url| {
            let loading = matches!(event, wry::PageLoadEvent::Started);
            if !loading {
                *LOADS.lock().unwrap().entry(load_id.clone()).or_insert(0) += 1;
            }
            update_state(&load_id, |s| {
                s.loading = loading;
                if !page_url.is_empty() {
                    s.url = page_url.clone();
                }
            });
            let id = load_id.clone();
            post_to_main(&load_app, move |app| refresh_and_emit(app, &id));
        })
        .with_document_title_changed_handler(move |title: String| {
            update_state(&title_id, |s| s.title = title);
            let id = title_id.clone();
            post_to_main(&title_app, move |app| refresh_and_emit(app, &id));
        })
        .with_download_started_handler(|url: String, _path: &mut std::path::PathBuf| {
            info!("[browser] refused download of {url}");
            false
        });

    let webview = builder
        .build_as_child(&window)
        .map_err(|e| format!("Failed to create the browser view: {e}"))?;
    #[cfg(all(target_os="macos", any(debug_assertions, feature="dev-release-probe")))]
    if std::env::var("VIBEWORK_DEV_BACKGROUND").as_deref()==Ok("1") {
        use wry::WebViewExtMacOS;
        use objc2_new::runtime::AnyObject;
        let native=webview.webview();
        let wk: &AnyObject=unsafe { &*((&*native as *const _) as *const AnyObject) };
        if wk.class().responds_to(objc2_new::sel!(_setWindowOcclusionDetectionEnabled:)) {
            unsafe {let _:()=objc2_new::msg_send![wk,_setWindowOcclusionDetectionEnabled:false];}
        }
    }
    Ok(BrowserView {
        webview,
        _context: context,
    })
}

/// Where the platform webview keeps its profile. macOS uses an in-memory
/// `nonPersistentDataStore` (incognito) and ignores this. WebView2 needs a writable
/// user-data folder even for InPrivate, and must not share the app webview's folder.
fn browser_data_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        None
    }
    #[cfg(not(target_os = "macos"))]
    {
        app.path()
            .app_local_data_dir()
            .ok()
            .map(|d| d.join("browser-webview"))
    }
}

/// Close every browser when the main window is destroyed. On macOS closing the main window
/// only hides it (see lib.rs); the child views are subviews of its content view and hide with it.
fn hook_main_window(window: &WebviewWindow) {
    if WINDOW_HOOKED.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = window.app_handle().clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            WINDOW_HOOKED.store(false, Ordering::SeqCst);
            let app = app.clone();
            // Window events are delivered on the main thread, where VIEWS lives.
            let closed = close_all_views();
            for id in closed {
                let _ = app.emit("browser:closed", serde_json::json!({ "id": id }));
            }
        }
    });
}

fn close_all_views() -> Vec<String> {
    let drained: Vec<(String, BrowserView)> = VIEWS.with(|views| match views.try_borrow_mut() {
        Ok(mut views) => views.drain().collect(),
        Err(_) => Vec::new(),
    });
    let ids: Vec<String> = drained.iter().map(|(id, _)| id.clone()).collect();
    drop(drained);
    let mut states = STATES.lock().unwrap();
    for id in &ids {
        states.remove(id);
    }
    ids
}

/// If the browser view has keyboard focus, hand it back to the app's own webview
/// (otherwise e.g. a modal's autofocused input would not receive keys).
fn return_focus_if_owned(app: &AppHandle, view: &BrowserView) {
    #[cfg(target_os = "macos")]
    {
        use wry::WebViewExtMacOS;
        let wk = view.webview.webview();
        let owned = wk
            .window()
            .and_then(|w| w.firstResponder())
            .map(|r| {
                let responder = &*r as *const _ as *const std::ffi::c_void;
                let webview = &*wk as *const _ as *const std::ffi::c_void;
                responder == webview
            })
            .unwrap_or(false);
        if owned {
            if let Ok(main) = main_window(app) {
                let main_webview: &tauri::Webview = main.as_ref();
                let _ = main_webview.set_focus();
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, view);
    }
}

/// Close all browsers. Called on app exit (main thread).
pub fn shutdown_all() {
    let closed = close_all_views();
    if !closed.is_empty() {
        info!("[browser] closed {} browser view(s) on exit", closed.len());
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn browser_open(
    app_handle: AppHandle,
    id: String,
    url: String,
    bounds: Bounds,
    restricted_origin: Option<String>,
) -> Result<BrowserOpenResult, String> {
    validate_id(&id)?;
    let url = normalize_input(&url)?;
    let result_id = id.clone();
    on_main(&app_handle, move |app| {
        let exists = VIEWS.with(|v| v.borrow().contains_key(&id));
        if exists {
            with_view(&id, |v| {
                v.webview.set_bounds(to_rect(bounds)).map_err(|e| e.to_string())?;
                Ok(())
            })?;
        } else {
            let count = VIEWS.with(|v| v.borrow().len());
            if count >= MAX_BROWSERS {
                return Err(format!(
                    "Too many browser views open (limit {MAX_BROWSERS}). Close one first."
                ));
            }
            STATES.lock().unwrap().insert(
                id.clone(),
                BrowserState {
                    id: id.clone(),
                    url: url.clone(),
                    loading: true,
                    ..Default::default()
                },
            );
            match create_view(app, &id, &url, bounds, false, restricted_origin) {
                Ok(view) => {
                    VIEWS.with(|v| v.borrow_mut().insert(id.clone(), view));
                    info!("[browser] opened {id} at {url}");
                }
                Err(e) => {
                    STATES.lock().unwrap().remove(&id);
                    return Err(e);
                }
            }
        }
        refresh_and_emit(app, &id);
        Ok(())
    })
    .await?;
    Ok(BrowserOpenResult { id: result_id })
}

#[tauri::command]
pub async fn browser_set_bounds(app_handle: AppHandle, id: String, bounds: Bounds) -> Result<(), String> {
    on_main(&app_handle, move |_| {
        with_view(&id, |v| v.webview.set_bounds(to_rect(bounds)).map_err(|e| e.to_string()))
    })
    .await
}

#[tauri::command]
pub async fn browser_set_visible(app_handle: AppHandle, id: String, visible: bool) -> Result<(), String> {
    on_main(&app_handle, move |app| {
        with_view(&id, |v| {
            if !visible {
                return_focus_if_owned(app, v);
            }
            v.webview.set_visible(visible).map_err(|e| e.to_string())
        })
    })
    .await
}

#[tauri::command]
pub async fn browser_navigate(app_handle: AppHandle, id: String, url: String) -> Result<(), String> {
    let url = normalize_input(&url)?;
    on_main(&app_handle, move |app| {
        with_view(&id, |v| v.webview.load_url(&url).map_err(|e| e.to_string()))?;
        refresh_and_emit(app, &id);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn browser_back(app_handle: AppHandle, id: String) -> Result<(), String> {
    on_main(&app_handle, move |_| {
        with_view(&id, |v| {
            #[cfg(target_os = "macos")]
            {
                use wry::WebViewExtMacOS;
                #[allow(unused_unsafe)]
                let _ = unsafe { v.webview.webview().goBack() };
                Ok(())
            }
            #[cfg(not(target_os = "macos"))]
            {
                v.webview.evaluate_script("history.back()").map_err(|e| e.to_string())
            }
        })
    })
    .await
}

#[tauri::command]
pub async fn browser_forward(app_handle: AppHandle, id: String) -> Result<(), String> {
    on_main(&app_handle, move |_| {
        with_view(&id, |v| {
            #[cfg(target_os = "macos")]
            {
                use wry::WebViewExtMacOS;
                #[allow(unused_unsafe)]
                let _ = unsafe { v.webview.webview().goForward() };
                Ok(())
            }
            #[cfg(not(target_os = "macos"))]
            {
                v.webview.evaluate_script("history.forward()").map_err(|e| e.to_string())
            }
        })
    })
    .await
}

#[tauri::command]
pub async fn browser_reload(app_handle: AppHandle, id: String) -> Result<(), String> {
    on_main(&app_handle, move |_| {
        with_view(&id, |v| v.webview.reload().map_err(|e| e.to_string()))
    })
    .await
}

#[tauri::command]
pub async fn browser_stop(app_handle: AppHandle, id: String) -> Result<(), String> {
    on_main(&app_handle, move |app| {
        with_view(&id, |v| {
            #[cfg(target_os = "macos")]
            {
                use wry::WebViewExtMacOS;
                #[allow(unused_unsafe)]
                unsafe {
                    v.webview.webview().stopLoading()
                };
                Ok(())
            }
            #[cfg(not(target_os = "macos"))]
            {
                v.webview.evaluate_script("window.stop()").map_err(|e| e.to_string())
            }
        })?;
        update_state(&id, |s| s.loading = false);
        refresh_and_emit(app, &id);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn browser_close(app_handle: AppHandle, id: String) -> Result<(), String> {
    on_main(&app_handle, move |app| {
        let view = VIEWS.with(|v| {
            v.try_borrow_mut()
                .map_err(|_| "Browser is busy, try again".to_string())
                .map(|mut v| v.remove(&id))
        })?;
        if let Some(view) = view {
            return_focus_if_owned(app, &view);
            drop(view); // removes the native view from the window
            info!("[browser] closed {id}");
        }
        STATES.lock().unwrap().remove(&id);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn browser_open_external(app_handle: AppHandle, id: String) -> Result<(), String> {
    let url = on_main(&app_handle, move |_| {
        refresh_state(&id)
            .map(|s| s.url)
            .ok_or_else(|| format!("No browser with id {id:?}"))
    })
    .await?;
    if !is_web_url(&url) {
        return Err(format!("Cannot open {url:?} in the system browser"));
    }
    use tauri_plugin_opener::OpenerExt;
    app_handle
        .opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("Failed to open the system browser: {e}"))
}

#[tauri::command]
pub async fn browser_state(app_handle: AppHandle, id: String) -> Result<BrowserState, String> {
    on_main(&app_handle, move |_| {
        refresh_state(&id).ok_or_else(|| format!("No browser with id {id:?}"))
    })
    .await
}

/// Normalise typed input without opening anything: the http(s) URL, or a readable error.
#[tauri::command]
pub async fn browser_normalize_url(input: String) -> Result<String, String> {
    normalize_input(&input)
}

// The opt-in, authenticated development bridge can exercise a native child
// view without sending input to the desktop. This is absent from production.
#[cfg(any(debug_assertions, feature = "dev-release-probe"))]
pub(crate) fn debug_eval(app: &AppHandle, id: String, code: String) -> Result<serde_json::Value,String> {
    let (tx,rx)=std::sync::mpsc::channel();
    let script=format!("JSON.stringify((function(){{{code}}})())");
    app.run_on_main_thread(move || {
        let tx=std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));let callback=tx.clone();
        let result=with_view(&id,|v|v.webview.evaluate_script_with_callback(&script,move |value|{if let Some(tx)=callback.lock().unwrap().take(){let _=tx.send(Ok(value));}}).map_err(|e|e.to_string()));
        if let Err(e)=result{if let Some(tx)=tx.lock().unwrap().take(){let _=tx.send(Err(e));}}
    }).map_err(|e|e.to_string())?;
    let result=rx.recv_timeout(std::time::Duration::from_secs(10)).map_err(|e|e.to_string())??;
    let value:serde_json::Value=serde_json::from_str(&result).map_err(|e|e.to_string())?;
    match value.as_str(){Some(s)=>serde_json::from_str(s).map_err(|e|e.to_string()),None=>Ok(value)}
}
