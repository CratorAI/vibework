//! Skill discovery.
//!
//! A skill is a folder containing a `SKILL.md` whose YAML frontmatter has a
//! `name` and `description` (the Claude Code format). Skills come from four
//! places, highest precedence first when names clash:
//!
//! 1. `user`    — `<app data>/skills`, created at startup. Outside `.vibework`,
//!                so re-unbundling bundled resources never touches it.
//! 2. `bundled` — `<app data>/.vibework/skills`, unbundled from the app.
//! 3. `claude`  — `~/.claude/skills`, read-only, if it exists. Below
//!                bundled, because those skills are written for Claude Code's
//!                tools, while bundled ones are what this app's tools refer to.
//! 4. `agents`  — `~/.agents/skills`, read-only, if it exists.
//!
//! Discovery is a cheap directory scan; the engine does its own discovery and
//! these lists feed Settings → Skills (see `engine::skills` for how the
//! switches reach the engine).

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tracing::{info, warn};

/// Longest description kept (Claude Code uses the same limit).
const MAX_DESCRIPTION_CHARS: usize = 1024;
/// Largest SKILL.md read (bytes).
const MAX_SKILL_FILE_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SkillSource {
    Bundled,
    User,
    Claude,
    /// `~/.agents/skills`
    Agents,
}

impl SkillSource {
    /// Id of the on/off switch for a personal source (bundled skills cannot be turned off).
    pub fn switch_id(self) -> Option<&'static str> {
        match self {
            SkillSource::Bundled => None,
            SkillSource::User => Some("user"),
            SkillSource::Claude => Some("claude"),
            SkillSource::Agents => Some("agents"),
        }
    }

    fn enabled(self) -> bool {
        self.switch_id().is_none_or(crate::config::skill_source_enabled)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub source: SkillSource,
    /// The skill's folder (the one containing SKILL.md).
    pub path: String,
}

/// Curated descriptions for bundled skills, used instead of their frontmatter
/// (they were tuned for this app's tool listing).
const BUNDLED_DESCRIPTIONS: &[(&str, &str)] = &[
    ("remotion-best-practices", "Best practices for Remotion - Video creation in React. Use when dealing with Remotion code for domain-specific knowledge."),
    ("skill-creator", "Guide for creating effective skills. Use when users want to create a new skill (or update an existing skill) that extends Claude's capabilities with specialized knowledge, workflows, or tool integrations."),
    ("vibework-pptx", "For explicitly requested PowerPoint files or existing .pptx editing; for general decks use vibework-slides. Streamlined PowerPoint creation and editing with camelCase API. Use for: (1) Creating new presentations from scratch with pptxgenjs, (2) Quick text replacements, (3) Editing existing presentations, (4) Exporting slides to images. Simpler than the pptx skill."),
    ("vibework-docx", "For explicitly requested Word files or existing .docx editing; for general documents use vibework-doc. Streamlined Word document creation and editing with camelCase API. Use for: (1) Creating new documents from scratch with docx-js, (2) Quick text replacements, (3) Editing existing documents with session workflow, (4) Working with tracked changes and comments, (5) Exporting pages to images. Simpler than the docx skill."),
    ("vibework-xlsx", "For advanced Excel templates and legacy workbook workflows. For new budgets and spreadsheets (including .xlsx) use vibework-sheet; the panel calculates formulas. Excel workbook creation and editing. When a template .xlsx is provided, ALWAYS use the template workflow (session.py). Use openpyxl for creating new spreadsheets with formulas, pandas for data analysis."),
    ("vibework-pdf", "PDF manipulation toolkit for filling forms, extracting text/tables, merging/splitting documents, and converting to images. Use for: (1) Filling PDF forms (fillable fields or annotations), (2) Extracting text and tables, (3) Merging/splitting PDFs, (4) Converting to images for analysis."),
];

// ============================================================================
// Locations
// ============================================================================

