//! Separate service for app-bound credentials. Never delete the legacy item
//! until a read-back proves the replacement holds the same value.
use crate::storage::SecureStorage;
const LEGACY: &str = "openrouter";
const BOUND: &str = "openrouter-app";
const ACCOUNT: &str = "api-key";

trait Backend {
    fn read(&self, service: &str) -> Result<Option<String>, String>;
    fn write(&self, service: &str, value: &str) -> Result<(), String>;
    fn delete(&self, service: &str) -> Result<(), String>;
}
struct System;
impl Backend for System {
    fn read(&self, service: &str) -> Result<Option<String>, String> {
        SecureStorage::get_password(service, ACCOUNT).map_err(|_| "Could not read secure storage".into())
    }
    fn write(&self, service: &str, value: &str) -> Result<(), String> {
        #[cfg(any(debug_assertions, feature = "dev-release-probe"))]
        if std::env::var_os("VIBEWORK_DEV_DATA_DIR").is_some() {
            return SecureStorage::set_password(service, ACCOUNT, value).map_err(|_| "Could not write test storage".into());
        }
        #[cfg(target_os = "macos")]
        { super::credential_macos::write(service, ACCOUNT, value) }
        #[cfg(not(target_os = "macos"))]
        { SecureStorage::set_password(service, ACCOUNT, value).map_err(|_| "Could not write secure storage".into()) }
    }
    fn delete(&self, service: &str) -> Result<(), String> {
        SecureStorage::delete_password(service, ACCOUNT).map_err(|_| "Could not remove secure storage item".into())
    }
}
fn migrate(backend: &impl Backend) -> Result<Option<String>, String> {
    match backend.read(BOUND) {
        Ok(Some(key)) => return Ok(Some(key)),
        // A denied new-item read must not prevent use of a readable legacy item.
        Ok(None) | Err(_) => {}
    }
    let old = backend.read(LEGACY)?;
    if let Some(key) = &old {
        if backend.write(BOUND, key).is_ok()
            && backend.read(BOUND).ok().flatten().as_ref() == Some(key)
        {
            let _ = backend.delete(LEGACY);
        }
    }
    Ok(old)
}
pub fn load() -> Result<Option<String>, String> { migrate(&System) }
pub fn save(key: &str) -> Result<(), String> {
    System.write(BOUND, key)?;
    if System.read(BOUND)?.as_deref() != Some(key) {
        return Err("Could not verify the saved key".into());
    }
    // Do not allow an older key to return after removal.
    System.delete(LEGACY)?;
    Ok(())
}
pub fn remove() -> Result<(), String> {
    System.delete(LEGACY)?;
    System.delete(BOUND)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;
    struct Fake { items: RefCell<HashMap<String, String>>, failure: &'static str }
    impl Backend for Fake {
        fn read(&self, s: &str) -> Result<Option<String>, String> {
            if s == BOUND && self.failure == "read" { return Err("refused".into()); }
            Ok(self.items.borrow().get(s).cloned())
        }
        fn write(&self, s: &str, v: &str) -> Result<(), String> {
            if self.failure == "write" { return Err("refused".into()); }
            self.items.borrow_mut().insert(s.into(), if self.failure == "mismatch" { "different fixture".into() } else { v.into() }); Ok(())
        }
        fn delete(&self, s: &str) -> Result<(), String> {
            if self.failure == "delete" { return Err("refused".into()); }
            self.items.borrow_mut().remove(s); Ok(())
        }
    }
    #[test]
    fn migration_preserves_legacy_on_failure() {
        for failure in ["write", "read", "delete", "mismatch"] {
            let f = Fake { items: RefCell::new(HashMap::from([(LEGACY.into(), "fixture".into())])), failure };
            assert!(migrate(&f).unwrap().is_some());
            assert!(f.items.borrow().contains_key(LEGACY));
        }
    }
    #[test]
    fn migration_verifies_before_removing() {
        let f = Fake { items: RefCell::new(HashMap::from([(LEGACY.into(), "fixture".into())])), failure: "" };
        assert!(migrate(&f).unwrap().is_some());
        assert!(!f.items.borrow().contains_key(LEGACY));
        assert!(f.items.borrow().contains_key(BOUND));
    }
}
