#[cfg(any(debug_assertions, feature = "dev-release-probe"))]
mod dev_bridge;

mod app_utils;
mod artifacts;
mod gallery;
mod browser;
mod motion;
mod byok;
mod usage;
mod updates;
mod config;
mod engine;
mod logs_syncer;
mod connectors;
mod models;
mod paths;
mod runtimes;
mod skills;
mod startup_setup;
mod storage;
mod terminal;
mod web;

use tracing::{error, info};

// ============================================================================
// App Entry Point
// ============================================================================

/// Starting and smallest size of the main window, in logical pixels. It can
/// grow and go full screen, never shrink below this.
pub(crate) const MAIN_WINDOW_WIDTH: f64 = 1400.0;
pub(crate) const MAIN_WINDOW_HEIGHT: f64 = 900.0;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging to both console and file
    logs_syncer::init_logging();

    info!("🚀 Starting Vibe Work application");

    let builder = tauri::Builder::default()
        .manage(updates::Updates::default())
        .plugin(tauri_plugin_updater::Builder::new().build());
    #[cfg(any(debug_assertions, feature = "dev-release-probe"))]
    let builder = builder.plugin(dev_bridge::init());
    // A dev copy on its own data folder (`VIBEWORK_DEV_DATA_DIR`) runs beside
    // the installed app instead of handing over to it.
    #[cfg(any(debug_assertions, feature = "dev-release-probe"))]
    let single_instance = paths::dev_data_dir_override().is_none();
    #[cfg(not(any(debug_assertions, feature = "dev-release-probe")))]
    let single_instance = true;
    let builder = if single_instance {
        builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            use tauri::Manager;
            // When a second instance is launched, focus the existing window
            info!("Second instance detected - args: {:?}, cwd: {:?}", args, cwd);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
    } else {
        builder
    };
    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(artifacts::init())
        .setup(|app| {
            updates::launch(app.handle().clone());
            browser::agent::init(app.handle().clone());
            // SIGTERM (kill, launchd) quits through Tauri's normal exit path,
            // so the engine, connectors and terminals are stopped as on ⌘Q.
            #[cfg(unix)]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    use tokio::signal::unix::{signal, SignalKind};
                    match signal(SignalKind::terminate()) {
                        Ok(mut term) => {
                            term.recv().await;
                            info!("SIGTERM received, quitting");
                            handle.exit(0);
                        }
                        Err(e) => error!("Cannot listen for SIGTERM: {}", e),
                    }
                });
            }
            use tauri::Manager;
            use tauri::{WebviewUrl, WebviewWindowBuilder};

            // Register deep link schemes at runtime (needed for dev mode on Windows/Linux)
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(e) = app.deep_link().register_all() {
                    error!("Failed to register deep link schemes: {}", e);
                }
            }

            // Handle deep link open events — focus the main window
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let app_handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    info!("Deep link received: {:?}", event.urls());
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                });
            }

            // A dev copy asked to stay in the background: no Dock icon, never activated
            let dev_background = paths::dev_background();
            #[cfg(target_os = "macos")]
            if dev_background {
                info!("Dev background mode: no Dock icon, windows kept behind others");
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            // Create loading window FIRST - shows immediately with React
            info!("Creating loading window");
            let loading_window = WebviewWindowBuilder::new(app, "loading", WebviewUrl::App("loading.html".into()))
                .title("Vibework")
                .inner_size(400.0, 250.0)
                .resizable(false)
                .decorations(false)
                .transparent(true)
                .center()
                .focused(!dev_background)
                .always_on_bottom(dev_background)
                .build()
                .unwrap();

            // Quit app if loading window is closed before main window is ready
            {
                let app_handle = app.handle().clone();
                loading_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        info!("Loading window close requested, exiting application");
                        app_handle.exit(0);
                    }
                });
            }

            // Initialize config with app data directory
            let app_data_dir = paths::get_app_data_dir();
            config::init(app_data_dir.clone());

            // Keychain access is deferred to async status/auth requests.
            // A native approval prompt must never block window creation.

            // User skills folder (outside .vibework, so unbundling never touches it)
            skills::ensure_user_skills_dir();

            // Warm the OpenRouter model list (public endpoint, no key needed)
            tauri::async_runtime::spawn(async {
                models::ensure_loaded().await;
            });

            // Run all startup and agent initialization in background
            // When done, close loading window and create main window
            let app_handle_for_init = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // 1. Run startup setup tasks (unbundle, working directory, etc.)
                info!("Running startup setup tasks...");
                if let Err(e) = startup_setup::initialize(app_handle_for_init.clone()).await {
                    error!("Startup initialization failed: {}", e);
                }

                // 2. Start the OpenCode engine
                engine::init(app_handle_for_init.clone());

                // Connectors are the engine's own MCP servers: Settings asks it
                // for their status once it is up.
                connectors::init(app_handle_for_init.clone());

                // Close loading window (use destroy to avoid triggering close event)
                if let Some(window) = app_handle_for_init.get_webview_window("loading") {
                    if let Err(e) = window.destroy() {
                        error!("Failed to destroy loading window: {}", e);
                    }
                }

                // The main window has one fixed size for now: the layout is designed and tested
                // at 1400x900, and the user cannot resize it. On a smaller screen it shrinks
                // to fit, keeping a margin for the menu bar and Dock.
                info!("Creating main window");
                let (width, height) = {
                    let fallback = (MAIN_WINDOW_WIDTH, MAIN_WINDOW_HEIGHT);
                    app_handle_for_init
                        .primary_monitor()
                        .ok()
                        .flatten()
                        .map(|m| {
                            let size = m.size();
                            let scale = m.scale_factor();
                            let logical_w = size.width as f64 / scale;
                            let logical_h = size.height as f64 / scale;
                            (
                                MAIN_WINDOW_WIDTH.min(logical_w - 40.0),
                                MAIN_WINDOW_HEIGHT.min(logical_h - 110.0),
                            )
                        })
                        .unwrap_or(fallback)
                };
                let mut win_builder = WebviewWindowBuilder::new(&app_handle_for_init, "main", WebviewUrl::default())
                    .title("Vibework")
                    .visible(false)
                    .inner_size(width, height)
                    // The window can grow and go full screen, but never below the
                    // size every screen was designed at
                    .min_inner_size(width, height)
                    .resizable(true)
                    .maximizable(true)
                    // The app is light by default whatever the system appearance is; the
                    // frontend switches this when the user picks dark or "system"
                    // (src/lib/theme.ts). It also decides which window material is used.
                    .theme(Some(tauri::Theme::Light))
                    .center();
                if dev_background {
                    // Behind other windows, unfocused, and still painting there
                    // Built hidden, so WebKit's occlusion switch is set before it first shows
                    win_builder = win_builder
                        .visible(false)
                        .focused(false)
                        .always_on_bottom(true)
                        .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled);
                }

                // Configure titlebar for macOS - transparent titlebar with traffic lights
                #[cfg(target_os = "macos")]
                {
                    use tauri::TitleBarStyle;
                    use tauri::window::{Effect, EffectState, EffectsBuilder};
                    // The window is transparent with macOS's sidebar material behind it, so the
                    // parts of the page that leave their background clear (the sidebar) show the
                    // desktop blurred through them. Everything else paints an opaque surface.
                    win_builder = win_builder
                        .title_bar_style(TitleBarStyle::Overlay)
                        .hidden_title(true)
                        // Centre the traffic lights on the 60px header band (--titlebar-height):
                        // y 32 puts their centre 30px below the window's top edge
                        .traffic_light_position(tauri::LogicalPosition::new(18.0, 32.0))
                        .transparent(true)
                        .effects(
                            EffectsBuilder::new()
                                .effect(Effect::Sidebar)
                                .state(EffectState::FollowsWindowActiveState)
                                .build(),
                        );
                }

                // For other platforms, use standard decorations
                #[cfg(not(target_os = "macos"))]
                {
                    win_builder = win_builder.decorations(true);
                }

                match win_builder.build() {
                    Ok(window) => {
                        #[cfg(target_os = "macos")]
                        if dev_background {
                            keep_painting_when_covered(&window);
                        }
                        // Add event handler for main window close
                        let app_handle = app_handle_for_init.clone();
                        window.on_window_event(move |event| {
                            // Files dropped on the window become attachments, so they may be previewed
                            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                                app_utils::attachment_preview::register(paths);
                            }
                            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                                // macOS: Hide window but keep app running (standard macOS behavior)
                                #[cfg(target_os = "macos")]
                                {
                                    info!("Main window close requested on macOS, hiding window");
                                    api.prevent_close();
                                    if let Some(window) = app_handle.get_webview_window("main") {
                                        let _ = window.hide();
                                    }
                                }

                                // Windows/Linux: Quit app when window is closed
                                #[cfg(not(target_os = "macos"))]
                                {
                                    // Silence unused warning: `api` is only used on macOS.
                                    let _ = api;
                                    info!("Main window close requested, exiting application");
                                    app_handle.exit(0);
                                }
                            }
                        });
                    }
                    Err(e) => {
                        error!("Failed to create main window: {}", e);
                    }
                }
            });

            // Create overlay window (hidden by default, larger for padding/rounded corners)
            WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into()))
                .inner_size(380.0, 88.0)
                .resizable(false)
                .decorations(false)
                .transparent(true)
                .shadow(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .visible(false)
                .focused(false)
                .build()?;

            info!("Application setup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            updates::update_status,
            updates::update_check,
            updates::update_install,
            #[cfg(any(debug_assertions, feature = "dev-release-probe"))]
            dev_bridge::dev_bridge_complete,
            // OpenRouter key commands
            byok::byok_get_status,
            usage::usage_get,
            engine::commands::agent_get_usage,
            byok::byok_set_openrouter_key,
            byok::byok_clear_openrouter_key,
            // Model commands
            engine::external::agent_installed_agents,
            engine::external::catalog::agent_models,
            engine::external::usage::agent_usage,
            engine::inbox::agent_inbox,
            engine::inbox::agent_enqueue,
            engine::inbox::agent_inbox_action,
            updates::agent_retry_external,
            engine::external::agent_external_status,
            models::models_list,
            models::get_default_model,
            models::set_default_model,
            // Agent Browser commands
            // App utils commands
            app_utils::commands::app_set_window_size,
            app_utils::commands::app_set_min_window_size,
            app_utils::commands::app_get_file_info,
            app_utils::attachment_preview::attachment_preview,
            app_utils::attachment_preview::attachment_pick,
            app_utils::attachment_preview::attachment_design_image,
            app_utils::commands::app_reveal_in_finder,
            app_utils::commands::app_open_file,
            app_utils::commands::app_default_app_name,
            app_utils::commands::app_minimize_window,
            app_utils::commands::app_toggle_maximize_window,
            app_utils::commands::app_close_window,
            app_utils::commands::app_start_drag,
            // Overlay commands
            app_utils::commands::overlay_show,
            app_utils::commands::overlay_hide,
            app_utils::commands::overlay_focus_main,
            // Settings commands
            app_utils::commands::get_notifications_enabled,
            app_utils::commands::set_notifications_enabled,
            app_utils::commands::get_default_working_directory,
            app_utils::commands::set_default_working_directory,
            app_utils::commands::folders_get,
            app_utils::commands::folders_note_used,
            app_utils::commands::folders_set_pinned,
            app_utils::commands::folders_set_home,
            app_utils::commands::folders_complete,
            app_utils::commands::folders_check,
            // Onboarding commands
            app_utils::commands::get_onboarding_completed,
            app_utils::commands::set_onboarding_completed,
            // File search
            app_utils::file_search::search_files,
            // Task commands (OpenCode engine)
            engine::commands::agent_create_session,
            engine::commands::agent_send_message,
            engine::commands::agent_interrupt,
            engine::commands::agent_shutdown,
            engine::commands::agent_permission_respond,
            engine::commands::agent_question_respond,
            engine::commands::agent_pending_permission,
            engine::commands::agent_waiting_sessions,
            engine::commands::agent_pending_question,
            engine::commands::agent_get_permission_mode,
            engine::commands::agent_set_permission_mode,
            engine::commands::agent_list_sessions,
            engine::commands::agent_load_session,
            engine::commands::agent_resume_session,
            engine::commands::agent_delete_session,
            engine::commands::agent_restore_session,
            engine::commands::agent_purge_deleted_sessions,
            engine::commands::agent_search_messages,
            engine::commands::agent_is_running,
            engine::commands::agent_list_running,
            engine::commands::agent_rename_session,
            engine::commands::agent_set_settled,
            engine::commands::agent_set_working_folder,
            engine::commands::agent_get_working_folder,
            engine::commands::agent_switch_model,
            engine::commands::agent_get_model,
            // MCP server commands
            connectors::mcp_list_servers,
            connectors::mcp_add_server,
            connectors::mcp_update_server,
            connectors::mcp_remove_server,
            connectors::mcp_set_server_enabled,
            connectors::mcp_import_json,
            connectors::mcp_reload,
            connectors::mcp_config_path,
            connectors::mcp_config_error,
            connectors::mcp_sign_in,
            connectors::mcp_cancel_sign_in,
            connectors::mcp_sign_out,
            // Web tool settings
            web::web_get_settings,
            web::web_set_provider,
            web::web_set_key,
            // Skills
            skills::skills_list,
            skills::skills_available,
            skills::skills_folder_path,
            skills::skills_summary,
            skills::skills_set_source_enabled,
            skills::skills_open_folder,
            // Artifacts (workspace panel)
            gallery::artifacts_index,
            artifacts::artifact_read,
            artifacts::artifact_stat,
            artifacts::artifact_sheet_head,
            artifacts::artifact_sheet_range,
            artifacts::artifact_write,
            artifacts::artifact_list,
            artifacts::artifact_tree_list,
            artifacts::artifact_tree_find,
            artifacts::artifact_watch_tree,
            artifacts::artifact_watch,
            artifacts::artifact_unwatch,
            artifacts::artifact_inline_create,
            artifacts::artifact_inline_release,
            // Workspace panel: terminal
            terminal::terminal_open,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            terminal::terminal_list,
            terminal::terminal_snapshot,
            // Workspace panel: browser
            browser::browser_open,
            motion::motion_action,
            motion::motion_thumbnail,
            motion::motion_close_session,
            browser::browser_set_bounds,
            browser::browser_set_visible,
            browser::browser_navigate,
            browser::browser_back,
            browser::browser_forward,
            browser::browser_reload,
            browser::browser_stop,
            browser::browser_close,
            browser::browser_open_external,
            browser::browser_state,
            browser::browser_normalize_url,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { ref api, .. } = event { updates::on_quit(app_handle, api); }
            // Stop the engine (and the connectors it runs) when the app exits
            if matches!(event, tauri::RunEvent::Exit) {
                engine::shutdown_blocking();
                terminal::shutdown_all();
                browser::shutdown_all();
                motion::shutdown_all();
            }

            // macOS: Handle dock icon click — show and focus the main window
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                use tauri::Manager;
                info!("App reopen event (dock icon clicked), showing main window");
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            // On non-macOS platforms we don't currently use these args.
            #[cfg(not(target_os = "macos"))]
            {
                let _ = (&app_handle, &event);
            }
        });
}

/// A dev copy kept behind other windows (`VIBEWORK_DEV_BACKGROUND=1`) would
/// otherwise count as hidden: WebKit stops drawing a fully covered window, so
/// its page freezes and captures of it go stale. Debug-only WebKit switch.
#[cfg(target_os = "macos")]
fn keep_painting_when_covered(window: &tauri::WebviewWindow) {
    let _ = window.with_webview(|webview| {
        use objc2_new::runtime::AnyObject;
        let selector = objc2_new::sel!(_setWindowOcclusionDetectionEnabled:);
        // SAFETY: on macOS `inner()` is the window's WKWebView, alive for this call.
        let wk = unsafe { &*(webview.inner() as *const AnyObject) };
        if wk.class().responds_to(selector) {
            unsafe {
                let _: () = objc2_new::msg_send![wk, _setWindowOcclusionDetectionEnabled: false];
            }
        } else {
            tracing::warn!("WebKit has no occlusion switch; a covered dev window stops drawing");
        }
    });
}
