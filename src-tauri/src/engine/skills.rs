//! Which skill sources the engine loads (Settings → Skills).
//!
//! - Bundled skills (`<app data>/.vibework/skills`) always load, through the
//!   config's `skills` list.
//! - The app's user skills folder (`<app data>/skills`): listed in `skills`
//!   only when its switch is on.
//! - `~/.claude/skills`: discovered by OpenCode itself; off means
//!   `OPENCODE_DISABLE_CLAUDE_CODE=1` (process-wide, so a switch restarts the
//!   engine; it also drops `~/.claude/CLAUDE.md`, which OpenCode loads with it).
//! - `~/.agents/skills`: discovered by OpenCode itself with no switch in
//!   2.2.7. Off means a `skill` deny rule per skill in that folder: the engine
//!   leaves denied skills out of the catalogue and refuses to load them. (A
//!   plugin `skill.transform` cannot do it: it runs before the engine's own
//!   compatibility plugin adds those skills.)
//!
//! Every off source also gets the deny rules, as a second layer.

use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct SkillLaunch {
    pub claude: bool,
    pub agents: bool,
    pub user: bool,
}

pub fn agents_skills_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".agents").join("skills"))
}

impl SkillLaunch {
    pub fn engine_env(&self) -> Vec<(String, String)> {
        if self.claude {
            Vec::new()
        } else {
            vec![("OPENCODE_DISABLE_CLAUDE_CODE".into(), "1".into())]
        }
    }

    /// Extra skill folders for the config's `skills` list.
    pub fn skill_paths(&self) -> Vec<String> {
        let mut out = vec![crate::paths::get_skills_dir().to_string_lossy().to_string()];
        if self.user {
            out.push(crate::skills::user_skills_dir().to_string_lossy().to_string());
        }
        out
    }

    /// Skills to deny, by the id the engine uses (the skill's folder name;
    /// the frontmatter name is only a label, so a skill named differently
    /// from its folder would slip past a rule on its name): those of
    /// switched-off sources, except ids an enabled source (or the bundled
    /// set) also provides.
    pub fn denied_skill_ids(&self) -> Vec<String> {
        use crate::skills::{discover_in, SkillSource};
        let bundled = crate::paths::get_skills_dir();
        let user = crate::skills::user_skills_dir();
        let claude = crate::skills::claude_skills_dir();
        let agents = agents_skills_dir();
        let mut on: Vec<Vec<crate::skills::SkillInfo>> = vec![discover_in(&bundled, SkillSource::Bundled)];
        let mut off = Vec::new();
        for (enabled, source, dir) in [
            (self.user, SkillSource::User, Some(user)),
            (self.claude, SkillSource::Claude, claude),
            (self.agents, SkillSource::Agents, agents),
        ] {
            let Some(dir) = dir else { continue };
            let found = discover_in(&dir, source);
            if enabled { on.push(found) } else { off.push(found) }
        }
        denied_ids(&on, &off)
    }
}

/// The engine's id for a discovered skill: its folder's name.
fn engine_id(skill: &crate::skills::SkillInfo) -> Option<String> {
    std::path::Path::new(&skill.path).file_name().map(|n| n.to_string_lossy().to_string())
}

/// Ids of the skills in `off` sources that no `on` source also provides.
fn denied_ids(on: &[Vec<crate::skills::SkillInfo>], off: &[Vec<crate::skills::SkillInfo>]) -> Vec<String> {
    let ids = |lists: &[Vec<crate::skills::SkillInfo>]| -> std::collections::BTreeSet<String> {
        lists.iter().flatten().filter_map(engine_id).collect()
    };
    let keep = ids(on);
    ids(off).into_iter().filter(|id| !keep.contains(id)).collect()
}

/// The tag a skill chosen in the message box ("/" menu) is sent as.
pub const SKILL_TAG_OPEN: &str = "<vibe-work-skill>";
pub const SKILL_TAG_CLOSE: &str = "</vibe-work-skill>";
/// Most skills one message can attach.
const MAX_SKILLS_PER_MESSAGE: usize = 8;

