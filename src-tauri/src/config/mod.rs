use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::RwLock;
use tracing::{debug, error, info};

const CONFIG_FILE_NAME: &str = "config.json";

/// Application configuration stored in config.json
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    /// Whether overlay notifications are enabled
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notifications_enabled: Option<bool>,

    /// Default working directory for vibework
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_working_directory: Option<String>,

    /// Whether the user has completed the onboarding flow
    #[serde(skip_serializing_if = "Option::is_none")]
    pub onboarding_completed: Option<bool>,

    /// Agent-browser installation status
    /// - "uninitialized": Installation not started
    /// - "installingbun": Bun installation in progress (or was interrupted, will retry)
    /// - "buninitialized": Bun installation completed successfully
    /// - "installingchromium": Chromium installation in progress
    /// - "chromiuminitialized": Chromium installation completed successfully
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_browser_status: Option<String>,

    /// OpenRouter model id used for new sessions (e.g. "deepseek/deepseek-v4.1-flash")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_permission_mode: Option<String>,

    /// Which service answers WebSearch: "openrouter" (default), "exa" or "brave".
    /// (Exa/Brave keys live in the OS keychain, never here.)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub web_search_provider: Option<String>,

    /// Personal skill sources that are off (ids: "claude", "agents", "user").
    /// Every source is on unless listed here.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disabled_skill_sources: Option<Vec<String>>,

    /// Folders the user started work in from home, most recent first.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recent_folders: Option<Vec<RecentFolder>>,

    /// Folders pinned to the top of the home folder picker, in pin order.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pinned_folders: Option<Vec<String>>,

    /// The folder home starts in (the last one chosen there); absent means no folder.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub home_folder: Option<String>,
}

/// A folder used from home, with when it was last used (ms since the epoch).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecentFolder {
    pub path: String,
    pub used_at: i64,
}

/// Recent folders kept in config.json
const RECENT_FOLDERS_MAX: usize = 20;

/// Global config state
static CONFIG: Lazy<RwLock<ConfigManager>> = Lazy::new(|| RwLock::new(ConfigManager::new()));

/// Manages loading and saving configuration
struct ConfigManager {
    config: AppConfig,
    config_path: Option<PathBuf>,
}

impl ConfigManager {
    fn new() -> Self {
        Self {
            config: AppConfig::default(),
            config_path: None,
        }
    }

    fn set_config_path(&mut self, path: PathBuf) {
        self.config_path = Some(path);
    }

    fn load(&mut self) -> AppConfig {
        if let Some(ref path) = self.config_path {
            if path.exists() {
                match fs::read_to_string(path) {
                    Ok(data) => match serde_json::from_str(&data) {
                        Ok(config) => {
                            self.config = config;
                            debug!("Config loaded from {:?}", path);
                        }
                        Err(e) => {
                            error!("Failed to parse config file: {}", e);
                        }
                    },
                    Err(e) => {
                        error!("Failed to read config file: {}", e);
                    }
                }
            } else {
                debug!("Config file does not exist, using defaults");
            }
        }
        self.config.clone()
    }

    fn save(&self) {
        if let Some(ref path) = self.config_path {
            // Ensure parent directory exists
            if let Some(parent) = path.parent() {
                if !parent.exists() {
                    if let Err(e) = fs::create_dir_all(parent) {
                        error!("Failed to create config directory: {}", e);
                        return;
                    }
                }
            }

            match serde_json::to_string_pretty(&self.config) {
                Ok(data) => {
                    if let Err(e) = fs::write(path, data) {
                        error!("Failed to write config file: {}", e);
                    } else {
                        debug!("Config saved to {:?}", path);
                    }
                }
                Err(e) => {
                    error!("Failed to serialize config: {}", e);
                }
            }
        }
    }

    fn get(&self) -> AppConfig {
        self.config.clone()
    }

    fn update<F>(&mut self, f: F)
    where
        F: FnOnce(&mut AppConfig),
    {
        f(&mut self.config);
        self.save();
    }
}

// ============================================================================
// Public API
// ============================================================================

