use super::{Engine, Task};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Selection {
    pub engine: Engine,
    pub model: Option<String>,
    pub effort: Option<String>,
}
impl Selection {
    pub fn parse(key: &str) -> Self {
        let mut p = key.splitn(3, '|');
        let harness = p.next().unwrap_or("");
        let engine = super::selected(harness).unwrap_or(Engine::OpenCode);
        let decode = |s: &str| {
            percent_encoding::percent_decode_str(s)
                .decode_utf8_lossy()
                .to_string()
        };
        Self {
            engine,
            model: if engine == Engine::OpenCode {
                Some(key.into())
            } else {
                p.next().filter(|s| !s.is_empty()).map(decode)
            },
            effort: p.next().filter(|s| !s.is_empty()).map(decode),
        }
    }
    pub fn key(&self) -> String {
        if self.engine == Engine::OpenCode {
            return self
                .model
                .clone()
                .unwrap_or_else(|| crate::models::DEFAULT_MODEL.into());
        }
        let enc = |s: &str| {
            percent_encoding::utf8_percent_encode(s, percent_encoding::NON_ALPHANUMERIC).to_string()
        };
        if self.model.is_none() && self.effort.is_none() {
            self.engine.model().into()
        } else {
            format!(
                "{}|{}|{}",
                self.engine.model(),
                enc(self.model.as_deref().unwrap_or("")),
                enc(self.effort.as_deref().unwrap_or(""))
            )
        }
    }
}
#[derive(Clone, Default, Serialize, Deserialize)]
pub struct NativeSession {
    pub id: Option<String>,
    pub seen: usize,
}
impl Task {
    pub fn current(&self) -> Selection {
        Selection {
            engine: self.engine,
            model: self.model.clone(),
            effort: self.effort.clone(),
        }
    }
    pub fn choice(&self) -> Selection {
        self.pending.clone().unwrap_or_else(|| self.current())
    }
    pub fn migrate(&mut self) {
        if self.natives.is_empty() {
            self.natives.insert(
                self.engine.model().into(),
                NativeSession {
                    id: self.native.clone(),
                    seen: self.messages.len(),
                },
            );
        }
    }
    pub fn choose(&mut self, choice: Selection, busy: bool, waiting: bool) -> Result<(), String> {
        if busy || waiting {
            return Err(
                "Stop this task and resolve its pending prompt before changing models.".into(),
            );
        }
        self.pending = if choice == self.current() {
            None
        } else {
            Some(choice)
        };
        Ok(())
    }
    pub fn activate(&mut self) {
        if let Some(choice) = self.pending.take() {
            self.engine = choice.engine;
            self.model = choice.model;
            self.effort = choice.effort;
            self.native = self
                .natives
                .get(self.engine.model())
                .and_then(|n| n.id.clone());
        }
    }
    pub fn handoff_cursor(&self) -> usize {
        self.natives
            .get(self.engine.model())
            .filter(|n| n.id.is_some())
            .map_or(0, |n| n.seen)
    }
    pub fn checkpoint(&mut self) {
        self.natives.insert(
            self.engine.model().into(),
            NativeSession {
                id: self.native.clone(),
                seen: self.messages.len(),
            },
        );
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn legacy() -> Task {
        serde_json::from_value(json!({"id":"t","engine":"codex","name":"task","folder":"/tmp","mode":"ask","native":"old-native","created":"now","updated":"now","settled":null,"messages":[{"role":"user","content":[]}]})).unwrap()
    }
    #[test]
    fn migrate_preserves_history_and_native() {
        let mut t = legacy();
        t.migrate();
        assert_eq!(t.natives["agent:codex"].id.as_deref(), Some("old-native"));
        assert_eq!(t.natives["agent:codex"].seen, 1);
        t.migrate();
        assert_eq!(t.messages.len(), 1);
    }
    #[test]
    fn selection_encoding_roundtrip() {
        for key in [
            "agent:codex|gpt%2Dtest|medium",
            "agent:claude-code",
            "deepseek/test",
        ] {
            let s = Selection::parse(key);
            assert_eq!(Selection::parse(&s.key()), s);
        }
    }
    #[test]
    fn switch_is_pending_until_start_and_returns_to_native() {
        let mut t = legacy();
        t.migrate();
        let old = t.current();
        t.choose(Selection::parse("agent:claude-code"), false, false)
            .unwrap();
        assert_eq!(t.current(), old);
        t.activate();
        assert_eq!(t.native, None);
        t.native = Some("claude-native".into());
        t.checkpoint();
        t.choose(old, false, false).unwrap();
        t.activate();
        assert_eq!(t.native.as_deref(), Some("old-native"));
        assert_eq!(t.natives.len(), 2);
    }
    #[test]
    fn busy_or_pending_prompt_refused() {
        for (busy, waiting) in [(true, false), (false, true), (true, true)] {
            let mut t = legacy();
            assert!(t
                .choose(Selection::parse("agent:claude-code"), busy, waiting)
                .is_err());
            assert!(t.pending.is_none());
        }
        let mut t = legacy();
        assert!(t
            .choose(Selection::parse("agent:claude-code"), false, false)
            .is_ok());
    }
    #[test]
    fn history_without_a_native_session_needs_a_full_handoff() {
        let mut t = legacy();
        t.native = None;
        t.migrate();
        assert_eq!(t.handoff_cursor(), 0);
        t.native = Some("started".into());
        t.checkpoint();
        assert_eq!(t.handoff_cursor(), 1);
    }
}