/// The user skills folder: `<app data>/skills`.
pub fn user_skills_dir() -> PathBuf {
    crate::paths::get_app_data_dir().join("skills")
}

/// `~/.claude/skills` (may not exist).
pub fn claude_skills_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("skills"))
}

/// Create the user skills folder if missing. Called at startup.
pub fn ensure_user_skills_dir() {
    let dir = user_skills_dir();
    if let Err(e) = fs::create_dir_all(&dir) {
        warn!("Could not create user skills folder {:?}: {}", dir, e);
    }
}

/// Every source the engine reads, in precedence order (highest first),
/// whether or not it is switched on.
fn all_sources() -> Vec<(SkillSource, PathBuf)> {
    let mut v = vec![
        (SkillSource::User, user_skills_dir()),
        (SkillSource::Bundled, crate::paths::get_skills_dir()),
    ];
    if let Some(dir) = claude_skills_dir() {
        v.push((SkillSource::Claude, dir));
    }
    if let Some(dir) = crate::engine::skills::agents_skills_dir() {
        v.push((SkillSource::Agents, dir));
    }
    v
}

/// Sources that are switched on, in precedence order.
fn sources() -> Vec<(SkillSource, PathBuf)> {
    all_sources().into_iter().filter(|(source, _)| source.enabled()).collect()
}

// ============================================================================
// Parsing
// ============================================================================

/// Split a SKILL.md into (frontmatter YAML, body). Errors when there is no
/// frontmatter block.
pub fn split_frontmatter(content: &str) -> Result<(&str, &str), String> {
    let content = content.strip_prefix('\u{feff}').unwrap_or(content);
    let mut lines = content.split_inclusive('\n');
    let first = lines.next().unwrap_or("");
    if first.trim_end() != "---" {
        return Err("SKILL.md does not start with a '---' frontmatter block".into());
    }
    let start = first.len();
    let mut offset = start;
    for line in lines {
        if line.trim_end() == "---" {
            let yaml = &content[start..offset];
            let body = &content[offset + line.len()..];
            return Ok((yaml, body));
        }
        offset += line.len();
    }
    Err("SKILL.md frontmatter is not closed with '---'".into())
}

/// A valid skill name: short, no control characters or markup.
fn valid_name(name: &str) -> bool {
    let n = name.chars().count();
    (1..=64).contains(&n)
        && name
            .chars()
            .all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | ' ' | ':'))
        && !name.starts_with(['.', ' ', '-'])
}

fn clean_description(text: &str) -> String {
    let collapsed = text
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    match collapsed.char_indices().nth(MAX_DESCRIPTION_CHARS) {
        Some((idx, _)) => format!("{}…", &collapsed[..idx]),
        None => collapsed,
    }
}

/// Parse name and description from SKILL.md content. `folder_name` is used
/// when the frontmatter has no `name`.
pub fn parse_skill_md(content: &str, folder_name: &str) -> Result<(String, String), String> {
    let (yaml, _) = split_frontmatter(content)?;
    let docs = yaml_rust2::YamlLoader::load_from_str(yaml)
        .map_err(|e| format!("invalid YAML frontmatter: {}", e))?;
    let doc = docs.first().ok_or("empty frontmatter")?;
    if doc.as_hash().is_none() {
        return Err("frontmatter is not a key/value map".into());
    }
    let name = match &doc["name"] {
        yaml_rust2::Yaml::String(s) => s.trim().to_string(),
        yaml_rust2::Yaml::BadValue => folder_name.to_string(),
        _ => return Err("'name' is not a string".into()),
    };
    if !valid_name(&name) {
        return Err(format!("invalid skill name {:?}", name));
    }
    let description = match &doc["description"] {
        yaml_rust2::Yaml::String(s) => clean_description(s),
        yaml_rust2::Yaml::BadValue => return Err("missing 'description'".into()),
        _ => return Err("'description' is not a string".into()),
    };
    if description.is_empty() {
        return Err("empty 'description'".into());
    }
    Ok((name, description))
}