/// Initialize the config system with the app data directory.
/// Must be called once at app startup with the Tauri app handle.
pub fn init(app_data_dir: PathBuf) {
    let config_path = app_data_dir.join(CONFIG_FILE_NAME);
    info!("Initializing config at {:?}", config_path);

    let mut manager = CONFIG.write().unwrap();
    manager.set_config_path(config_path);
    manager.load();

    // Ensure onboarding_completed defaults to false and config file is created
    if manager.config.onboarding_completed.is_none() {
        manager.update(|c| {
            c.onboarding_completed = Some(false);
        });
    }
}

/// Load and return the current configuration
#[allow(dead_code)]
pub fn load_config() -> AppConfig {
    let mut manager = CONFIG.write().unwrap();
    manager.load()
}

/// Save the entire configuration
#[allow(dead_code)]
pub fn save_config(config: &AppConfig) {
    let mut manager = CONFIG.write().unwrap();
    manager.config = config.clone();
    manager.save();
}

/// Get the current configuration (from cache)
pub fn get_config() -> AppConfig {
    let manager = CONFIG.read().unwrap();
    manager.get()
}

// ============================================================================
// Individual Getters and Setters
// ============================================================================

/// Get notifications enabled
pub fn get_notifications_enabled() -> bool {
    let config = get_config();
    config.notifications_enabled.unwrap_or(true)
}

/// Set notifications enabled
pub fn set_notifications_enabled(enabled: bool) {
    let mut manager = CONFIG.write().unwrap();
    manager.update(|c| {
        c.notifications_enabled = Some(enabled);
    });
}

/// Get default working directory
pub fn get_default_working_directory() -> String {
    let config = get_config();
    config.default_working_directory.unwrap_or_else(|| {
        // Default to Desktop/vibework using dirs crate for cross-platform support
        if let Some(desktop_dir) = dirs::desktop_dir() {
            desktop_dir
                .join("vibework")
                .to_string_lossy()
                .to_string()
        } else {
            // Fallback if desktop directory cannot be determined
            #[cfg(target_os = "windows")]
            {
                String::from("C:\\Users\\Default\\Desktop\\vibework")
            }
            #[cfg(not(target_os = "windows"))]
            {
                String::from("/tmp/vibework")
            }
        }
    })
}

/// Set default working directory
pub fn set_default_working_directory(dir: &str) {
    let mut manager = CONFIG.write().unwrap();
    manager.update(|c| {
        c.default_working_directory = Some(dir.to_string());
    });
    info!("Default working directory set to: {}", dir);
}

/// Get whether onboarding has been completed
pub fn get_onboarding_completed() -> bool {
    let config = get_config();
    config.onboarding_completed.unwrap_or(false)
}

/// Set whether onboarding has been completed
pub fn set_onboarding_completed(completed: bool) {
    let mut manager = CONFIG.write().unwrap();
    manager.update(|c| {
        c.onboarding_completed = Some(completed);
    });
    info!("Onboarding completed set to: {}", completed);
}

/// Get the default model id for new sessions
pub fn get_default_model() -> String {
    get_config()
        .default_model
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| crate::models::DEFAULT_MODEL.to_string())
}

/// Set the default model id for new sessions
pub fn set_default_model(model_id: &str) {
    let mut manager = CONFIG.write().unwrap();
    manager.update(|c| {
        c.default_model = Some(model_id.to_string());
    });
    info!("Default model set to: {}", model_id);
}

/// Get the stored WebSearch provider id (None = default)
pub fn get_web_search_provider() -> Option<String> {
    get_config().web_search_provider.filter(|p| !p.trim().is_empty())
}

/// Set the WebSearch provider id
pub fn set_web_search_provider(provider: &str) {
    let mut manager = CONFIG.write().unwrap();
    manager.update(|c| {
        c.web_search_provider = Some(provider.to_string());
    });
    info!("Web search provider set to: {}", provider);
}

/// Whether a personal skill source ("claude", "agents", "user") is on (default: on).
pub fn skill_source_enabled(id: &str) -> bool {
    !get_config().disabled_skill_sources.unwrap_or_default().iter().any(|s| s == id)
}

