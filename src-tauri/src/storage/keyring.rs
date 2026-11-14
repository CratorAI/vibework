use keyring::Entry;
use thiserror::Error;
use tracing::debug;

// On Windows, the target name (service) should be in a specific format
// Windows Credential Manager expects: domain, server, or generic target
#[cfg(target_os = "windows")]
const SERVICE_NAME: &str = "vibework-app";

#[cfg(not(target_os = "windows"))]
const SERVICE_NAME: &str = "vibe-work";

#[derive(Debug, Error)]
pub enum StorageError {
    #[cfg(any(debug_assertions, feature = "dev-release-probe"))]
    #[error("Development credential store failed")]
    DevStore,
    #[error("Keyring error: {0}")]
    Keyring(#[from] keyring::Error),
}

/// SecureStorage handles encrypted credential storage using the OS keychain.
/// - macOS: Keychain
/// - Windows: Credential Manager
/// - Linux: Secret Service (via libsecret)
///
/// Entries are stored under the service `{SERVICE_NAME}-{service}`.
pub struct SecureStorage;

impl SecureStorage {
    /// Store a generic credential
    pub fn set_password(service: &str, account: &str, password: &str) -> Result<(), StorageError> {
        #[cfg(any(debug_assertions, feature = "dev-release-probe"))]
        if let Some(path) = dev_path(service, account) {
            return dev_write(&path, password);
        }
        let full_service = format!("{}-{}", SERVICE_NAME, service);
        let entry = Entry::new(&full_service, account)?;
        entry.set_password(password)?;
        debug!("Password stored for {}:{}", service, account);
        Ok(())
    }

    /// Retrieve a generic credential
    pub fn get_password(service: &str, account: &str) -> Result<Option<String>, StorageError> {
        #[cfg(any(debug_assertions, feature = "dev-release-probe"))]
        if let Some(path) = dev_path(service, account) {
            return match std::fs::read_to_string(path) {
                Ok(value) => Ok(Some(value)),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
                Err(_) => Err(StorageError::DevStore),
            };
        }
        let full_service = format!("{}-{}", SERVICE_NAME, service);
        let entry = Entry::new(&full_service, account)?;
        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(StorageError::Keyring(e)),
        }
    }

    /// Delete a generic credential
    pub fn delete_password(service: &str, account: &str) -> Result<(), StorageError> {
        #[cfg(any(debug_assertions, feature = "dev-release-probe"))]
        if let Some(path) = dev_path(service, account) {
            return match std::fs::remove_file(path) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(_) => Err(StorageError::DevStore),
            };
        }
        let full_service = format!("{}-{}", SERVICE_NAME, service);
        let entry = Entry::new(&full_service, account)?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(StorageError::Keyring(e)),
        }
    }
}


#[cfg(any(debug_assertions, feature = "dev-release-probe"))]
pub(crate) fn dev_path(service: &str, account: &str) -> Option<std::path::PathBuf> {
    let root = std::env::var_os("VIBEWORK_DEV_DATA_DIR").map(std::path::PathBuf::from)?;
    // Invalid overrides must fail closed, never fall through to the real Keychain.
    let root = if root.is_absolute() { root } else { std::path::PathBuf::from("/dev/null") };
    Some(root.join("test-credentials").join(format!("{service}-{account}")))
}

#[cfg(any(debug_assertions, feature = "dev-release-probe"))]
fn dev_write(path: &std::path::Path, value: &str) -> Result<(), StorageError> {
    use std::io::Write;
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|_| StorageError::DevStore)?;
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)] {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path).and_then(|mut f| f.write_all(value.as_bytes())).map_err(|_| StorageError::DevStore)
}