/// Read the skills directly inside `dir`. Malformed skills are skipped with
/// a warning. A missing `dir` yields nothing.
pub fn discover_in(dir: &Path, source: SkillSource) -> Vec<SkillInfo> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut found: Vec<SkillInfo> = Vec::new();
    let mut paths: Vec<PathBuf> = entries.filter_map(|e| e.ok()).map(|e| e.path()).collect();
    paths.sort();
    for skill_dir in paths {
        // fs::metadata follows symlinks (common in ~/.claude/skills).
        if !fs::metadata(&skill_dir).map(|m| m.is_dir()).unwrap_or(false) {
            continue;
        }
        let folder_name = skill_dir
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if folder_name == "agent-browser" || folder_name.starts_with('.') {
            continue;
        }
        let skill_md = skill_dir.join("SKILL.md");
        let meta = match fs::metadata(&skill_md) {
            Ok(m) if m.is_file() => m,
            _ => continue, // not a skill folder
        };
        if meta.len() > MAX_SKILL_FILE_BYTES {
            warn!("[Skills] Skipping {:?}: SKILL.md is larger than 1 MB", skill_md);
            continue;
        }
        let content = match fs::read_to_string(&skill_md) {
            Ok(c) => c,
            Err(e) => {
                warn!("[Skills] Skipping {:?}: {}", skill_md, e);
                continue;
            }
        };
        let (name, mut description) = match parse_skill_md(&content, &folder_name) {
            Ok(v) => v,
            Err(e) => {
                warn!("[Skills] Skipping malformed {:?}: {}", skill_md, e);
                continue;
            }
        };
        if name == "agent-browser" { continue; }
        if source == SkillSource::Bundled {
            if let Some((_, curated)) = BUNDLED_DESCRIPTIONS.iter().find(|(n, _)| *n == name) {
                description = curated.to_string();
            }
        }
        if found.iter().any(|s| s.name.eq_ignore_ascii_case(&name)) {
            warn!("[Skills] Skipping {:?}: another skill in {:?} is already named {:?}", skill_md, dir, name);
            continue;
        }
        found.push(SkillInfo {
            name,
            description,
            source,
            path: skill_dir.to_string_lossy().to_string(),
        });
    }
    found
}

/// Merge per-source lists (given in precedence order); the first skill with
/// a given name (case-insensitive) wins. Result is sorted by name.
pub fn merge_sources(lists: Vec<Vec<SkillInfo>>) -> Vec<SkillInfo> {
    let mut merged: Vec<SkillInfo> = Vec::new();
    for list in lists {
        for skill in list {
            match merged.iter().find(|s| s.name.eq_ignore_ascii_case(&skill.name)) {
                Some(existing) => info!(
                    "[Skills] {:?} skill {:?} is overridden by the {:?} one at {}",
                    skill.source, skill.name, existing.source, existing.path
                ),
                None => merged.push(skill),
            }
        }
    }
    merged.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    merged
}

/// Discover skills from all sources, applying precedence.
pub fn discover_all() -> Vec<SkillInfo> {
    let lists = sources()
        .into_iter()
        .map(|(source, dir)| discover_in(&dir, source))
        .collect();
    merge_sources(lists)
}


// ============================================================================
// Skills a task can use (the message box's "/" menu)
// ============================================================================

/// A skill offered in the message box's "/" menu.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SkillChoice {
    /// The engine's id for the skill: its folder's name (OpenCode derives
    /// skill ids from the path; the frontmatter name is only a label).
    pub id: String,
    pub name: String,
    pub description: String,
    pub source: SkillSource,
}

/// Folder names usable as a skill id in a message: no markup, separators or
/// control characters, so the id survives the `<vibe-work-skill>` tag.
pub fn valid_skill_id(id: &str) -> bool {
    let n = id.chars().count();
    (1..=128).contains(&n)
        && !id.starts_with('.')
        && id.chars().all(|c| !c.is_control() && !c.is_whitespace() && !matches!(c, '<' | '>' | '/' | '\\' | '&' | '"'))
}

