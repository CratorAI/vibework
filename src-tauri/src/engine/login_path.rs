//! Finder startup must not execute user shell startup files: they can read
//! protected folders, run arbitrary commands, or display native prompts.
use tokio::sync::OnceCell;
static LOGIN_SHELL_PATH: OnceCell<Option<String>> = OnceCell::const_new();

pub async fn login_shell_path() -> Option<String> {
    LOGIN_SHELL_PATH.get_or_init(|| async {
        Some("/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin".into())
    }).await.clone()
}

pub fn cached_login_shell_path() -> Option<String> {
    LOGIN_SHELL_PATH.get().cloned().flatten()
}