/// Skill ids named in a message's `<vibe-work-skill>` tags, in order, once each.
pub fn tagged_skills(message: &str) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    for part in message.split(SKILL_TAG_OPEN).skip(1) {
        let Some((raw, _)) = part.split_once(SKILL_TAG_CLOSE) else { continue };
        let id = raw.trim().to_string();
        if !id.is_empty() && !ids.contains(&id) {
            ids.push(id);
        }
    }
    ids
}

/// The skills a message asks for, checked against the ones this app offers
/// (bundled, and sources switched on in Settings). The engine loads an
/// attached skill without consulting its `skill` deny rules, so a skill
/// whose source is off must never get this far.
pub fn requested_skills(message: &str, available: &[crate::skills::SkillChoice]) -> Result<Vec<String>, String> {
    let ids = tagged_skills(message);
    if ids.len() > MAX_SKILLS_PER_MESSAGE {
        return Err(format!("A message can use up to {MAX_SKILLS_PER_MESSAGE} skills."));
    }
    for id in &ids {
        if !available.iter().any(|skill| &skill.id == id) {
            return Err(format!("The “{id}” skill isn’t available. It may have been removed, or its folder switched off in Settings → Skills."));
        }
    }
    Ok(ids)
}

pub fn launch_settings() -> SkillLaunch {
    SkillLaunch {
        claude: crate::config::skill_source_enabled("claude"),
        agents: crate::config::skill_source_enabled("agents"),
        user: crate::config::skill_source_enabled("user"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::skills::{SkillChoice, SkillSource};

    fn choice(id: &str) -> SkillChoice {
        SkillChoice { id: id.into(), name: id.into(), description: "d".into(), source: SkillSource::Bundled }
    }

    #[test]
    fn switched_off_skills_are_denied_by_folder_not_label() {
        let root = std::env::temp_dir().join(format!("vw-denied-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let skill = |dir: &str, folder: &str, name: &str| {
            let path = root.join(dir).join(folder);
            std::fs::create_dir_all(&path).unwrap();
            std::fs::write(path.join("SKILL.md"), format!("---\nname: {name}\ndescription: d\n---\nbody\n")).unwrap();
        };
        // Off: a skill labelled differently from its folder, one an on source
        // also has (same folder), and one that only shares a label.
        skill("off", "folder-x", "Display X");
        skill("off", "shared", "Shared Label");
        skill("off", "z-folder", "plain-y");
        skill("on", "shared", "shared");
        skill("on", "other", "plain-y");
        let on = vec![crate::skills::discover_in(&root.join("on"), SkillSource::User)];
        let off = vec![crate::skills::discover_in(&root.join("off"), SkillSource::Agents)];
        let denied = denied_ids(&on, &off);
        let _ = std::fs::remove_dir_all(&root);
        // The engine's catalogue lists <id>folder-x</id><name>Display X</name>;
        // only a rule on the id removes it.
        assert_eq!(denied, ["folder-x", "z-folder"]);
    }

    #[test]
    fn reads_skill_tags_once_each_in_order() {
        let text = "<vibe-work-skill>vibework-slides</vibe-work-skill> make a deck <vibe-work-skill>humanizer</vibe-work-skill> <vibe-work-skill>vibework-slides</vibe-work-skill>";
        assert_eq!(tagged_skills(text), ["vibework-slides", "humanizer"]);
        assert!(tagged_skills("a /vibework-slides typed by hand").is_empty());
        assert!(tagged_skills("<vibe-work-skill>unclosed").is_empty());
    }

    #[test]
    fn only_offered_skills_pass() {
        let offered = [choice("vibework-slides")];
        assert_eq!(requested_skills("<vibe-work-skill>vibework-slides</vibe-work-skill>", &offered).unwrap(), ["vibework-slides"]);
        let err = requested_skills("<vibe-work-skill>far-away</vibe-work-skill> hi", &offered).unwrap_err();
        assert!(err.contains("far-away") && err.contains("Settings → Skills"), "{err}");
        assert!(requested_skills("plain text", &[]).unwrap().is_empty());
        let many: String = (0..9).map(|i| format!("<vibe-work-skill>s{i}</vibe-work-skill>")).collect();
        let offered: Vec<_> = (0..9).map(|i| choice(&format!("s{i}"))).collect();
        assert!(requested_skills(&many, &offered).is_err());
    }
}