/// Skills from the bundled set and the sources that are switched on, one
/// per id (precedence as in `discover_all`), sorted by id. Sources that are
/// off are left out entirely.
pub fn available() -> Vec<SkillChoice> {
    let mut out: Vec<SkillChoice> = Vec::new();
    for skill in discover_all() {
        let Some(id) = Path::new(&skill.path).file_name().map(|n| n.to_string_lossy().to_string()) else { continue };
        if !valid_skill_id(&id) || out.iter().any(|c| c.id == id) {
            continue;
        }
        out.push(SkillChoice { id, name: skill.name, description: skill.description, source: skill.source });
    }
    out.sort_by(|a, b| a.id.to_lowercase().cmp(&b.id.to_lowercase()));
    out
}

// ============================================================================
// Source switches (Settings → Skills)
// ============================================================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSourceView {
    pub id: &'static str,
    pub path: String,
    pub enabled: bool,
    /// Skills found in the folder (whether or not the source is on).
    pub count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsSummary {
    pub sources: Vec<SkillSourceView>,
    /// Skills the model is offered (bundled plus the sources that are on, one per name).
    pub loaded: usize,
    /// Rough tokens the skill list adds to each task's first message.
    pub approx_tokens: usize,
}

/// Tokens for the catalogue entries the engine sends: id, name and
/// description in a few XML tags per skill, about 4 characters per token.
pub fn approx_catalogue_tokens(skills: &[SkillInfo]) -> usize {
    const HEADER_CHARS: usize = 420;
    const ENTRY_TAG_CHARS: usize = 75;
    let chars: usize = skills.iter().map(|s| 2 * s.name.len() + s.description.len() + ENTRY_TAG_CHARS).sum();
    if skills.is_empty() { 0 } else { (HEADER_CHARS + chars) / 4 }
}

pub fn summary() -> SkillsSummary {
    let all = all_sources();
    let sources = all
        .iter()
        .filter_map(|(source, dir)| {
            source.switch_id().map(|id| SkillSourceView {
                id,
                path: dir.to_string_lossy().to_string(),
                enabled: source.enabled(),
                count: discover_in(dir, *source).len(),
            })
        })
        .collect();
    let loaded = discover_all();
    // The engine's skill catalogue lists every skill that is on.
    let approx_tokens = approx_catalogue_tokens(&loaded);
    SkillsSummary { sources, loaded: loaded.len(), approx_tokens }
}

// ============================================================================
// Tauri commands
// ============================================================================

#[tauri::command]
pub async fn skills_summary() -> SkillsSummary {
    tauri::async_runtime::spawn_blocking(summary).await.unwrap_or_else(|_| SkillsSummary { sources: Vec::new(), loaded: 0, approx_tokens: 0 })
}

/// Turn a personal skill source on or off. The engine restarts once no task
/// is running.
#[tauri::command]
pub async fn skills_set_source_enabled(id: String, enabled: bool) -> Result<SkillsSummary, String> {
    if !["user", "claude", "agents"].contains(&id.as_str()) {
        return Err(format!("Unknown skill source {id}"));
    }
    crate::config::set_skill_source_enabled(&id, enabled);
    crate::engine::on_skill_sources_changed();
    Ok(skills_summary().await)
}

/// Every skill in every source the engine reads, including sources
/// that are switched off (Settings lists them under their switch).
#[tauri::command]
pub fn skills_list() -> Vec<SkillInfo> {
    all_sources().into_iter().flat_map(|(source, dir)| discover_in(&dir, source)).collect()
}

/// The skills a task can use from the message box: bundled ones and those
/// of the sources that are switched on.
#[tauri::command]
pub async fn skills_available() -> Vec<SkillChoice> {
    tauri::async_runtime::spawn_blocking(available).await.unwrap_or_default()
}