/// Turn a personal skill source on or off.
pub fn set_skill_source_enabled(id: &str, enabled: bool) {
    let mut manager = CONFIG.write().unwrap();
    manager.update(|c| {
        let mut off = c.disabled_skill_sources.take().unwrap_or_default();
        off.retain(|s| s != id);
        if !enabled {
            off.push(id.to_string());
        }
        c.disabled_skill_sources = if off.is_empty() { None } else { Some(off) };
    });
    info!("Skill source {} {}", id, if enabled { "on" } else { "off" });
}

pub fn get_default_permission_mode() -> crate::engine::policy::Mode {
    get_config().default_permission_mode.as_deref().and_then(|m|crate::engine::policy::Mode::parse(m).ok()).unwrap_or_default()
}
pub fn set_default_permission_mode(mode: crate::engine::policy::Mode) {
    CONFIG.write().unwrap().update(|c|c.default_permission_mode=Some(mode.name().into()));
}

/// Folders for the home folder picker: (recents, pinned, home folder).
pub fn get_folder_prefs() -> (Vec<RecentFolder>, Vec<String>, Option<String>) {
    let c = get_config();
    (c.recent_folders.unwrap_or_default(), c.pinned_folders.unwrap_or_default(), c.home_folder.filter(|f| !f.trim().is_empty()))
}

/// Move a folder to the front of the recents (adding it if new).
pub fn note_folder_used(path: &str, now_ms: i64) {
    CONFIG.write().unwrap().update(|c| c.recent_folders = Some(push_recent(c.recent_folders.take().unwrap_or_default(), path, now_ms)));
}

fn push_recent(mut list: Vec<RecentFolder>, path: &str, now_ms: i64) -> Vec<RecentFolder> {
    list.retain(|r| r.path != path);
    list.insert(0, RecentFolder { path: path.to_string(), used_at: now_ms });
    list.truncate(RECENT_FOLDERS_MAX);
    list
}

/// Pin or unpin a folder; pinned folders keep the order they were pinned in.
pub fn set_folder_pinned(path: &str, pinned: bool) {
    CONFIG.write().unwrap().update(|c| c.pinned_folders = toggle_pin(c.pinned_folders.take().unwrap_or_default(), path, pinned));
}

fn toggle_pin(mut list: Vec<String>, path: &str, pinned: bool) -> Option<Vec<String>> {
    list.retain(|p| p != path);
    if pinned {
        list.push(path.to_string());
    }
    if list.is_empty() { None } else { Some(list) }
}

/// The folder home starts in next time (None: no folder).
pub fn set_home_folder(path: Option<String>) {
    CONFIG.write().unwrap().update(|c| c.home_folder = path.filter(|p| !p.trim().is_empty()));
}

#[cfg(test)]
mod folder_tests {
    use super::*;

    #[test]
    fn recents_move_to_front_without_duplicates_and_cap() {
        let mut list = Vec::new();
        for i in 0..25 {
            list = push_recent(list, &format!("/f{i}"), i);
        }
        assert_eq!(list.len(), RECENT_FOLDERS_MAX);
        assert_eq!(list[0].path, "/f24");
        list = push_recent(list, "/f10", 99);
        assert_eq!(list[0], RecentFolder { path: "/f10".into(), used_at: 99 });
        assert_eq!(list.iter().filter(|r| r.path == "/f10").count(), 1);
    }

    #[test]
    fn pins_keep_order_and_clear_to_none() {
        let list = toggle_pin(vec![], "/a", true).unwrap();
        let list = toggle_pin(list, "/b", true).unwrap();
        assert_eq!(list, vec!["/a", "/b"]);
        let list = toggle_pin(list, "/a", true).unwrap();
        assert_eq!(list, vec!["/b", "/a"]);
        assert_eq!(toggle_pin(vec!["/b".into()], "/b", false), None);
    }

    #[test]
    fn old_config_without_folder_fields_still_parses() {
        let c: AppConfig = serde_json::from_str(r#"{"defaultWorkingDirectory":"/x","onboardingCompleted":true}"#).unwrap();
        assert!(c.recent_folders.is_none() && c.pinned_folders.is_none() && c.home_folder.is_none());
        let c: AppConfig = serde_json::from_str(r#"{"recentFolders":[{"path":"/a","usedAt":5}],"pinnedFolders":["/a"],"homeFolder":"/a"}"#).unwrap();
        assert_eq!(c.recent_folders.unwrap()[0].used_at, 5);
    }
}
