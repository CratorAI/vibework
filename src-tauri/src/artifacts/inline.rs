//! In-memory HTML documents served on `artifact://localhost/~inline/<id>`.
//!
//! The frontend needs to render generated harness pages (a React component
//! wrapped with React + Babel from a CDN, Markdown, Mermaid) with inline
//! scripts. As `srcdoc` or `blob:` iframes those documents would inherit the
//! main window's CSP (which forbids inline scripts and CDNs) and, if the
//! `sandbox` attribute were ever forgotten, the app's privileged origin. Serving
//! them from the `artifact:` scheme instead gives them the artifact CSP and an
//! opaque origin regardless of how the iframe is written.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use once_cell::sync::Lazy;

use super::{ArtifactError, MAX_TEXT_BYTES};

/// Maximum documents kept; the oldest is evicted beyond this.
pub const MAX_INLINE_DOCS: usize = 32;
/// Maximum size of one inline document (8 MB: harness + inlined source).
pub const MAX_INLINE_BYTES: usize = 4 * MAX_TEXT_BYTES as usize;

struct Doc {
    id: String,
    owner: String,
    html: Arc<Vec<u8>>,
}

static DOCS: Lazy<Mutex<VecDeque<Doc>>> = Lazy::new(|| Mutex::new(VecDeque::new()));

fn docs() -> std::sync::MutexGuard<'static, VecDeque<Doc>> {
    DOCS.lock().unwrap_or_else(|p| p.into_inner())
}

pub fn insert(owner: &str, html: String) -> Result<String, ArtifactError> {
    if html.len() > MAX_INLINE_BYTES {
        return Err(ArtifactError::too_large(
            html.len() as u64,
            MAX_INLINE_BYTES as u64,
        ));
    }
    let id = uuid::Uuid::new_v4().simple().to_string();
    let mut docs = docs();
    while docs.len() >= MAX_INLINE_DOCS {
        docs.pop_front();
    }
    docs.push_back(Doc {
        id: id.clone(),
        owner: owner.to_string(),
        html: Arc::new(html.into_bytes()),
    });
    Ok(id)
}

pub fn get(id: &str) -> Option<Arc<Vec<u8>>> {
    docs().iter().find(|d| d.id == id).map(|d| d.html.clone())
}

pub fn remove(id: &str) {
    docs().retain(|d| d.id != id);
}

pub fn remove_owned_by(owner: &str) {
    docs().retain(|d| d.owner != owner);
}

/// Inline ids are 32 lowercase hex chars (uuid simple form).
pub fn valid_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_get_remove_and_evict() {
        let id = insert("test-owner-a", "<p>a</p>".into()).unwrap();
        assert!(valid_id(&id));
        assert_eq!(get(&id).unwrap().as_slice(), b"<p>a</p>");
        remove(&id);
        assert!(get(&id).is_none());

        let ids: Vec<_> = (0..MAX_INLINE_DOCS + 3)
            .map(|i| insert("test-owner-b", format!("{i}")).unwrap())
            .collect();
        // The oldest were evicted, the newest are present.
        assert!(get(&ids[0]).is_none());
        assert!(get(ids.last().unwrap()).is_some());
        remove_owned_by("test-owner-b");
        assert!(get(ids.last().unwrap()).is_none());
    }

    #[test]
    fn size_cap() {
        let e = insert("x", "a".repeat(MAX_INLINE_BYTES + 1)).unwrap_err();
        assert_eq!(e.code, "too_large");
    }
}