#[tauri::command]
pub fn skills_folder_path() -> String {
    ensure_user_skills_dir();
    user_skills_dir().to_string_lossy().to_string()
}

#[tauri::command]
pub async fn skills_open_folder(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    ensure_user_skills_dir();
    let dir = user_skills_dir();
    // Same helper as app_reveal_in_finder: selects the folder in Finder/Explorer.
    app.opener()
        .reveal_item_in_dir(&dir)
        .map_err(|e| format!("Could not reveal the skills folder: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(tag: &str) -> Self {
            let dir = std::env::temp_dir().join(format!(
                "vibework-skills-test-{}-{}-{}",
                tag,
                std::process::id(),
                uuid::Uuid::new_v4()
            ));
            fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }

        fn skill(&self, folder: &str, content: &str) {
            let d = self.0.join(folder);
            fs::create_dir_all(&d).unwrap();
            fs::write(d.join("SKILL.md"), content).unwrap();
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn parses_frontmatter() {
        let md = "---\nname: my-skill\ndescription: Does a thing.\nlicense: MIT\n---\n# Body\n";
        assert_eq!(parse_skill_md(md, "folder").unwrap(), ("my-skill".into(), "Does a thing.".into()));
        // Quoted and folded descriptions.
        let md = "---\nname: \"q\"\ndescription: >\n  Line one\n  line two.\n---\n";
        assert_eq!(parse_skill_md(md, "f").unwrap().1, "Line one line two.");
        // Name falls back to the folder name.
        let md = "---\ndescription: x\n---\n";
        assert_eq!(parse_skill_md(md, "folder-name").unwrap().0, "folder-name");
        // CRLF and BOM.
        let md = "\u{feff}---\r\nname: crlf\r\ndescription: ok\r\n---\r\nbody";
        assert_eq!(parse_skill_md(md, "f").unwrap().0, "crlf");
    }

    #[test]
    fn rejects_malformed_frontmatter() {
        assert!(parse_skill_md("# no frontmatter", "f").is_err());
        assert!(parse_skill_md("---\nname: x\ndescription: y\n", "f").is_err());
        assert!(parse_skill_md("---\nname: x\n---\n", "f").is_err());
        assert!(parse_skill_md("---\nname: x\ndescription: \"\"\n---\n", "f").is_err());
        assert!(parse_skill_md("---\nname: [a, b]\ndescription: y\n---\n", "f").is_err());
        assert!(parse_skill_md("---\nname: x\ndescription: [1, 2]\n---\n", "f").is_err());
        assert!(parse_skill_md("---\n: : bad: [\n---\n", "f").is_err());
        assert!(parse_skill_md("---\n- just\n- a list\n---\n", "f").is_err());
        assert!(parse_skill_md("---\nname: \"</name><evil>\"\ndescription: y\n---\n", "f").is_err());
        assert!(parse_skill_md("---\nname: \"a\\nb\"\ndescription: y\n---\n", "f").is_err());
    }

    #[test]
    fn description_is_collapsed_and_capped() {
        let long = "word ".repeat(400);
        let md = format!("---\nname: x\ndescription: \"{}\"\n---\n", long);
        let (_, d) = parse_skill_md(&md, "f").unwrap();
        assert!(d.chars().count() <= MAX_DESCRIPTION_CHARS + 1);
    }

    #[test]
    fn discovery_skips_malformed_and_non_skill_folders() {
        let t = TempDir::new("discover");
        t.skill("good", "---\nname: good\ndescription: A good skill\n---\nbody");
        t.skill("bad-yaml", "---\nname: [\n---\n");
        t.skill("no-frontmatter", "just text");
        t.skill(".hidden", "---\nname: hidden\ndescription: h\n---\n");
        fs::create_dir_all(t.0.join("not-a-skill")).unwrap();
        fs::write(t.0.join("loose-file.md"), "x").unwrap();
        // Same name twice in one source: first (sorted) kept.
        t.skill("zz-dupe", "---\nname: GOOD\ndescription: dupe\n---\n");

        let found = discover_in(&t.0, SkillSource::User);
        assert_eq!(found.len(), 1, "{:?}", found);
        assert_eq!(found[0].name, "good");
        assert_eq!(found[0].source, SkillSource::User);
        assert_eq!(PathBuf::from(&found[0].path), t.0.join("good"));
        assert!(discover_in(&t.0.join("missing"), SkillSource::User).is_empty());
    }

    #[test]
    fn user_overrides_bundled_overrides_claude() {
        let user = TempDir::new("user");
        let claude = TempDir::new("claude");
        let bundled = TempDir::new("bundled");
        user.skill("pdf", "---\nname: vibework-pdf\ndescription: my own pdf skill\n---\n");
        claude.skill("pdf2", "---\nname: Vibework-PDF\ndescription: claude pdf\n---\n");
        claude.skill("notes", "---\nname: notes\ndescription: claude notes\n---\n");
        bundled.skill("vibework-pdf", "---\nname: vibework-pdf\ndescription: bundled pdf\n---\n");
        bundled.skill("notes", "---\nname: notes\ndescription: bundled notes\n---\n");
        bundled.skill("skill-creator", "---\nname: skill-creator\ndescription: frontmatter text\n---\n");

        // Same order as sources(): user, bundled, claude.
        let merged = merge_sources(vec![
            discover_in(&user.0, SkillSource::User),
            discover_in(&bundled.0, SkillSource::Bundled),
            discover_in(&claude.0, SkillSource::Claude),
        ]);
        let summary: Vec<(&str, SkillSource, &str)> = merged
            .iter()
            .map(|s| (s.name.as_str(), s.source, s.description.as_str()))
            .collect();
        assert_eq!(summary.len(), 3);
        assert_eq!(summary[0], ("notes", SkillSource::Bundled, "bundled notes"));
        assert_eq!(summary[1].0, "skill-creator");
        assert_eq!(summary[1].1, SkillSource::Bundled);
        assert!(summary[1].2.starts_with("Guide for creating effective skills"), "curated description used");
        assert_eq!(summary[2], ("vibework-pdf", SkillSource::User, "my own pdf skill"));
    }

    #[cfg(unix)]
    #[test]
    fn follows_symlinked_skill_folders() {
        let real = TempDir::new("real");
        let links = TempDir::new("links");
        real.skill("target", "---\nname: linked\ndescription: via symlink\n---\n");
        std::os::unix::fs::symlink(real.0.join("target"), links.0.join("linked")).unwrap();
        let found = discover_in(&links.0, SkillSource::Claude);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "linked");
    }

    #[test]
    fn source_serializes_lowercase() {
        let s = SkillInfo {
            name: "n".into(),
            description: "d".into(),
            source: SkillSource::Claude,
            path: "/p".into(),
        };
        assert_eq!(
            serde_json::to_value(&s).unwrap(),
            serde_json::json!({"name": "n", "description": "d", "source": "claude", "path": "/p"})
        );
    }

    #[test]
    fn all_bundled_skills_in_the_repo_parse() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../.vibework/skills");
        if !dir.exists() {
            return;
        }
        let expected = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name() != "agent-browser" && e.path().join("SKILL.md").is_file())
            .count();
        let found = discover_in(&dir, SkillSource::Bundled);
        assert_eq!(found.len(), expected, "{:?}", found);
        assert!(!found.iter().any(|s| s.name == "agent-browser"));
    }

    #[test]
    fn user_skills_dir_is_outside_the_unbundled_tree() {
        let user = user_skills_dir();
        let bundled = crate::paths::get_skills_dir();
        let vibework = crate::paths::get_vibework_dir();
        assert!(!user.starts_with(&vibework), "{:?} must not be inside {:?}", user, vibework);
        assert_ne!(user, bundled);
    }
}
