//! Login-Keychain ACL explicitly trusting only the creating application.
//! SecAccessCreate(NULL trustedlist) means this app, not all applications.
use core_foundation::{base::{CFTypeRef, TCFType}, string::{CFString, CFStringRef}, array::CFArrayRef, dictionary::{CFDictionary, CFDictionaryRef}, data::CFData};
use std::ptr;
type Access = CFTypeRef;
#[link(name = "Security", kind = "framework")]
extern "C" {
    fn SecAccessCreate(description: CFStringRef, trusted: CFArrayRef, result: *mut Access) -> i32;
    fn SecItemAdd(attributes: CFDictionaryRef, result: *mut CFTypeRef) -> i32;
    fn SecItemUpdate(query: CFDictionaryRef, attributes: CFDictionaryRef) -> i32;
    static kSecClass: CFStringRef;
    static kSecClassGenericPassword: CFStringRef;
    static kSecAttrService: CFStringRef;
    static kSecAttrAccount: CFStringRef;
    static kSecAttrAccess: CFStringRef;
    static kSecValueData: CFStringRef;
}
pub fn write(service: &str, account: &str, value: &str) -> Result<(), String> {
    unsafe {
        let label = CFString::new("Vibework OpenRouter key");
        let mut access = ptr::null();
        let status = SecAccessCreate(label.as_concrete_TypeRef(), ptr::null(), &mut access);
        if status != 0 { return Err(format!("Could not create key access policy ({status})")); }
        let access = core_foundation::base::CFType::wrap_under_create_rule(access);
        let string = |s: CFStringRef| CFString::wrap_under_get_rule(s).as_CFType();
        let service = CFString::new(&format!("vibe-work-{service}"));
        let account = CFString::new(account);
        let data = CFData::from_buffer(value.as_bytes());
        let query = vec![
            (string(kSecClass), string(kSecClassGenericPassword)),
            (string(kSecAttrService), service.as_CFType()),
            (string(kSecAttrAccount), account.as_CFType()),
        ];
        let mut attrs = query.clone();
        attrs.push((string(kSecAttrAccess), access));
        attrs.push((string(kSecValueData), data.as_CFType()));
        let attrs = CFDictionary::from_CFType_pairs(&attrs);
        let status = SecItemAdd(attrs.as_concrete_TypeRef(), ptr::null_mut());
        let status = if status == -25299 {
            // Existing app-bound item's ACL is preserved, not replaced.
            let query = CFDictionary::from_CFType_pairs(&query);
            let changes = CFDictionary::from_CFType_pairs(&[(string(kSecValueData), data.as_CFType())]);
            SecItemUpdate(query.as_concrete_TypeRef(), changes.as_concrete_TypeRef())
        } else { status };
        if status != 0 { return Err(format!("Could not save app-bound key ({status})")); }
        Ok(())
    }
}
