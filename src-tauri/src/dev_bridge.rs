//! Opt-in debug automation. Newline-delimited JSON over authenticated loopback TCP.
use std::{collections::HashMap, io::{BufRead, BufReader, Read, Write}, net::{TcpListener, TcpStream}, sync::{mpsc, Mutex}, time::Duration};
use tauri::{Manager, State};
use serde_json::{json, Value};

pub(crate) struct Bridge { token: String, pending: Mutex<HashMap<String, mpsc::Sender<Value>>> }

#[tauri::command]
pub fn dev_bridge_complete(window: tauri::WebviewWindow, state: State<'_, Bridge>, id: String, result: Value) -> Result<(), String> {
    if window.label() != "main" { return Err("Main window required".into()); }
    if let Some(tx) = state.pending.lock().unwrap().remove(&id) { let _ = tx.send(result); }
    Ok(())
}

fn request(app: &tauri::AppHandle, stream: &mut TcpStream) -> Result<Value, String> {
    stream.set_read_timeout(Some(Duration::from_secs(10))).map_err(|e| e.to_string())?;
    let mut line = String::new();
    BufReader::new((&mut *stream).take(1_048_577)).read_line(&mut line).map_err(|e| e.to_string())?;
    if line.len() > 1_048_576 { return Err("Request too large".into()); }
    let req: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
    let state = app.state::<Bridge>();
    if req["token"].as_str() != Some(state.token.as_str()) { return Err("Unauthorized".into()); }
    let window = app.get_webview_window("main");
    if req["op"] == "state" { return Ok(json!({"mainWindow":window.is_some(), "pid": std::process::id()})); }
    // Quit the app through Tauri's normal exit path (RunEvent::Exit cleanup runs), like Cmd+Q.
    if req["op"] == "quit" { let app = app.clone(); std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(200)); app.exit(0); }); return Ok(json!({"quitting":true})); }
    // A native file drop on the main window (the picker and real drops can't be driven from here)
    if req["op"] == "drop" {
        use tauri::Emitter;
        let paths: Vec<String> = serde_json::from_value(req["paths"].clone()).map_err(|e| e.to_string())?;
        crate::app_utils::attachment_preview::register(&paths);
        app.emit_to(tauri::EventTarget::webview("main"), "tauri://drag-drop", json!({"paths": paths, "position": {"x": 400, "y": 400}})).map_err(|e| e.to_string())?;
        return Ok(json!({"dropped": paths.len()}));
    }
    // The main webview's WebContent process id (WebKit runs pages out of process; the
    // performance harness samples only that pid, never a guess from the process list).
    if req["op"] == "webPid" {
        let window = window.ok_or("Main window not ready")?;
        let (tx, rx) = mpsc::channel();
        window.with_webview(move |webview| { let _ = tx.send(web_process_id(&webview)); }).map_err(|e| e.to_string())?;
        let pid = rx.recv_timeout(Duration::from_secs(5)).map_err(|_| "Timed out".to_string())?;
        return Ok(json!({"pid": std::process::id(), "webPid": pid}));
    }
    if req["op"] == "motionTestPath" {
        for (key,name) in [("path","VIBEWORK_DEV_MOTION_PATH"),("browser","VIBEWORK_DEV_MOTION_BROWSER")] {
            if let Some(value)=req[key].as_str(){std::env::set_var(name,value)}else{std::env::remove_var(name)}
        }
        return Ok(json!({"updated":true}));
    }
    if req["op"] == "browserEval" {return crate::browser::debug_eval(app,req["id"].as_str().ok_or("Missing view id")?.into(),req["code"].as_str().ok_or("Missing code")?.into());}
    if req["op"] != "eval" { return Err("Unknown operation".into()); }
    let window = window.ok_or("Main window not ready")?;
    let code = req["code"].as_str().ok_or("Missing code")?;
    let id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = mpsc::channel();
    state.pending.lock().unwrap().insert(id.clone(), tx);
    let script = format!(r#"(async()=>{{let result;try{{const value=await(async()=>{{{code}
}})();result={{ok:true,value:value===undefined?null:JSON.parse(JSON.stringify(value))}}}}catch(e){{result={{ok:false,error:String(e)+'\n'+String(e?.stack||'')}}}}await window.__TAURI_INTERNALS__.invoke('dev_bridge_complete',{{id:{id_json},result}})}})()"#, id_json=serde_json::to_string(&id).unwrap());
    let result = window.eval(&script).map_err(|e| e.to_string()).and_then(|_| rx.recv_timeout(Duration::from_secs(30)).map_err(|_| "Evaluation timed out".to_string()));
    state.pending.lock().unwrap().remove(&id);
    result
}

pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("dev-bridge")
        .setup(|app, _| {
            if std::env::var("VIBEWORK_DEV_BRIDGE").as_deref() != Ok("1") { return Ok(()); }
            let listener = TcpListener::bind("127.0.0.1:0")?;
            let token = uuid::Uuid::new_v4().to_string();
            let dir = crate::paths::get_app_data_dir();
            std::fs::create_dir_all(&dir)?;
            let path = dir.join("dev-bridge.json");
            let mut options = std::fs::OpenOptions::new();
            options.write(true).create(true).truncate(true);
            #[cfg(unix)]
            { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
            let mut file = options.open(&path)?;
            writeln!(file, "{}", json!({"port":listener.local_addr()?.port(),"token":token}))?;
            app.manage(Bridge { token, pending: Mutex::new(HashMap::new()) });
            let app = app.clone();
            std::thread::spawn(move || { for stream in listener.incoming() { if let Ok(mut stream) = stream {
                let app = app.clone();
                std::thread::spawn(move || { let result = request(&app, &mut stream).unwrap_or_else(|e| json!({"ok":false,"error":e})); let _ = writeln!(stream,"{result}"); });
            } } });
            tracing::info!("Dev bridge ready: {}", path.display());
            Ok(())
        }).build()
}

#[cfg(target_os = "macos")]
fn web_process_id(webview: &tauri::webview::PlatformWebview) -> Option<i32> {
    use objc2_new::runtime::AnyObject;
    let selector = objc2_new::sel!(_webProcessIdentifier);
    // SAFETY: on macOS `inner()` is the window's WKWebView, alive for this call.
    let wk = unsafe { &*(webview.inner() as *const AnyObject) };
    if !wk.class().responds_to(selector) { return None; }
    let pid: i32 = unsafe { objc2_new::msg_send![wk, _webProcessIdentifier] };
    (pid > 0).then_some(pid)
}

#[cfg(not(target_os = "macos"))]
fn web_process_id(_webview: &tauri::webview::PlatformWebview) -> Option<i32> { None }
