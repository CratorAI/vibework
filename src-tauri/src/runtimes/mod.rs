//! Runtimes that task commands, skill scripts and connectors run with. Small
//! launcher scripts in `<app data>/runtimes/bin` go last on their PATH (a
//! runtime the user installed comes first):
//!
//! - `vibework-js` runs JavaScript and TypeScript with the Bun runtime built
//!   into the engine binary (a Bun-compiled executable behaves as plain Bun
//!   when `BUN_BE_BUN=1` is set), so nothing extra ships or downloads. `bun`,
//!   `bunx` and `npx` are aliases of it. The variable stays set for the
//!   script, so a script that starts `process.execPath` again (fork, a
//!   package's own CLI) gets Bun too.
//! - `uv` (and `uvx`) runs the uv pinned in `scripts/runtimes-manifest.json`.
//!   It is not bundled: the first command that runs it downloads the pinned
//!   archive into `<app data>/runtimes/uv-<version>`, checks both SHA-256
//!   digests, and only then puts the binary in place; later runs start it
//!   directly. A failed download or a digest mismatch prints a plain message
//!   (offline, or the file was not the expected one) instead of "command not
//!   found". Nothing downloads at app start or for tasks that never run it.
//!   A uv an older app version bundled is moved there when its digest matches.
//!
//! The launchers are written at startup with the engine's and the app data's
//! current paths (the app may have moved), and only when their text changes.

use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

/// Versions, archive URLs and digests of what the app downloads on first use.
const MANIFEST: &str = include_str!("../../../scripts/runtimes-manifest.json");

/// One pinned download for this Mac.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pinned {
    pub version: String,
    pub url: String,
    /// SHA-256 of the archive.
    pub sha256: String,
    /// Path of the binary inside the archive.
    pub member: String,
    /// SHA-256 of that binary.
    pub binary_sha256: String,
}

fn target_triple() -> &'static str {
    if cfg!(target_arch = "aarch64") { "aarch64-apple-darwin" } else { "x86_64-apple-darwin" }
}

/// The pinned entry `name` of `manifest` for `target`.
fn pinned_in(manifest: &str, name: &str, target: &str) -> Option<Pinned> {
    let doc: serde_json::Value = serde_json::from_str(manifest).ok()?;
    let entry = &doc[name];
    let artifact = &entry["artifacts"][target];
    let text = |v: &serde_json::Value| v.as_str().map(str::to_string);
    Some(Pinned {
        version: text(&entry["version"])?,
        url: text(&artifact["url"])?,
        sha256: text(&artifact["sha256"])?,
        member: text(&artifact["path"])?,
        binary_sha256: text(&artifact["binarySha256"])?,
    })
}

/// The uv this app pins, for this Mac.
pub fn pinned_uv() -> Option<Pinned> {
    pinned_in(MANIFEST, "uv", target_triple())
}

/// Where the pinned uv lives once downloaded.
fn uv_dir(root: &Path, version: &str) -> PathBuf {
    root.join(format!("uv-{version}"))
}

/// Written next to a downloaded binary once both digests matched.
const VERIFIED: &str = ".verified";

/// `<app data>/runtimes`.
pub fn runtimes_dir() -> PathBuf {
    crate::paths::get_app_data_dir().join("runtimes")
}

/// The folder of launchers that goes on the commands' PATH.
pub fn bin_dir() -> PathBuf {
    runtimes_dir().join("bin")
}

/// Quote for POSIX sh: the whole text in single quotes.
fn sh_quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', r"'\''"))
}

/// `vibework-js`: Bun from the engine binary at `engine`.
pub fn js_launcher(engine: &Path) -> String {
    let engine = sh_quote(&engine.to_string_lossy());
    format!(
        r#"#!/bin/sh
# Vibework: runs JavaScript and TypeScript with the Bun runtime built into the
# app's engine (Bun's own commands and options: run, x, add, install, -e, ...).
# Written by Vibework at startup; changes are overwritten.
engine={engine}
if [ ! -x "$engine" ]; then
  echo "vibework-js: Vibework's JavaScript runtime is missing ($engine). Reopen Vibework, then try again." >&2
  exit 1
fi
BUN_BE_BUN=1 exec "$engine" "$@"
"#
    )
}

/// A launcher that runs another one in the same folder, with `args` first.
fn alias_launcher(target: &str, args: &[&str]) -> String {
    let args: String = args.iter().map(|a| format!(" {}", sh_quote(a))).collect();
    format!(
        r#"#!/bin/sh
# Vibework: same as `{target}{plain}`. Written by Vibework at startup.
exec "$(dirname "$0")/{target}"{args} "$@"
"#,
        plain = args.replace('\'', "")
    )
}

/// A launcher for the pinned download `name` kept in `dir`: runs it, first
/// downloading and checking it when it is not there yet. `what` names it for
/// people ("Python tools"), `size` is the download's rough size.
/// `setup` is shell run first on every call (e.g. environment for the tool).
pub fn download_launcher(name: &str, what: &str, pinned: &Pinned, dir: &Path, size: &str, setup: &str) -> String {
    let q = |t: &str| sh_quote(t);
    let label = format!("{name} {}", pinned.version);
    let offline = format!("{what} need a one-time download ({label}, {size}) and you appear to be offline. Connect to the internet, then try again.");
    let mismatch = format!("{what} need a one-time download ({label}), but the file that arrived is not the one Vibework expects, so it was not used. Try again; if this keeps happening, something on this network is changing downloads.");
    format!(
        r#"#!/bin/sh
# Vibework: {label}. Not bundled with the app: the first command that needs it
# downloads it once, checks it against the SHA-256 digests pinned in the app,
# and only then puts it in place. Written by Vibework at startup.
{setup}dir={dir}
bin="$dir/{name}"
if [ ! -x "$bin" ] || [ ! -f "$dir/{VERIFIED}" ]; then
  url={url}
  archive_sha={archive_sha}
  member={member}
  binary_sha={binary_sha}
  offline={offline}
  mismatch={mismatch}
  fail() {{ echo "$1" >&2; exit 1; }}
  mkdir -p "$dir" 2>/dev/null || fail "{what} need a one-time download, but Vibework can't write to $dir."
  lock="$dir/.download"
  waited=0
  # One download at a time; a lock left for over 10 minutes was abandoned.
  while ! mkdir "$lock" 2>/dev/null; do
    if [ -x "$bin" ] && [ -f "$dir/{VERIFIED}" ]; then exec "$bin" "$@"; fi
    if [ -n "$(find "$lock" -maxdepth 0 -mmin +10 2>/dev/null)" ]; then rmdir "$lock" 2>/dev/null; continue; fi
    waited=$((waited + 1))
    [ "$waited" -gt 900 ] && fail "{what} are still downloading for another task. Try again in a moment."
    sleep 1
  done
  tmp=$(mktemp -d "${{TMPDIR:-/tmp}}/vibework-{name}.XXXXXX") || {{ rmdir "$lock"; fail "{what} need a one-time download, but there is no room for it right now."; }}
  finish() {{ rm -rf "$tmp"; rmdir "$lock" 2>/dev/null; }}
  if [ ! -x "$bin" ] || [ ! -f "$dir/{VERIFIED}" ]; then
    echo "Vibework is downloading {what} ({label}, {size}). This happens once." >&2
    /usr/bin/curl -fsL --proto '=https' --retry 2 --connect-timeout 30 --max-time 900 -o "$tmp/archive" "$url"
    code=$?
    if [ "$code" -ne 0 ]; then
      finish
      case "$code" in
        5|6|7|28|35|52|55|56) fail "$offline" ;;
        *) fail "{what} need a one-time download ({label}), and it failed (curl error $code). Try again in a moment." ;;
      esac
    fi
    got=$(/usr/bin/shasum -a 256 "$tmp/archive" | /usr/bin/cut -d ' ' -f 1)
    [ "$got" = "$archive_sha" ] || {{ finish; fail "$mismatch"; }}
    /usr/bin/tar -xzf "$tmp/archive" -C "$tmp" "$member" 2>/dev/null || {{ finish; fail "$mismatch"; }}
    got=$(/usr/bin/shasum -a 256 "$tmp/$member" | /usr/bin/cut -d ' ' -f 1)
    [ "$got" = "$binary_sha" ] || {{ finish; fail "$mismatch"; }}
    if chmod 755 "$tmp/$member" && mv -f "$tmp/$member" "$bin.partial" && mv -f "$bin.partial" "$bin" && printf '%s\n' "$binary_sha" > "$dir/{VERIFIED}"; then
      echo "{what} are ready." >&2
    else
      finish
      fail "{what} need a one-time download, but Vibework can't write to $dir."
    fi
  fi
  finish
fi
exec "$bin" "$@"
"#,
        dir = q(&dir.to_string_lossy()),
        url = q(&pinned.url),
        archive_sha = q(&pinned.sha256),
        member = q(&pinned.member),
        binary_sha = q(&pinned.binary_sha256),
        offline = q(&offline),
        mismatch = q(&mismatch),
    )
}

/// Which Python `uv` may use, unless the person chose (`UV_PYTHON_PREFERENCE`
/// already set). On a Mac without Apple's command line tools,
/// /usr/bin/python3 is a stub that opens the "install developer tools" dialog
/// when anything runs it, uv's interpreter probe included. So a system Python
/// is preferred only when the developer tools hold a real python3 and the
/// shim runs it (checked only after that, so the stub never runs); otherwise
/// uv uses its own managed Python (downloaded once, about 20 MB).
pub const UV_PYTHON_SETUP: &str = r#"if [ -z "${UV_PYTHON_PREFERENCE:-}" ]; then
  tools=$(/usr/bin/xcode-select -p 2>/dev/null)
  if [ -n "$tools" ] && [ -x "$tools/usr/bin/python3" ] && /usr/bin/python3 -c '' >/dev/null 2>&1; then
    UV_PYTHON_PREFERENCE=system
  else
    UV_PYTHON_PREFERENCE=only-managed
  fi
  export UV_PYTHON_PREFERENCE
fi
"#;

/// The agent's `hyperframes` command. Like the Python tools, the package is
/// not bundled: the first command that needs it downloads the pinned version
/// once into the same folder the Motion panel uses, so neither the agent nor
/// the person has to set anything up first.
fn hyperframes_launcher(engine: &Path, dir: &Path) -> String {
    let q = |p: PathBuf| sh_quote(&p.to_string_lossy());
    format!(
        r#"#!/bin/sh
# Vibework: HyperFrames 0.9.41. Written by Vibework at startup.
export HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_SKIP_SKILLS=1
dir={dir}
export HYPERFRAMES_CACHE_DIR="$dir/browser"
export HYPERFRAMES_CONFIG_DIR="$dir/config"
cli="$dir/node_modules/hyperframes/bin/hyperframes.mjs"
engine={engine}
if [ ! -f "$cli" ]; then
  fail() {{ echo "$1" >&2; exit 1; }}
  mkdir -p "$dir" 2>/dev/null || fail "HyperFrames needs a one-time download, but Vibework can't write to $dir."
  lock="$dir/.download"
  waited=0
  # One download at a time; a lock left for over 15 minutes was abandoned.
  while ! mkdir "$lock" 2>/dev/null; do
    [ -f "$cli" ] && break
    if [ -n "$(find "$lock" -maxdepth 0 -mmin +15 2>/dev/null)" ]; then rmdir "$lock" 2>/dev/null; continue; fi
    waited=$((waited + 1))
    [ "$waited" -gt 900 ] && fail "HyperFrames is still downloading for another task. Try again in a moment."
    sleep 1
  done
  if [ ! -f "$cli" ]; then
    trap 'rmdir "$lock" 2>/dev/null' EXIT INT TERM
    echo "Downloading HyperFrames 0.9.41 (one time, about 420 MB). It is Apache-2.0 licensed and includes GSAP under GSAP's own licence." >&2
    printf '%s' '{{"private":true,"dependencies":{{"hyperframes":"0.9.41"}}}}' > "$dir/package.json"
    (cd "$dir" && BUN_BE_BUN=1 BUN_INSTALL_CACHE_DIR="$dir/packages" CI=1 NO_COLOR=1 "$engine" install --ignore-scripts >&2) \
      || fail "HyperFrames could not be downloaded. Check the internet connection, then try again."
    [ -f "$cli" ] || fail "HyperFrames could not be downloaded. Try again."
    rmdir "$lock" 2>/dev/null
    trap - EXIT INT TERM
  fi
fi
BUN_BE_BUN=1 exec "$engine" "$cli" "$@"
"#,
        dir = q(dir.to_path_buf()),
        engine = q(engine.to_path_buf()),
    )
}

/// The launchers to write, by file name; pinned downloads are kept under
/// `runtimes`.
pub fn launchers(engine: &Path, runtimes: &Path) -> Vec<(&'static str, String)> {
    let mut out = vec![
        ("hyperframes", hyperframes_launcher(engine, &runtimes.join("hyperframes-0.9.41"))),
        ("vibework-js", js_launcher(engine)),
        ("bun", alias_launcher("vibework-js", &[])),
        ("bunx", alias_launcher("vibework-js", &["x"])),
        ("npx", alias_launcher("vibework-js", &["x"])),
    ];
    if let Some(uv) = pinned_uv() {
        out.push(("uv", download_launcher("uv", "Python tools", &uv, &uv_dir(runtimes, &uv.version), "about 20 MB", UV_PYTHON_SETUP)));
        out.push(("uvx", alias_launcher("uv", &["tool", "uvx"])));
    }
    out
}

fn sha256_file(path: &Path) -> std::io::Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher)?;
    Ok(format!("{:x}", hasher.finalize()))
}

/// Keep only the pinned uv: reuse the copy an older app version bundled in
/// `old_scripts` (moved, when its digest matches), drop that old folder and
/// other uv versions, and recheck a copy that is not marked verified.
fn tidy_uv(runtimes: &Path, old_scripts: &Path, pinned: &Pinned) {
    let dir = uv_dir(runtimes, &pinned.version);
    let bin = dir.join("uv");
    let stamp = dir.join(VERIFIED);
    let matches = |path: &Path| sha256_file(path).is_ok_and(|d| d == pinned.binary_sha256);
    let stamped = || std::fs::read_to_string(&stamp).is_ok_and(|s| s.trim() == pinned.binary_sha256);
    let old_uv = old_scripts.join("uv");
    if !(bin.is_file() && stamped()) && old_uv.is_file() && matches(&old_uv) {
        let moved = std::fs::create_dir_all(&dir)
            .and_then(|_| std::fs::rename(&old_uv, &bin).or_else(|_| std::fs::copy(&old_uv, &bin).map(|_| ())))
            .and_then(|_| std::fs::write(&stamp, format!("{}\n", pinned.binary_sha256)));
        match moved {
            Ok(()) => tracing::info!("[Runtimes] Reusing the uv {} an earlier version bundled", pinned.version),
            Err(e) => tracing::warn!("[Runtimes] Could not reuse the earlier uv: {e}"),
        }
    }
    if old_scripts.is_dir() {
        // bun, uv and the npx shim earlier versions copied here (~100 MB).
        match std::fs::remove_dir_all(old_scripts) {
            Ok(()) => tracing::info!("[Runtimes] Removed the runtimes an earlier version bundled"),
            Err(e) => tracing::warn!("[Runtimes] Could not remove {}: {e}", old_scripts.display()),
        }
    }
    if bin.is_file() && !stamped() {
        if matches(&bin) {
            let _ = std::fs::write(&stamp, format!("{}\n", pinned.binary_sha256));
        } else {
            tracing::warn!("[Runtimes] The uv in {} does not match its pinned digest; it will be downloaded again when needed", dir.display());
            let _ = std::fs::remove_file(&bin);
        }
    }
    let current = format!("uv-{}", pinned.version);
    for entry in std::fs::read_dir(runtimes).into_iter().flatten().flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("uv-") && name != current && entry.path().is_dir() {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

/// Write `text` to `path` (mode 0755) unless it already holds exactly that.
fn write_if_changed(path: &Path, text: &str) -> std::io::Result<bool> {
    if std::fs::read_to_string(path).is_ok_and(|current| current == text) {
        return Ok(false);
    }
    let staging = path.with_extension("tmp");
    std::fs::write(&staging, text)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&staging, std::fs::Permissions::from_mode(0o755))?;
    }
    std::fs::rename(&staging, path)?;
    Ok(true)
}

/// Put the launchers in place (startup, before the engine and connectors).
/// Downloads nothing.
pub fn install() -> Result<(), String> {
    let engine = crate::engine::sidecar::binary_path()?;
    let runtimes = runtimes_dir();
    let bin = bin_dir();
    std::fs::create_dir_all(&bin).map_err(|e| format!("Cannot create {}: {e}", bin.display()))?;
    if let Some(uv) = pinned_uv() {
        tidy_uv(&runtimes, &crate::paths::get_vibework_dir().join("scripts"), &uv);
    }
    for (name, text) in launchers(&engine, &runtimes) {
        if write_if_changed(&bin.join(name), &text).map_err(|e| format!("Cannot write the {name} launcher: {e}"))? {
            tracing::info!("[Runtimes] Wrote the {name} launcher");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    /// The HyperFrames launcher is valid shell, runs an installed copy with
    /// the person's arguments, and downloads through the engine when missing.
    #[test]
    fn hyperframes_launcher_runs_or_downloads() {
        let root = temp("hf");
        let dir = root.join("hyperframes-0.9.41");
        // A stand-in engine: "install" creates the CLI file, anything else echoes.
        let engine = root.join("engine");
        std::fs::write(&engine, "#!/bin/sh\nif [ \"$1\" = install ]; then mkdir -p node_modules/hyperframes/bin && : > node_modules/hyperframes/bin/hyperframes.mjs; else shift; echo \"ran $*\"; fi\n").unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&engine, std::fs::Permissions::from_mode(0o755)).unwrap();
        let script = root.join("hyperframes");
        std::fs::write(&script, hyperframes_launcher(&engine, &dir)).unwrap();
        assert!(Command::new("/bin/sh").arg("-n").arg(&script).status().unwrap().success());
        let first = Command::new("/bin/sh").arg(&script).args(["lint", "film"]).output().unwrap();
        assert!(first.status.success(), "{}", String::from_utf8_lossy(&first.stderr));
        assert_eq!(String::from_utf8_lossy(&first.stdout).trim(), "ran lint film");
        assert!(String::from_utf8_lossy(&first.stderr).contains("Downloading HyperFrames"));
        assert!(!dir.join(".download").exists());
        let second = Command::new("/bin/sh").arg(&script).args(["check", "film"]).output().unwrap();
        assert_eq!(String::from_utf8_lossy(&second.stdout).trim(), "ran check film");
        assert!(second.stderr.is_empty());
        let _ = std::fs::remove_dir_all(&root);
    }

    fn temp(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("vw-runtimes-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn executable(path: &Path, text: &str) {
        std::fs::write(path, text).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
    }

    fn fake_pinned(url: &str, binary_sha256: &str) -> Pinned {
        Pinned { version: "9.9.9".into(), url: url.into(), sha256: "0".repeat(64), member: "uv-x/uv".into(), binary_sha256: binary_sha256.into() }
    }

    #[test]
    fn manifest_pins_uv_for_both_macs() {
        for target in ["aarch64-apple-darwin", "x86_64-apple-darwin"] {
            let uv = pinned_in(MANIFEST, "uv", target).unwrap();
            assert!(uv.url.starts_with("https://github.com/astral-sh/uv/releases/download/"), "{uv:?}");
            assert_eq!((uv.sha256.len(), uv.binary_sha256.len()), (64, 64));
        }
        assert!(pinned_in(MANIFEST, "bun", "aarch64-apple-darwin").is_none(), "bun is not downloaded or bundled");
        assert_eq!(pinned_uv().unwrap().version, "0.9.11");
    }

    /// Unreachable download: a plain "offline" message, nothing put in place,
    /// no lock left behind; a copy in place runs at once without a download.
    #[test]
    fn uv_launcher_reports_offline_and_runs_an_installed_copy() {
        let root = temp("uv");
        let dir = root.join("uv-9.9.9");
        let launcher = root.join("uv");
        executable(&launcher, &download_launcher("uv", "Python tools", &fake_pinned("https://127.0.0.1:9/uv.tar.gz", &"0".repeat(64)), &dir, "about 20 MB", ""));
        let out = Command::new(&launcher).arg("--version").env("TMPDIR", &root).env_remove("HTTPS_PROXY").env_remove("https_proxy").env_remove("ALL_PROXY").output().unwrap();
        let err = String::from_utf8_lossy(&out.stderr);
        assert!(!out.status.success());
        assert!(err.contains("Python tools need a one-time download (uv 9.9.9, about 20 MB) and you appear to be offline."), "{err}");
        assert!(!dir.join("uv").exists() && !dir.join(".download").exists());
        // In place and marked verified: it runs, with the arguments as given.
        executable(&dir.join("uv"), "#!/bin/sh\necho \"installed uv $*\"\n");
        std::fs::write(dir.join(VERIFIED), "x\n").unwrap();
        let out = Command::new(&launcher).args(["run", "a b"]).output().unwrap();
        assert_eq!(String::from_utf8_lossy(&out.stdout), "installed uv run a b\n");
        let _ = std::fs::remove_dir_all(&root);
    }

    /// The uv an older version bundled is reused when its digest matches,
    /// that old folder goes, and so do other uv versions.
    #[test]
    fn reuses_an_earlier_bundled_uv_when_it_matches() {
        let root = temp("tidy");
        let runtimes = root.join("runtimes");
        let scripts = root.join("scripts");
        std::fs::create_dir_all(&scripts).unwrap();
        std::fs::create_dir_all(runtimes.join("uv-0.1.0")).unwrap();
        std::fs::write(scripts.join("uv"), b"pinned uv bytes").unwrap();
        std::fs::write(scripts.join("bun"), b"old bun").unwrap();
        let digest = sha256_file(&scripts.join("uv")).unwrap();
        let pinned = fake_pinned("https://example.invalid/uv.tar.gz", &digest);
        tidy_uv(&runtimes, &scripts, &pinned);
        let dir = runtimes.join("uv-9.9.9");
        assert_eq!(std::fs::read(dir.join("uv")).unwrap(), b"pinned uv bytes");
        assert_eq!(std::fs::read_to_string(dir.join(VERIFIED)).unwrap().trim(), digest);
        assert!(!scripts.exists() && !runtimes.join("uv-0.1.0").exists());

        // A copy that does not match is not reused, and an unverified one
        // in place that does not match is dropped (downloaded again later).
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&scripts).unwrap();
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(scripts.join("uv"), b"some other uv").unwrap();
        std::fs::write(dir.join("uv"), b"tampered").unwrap();
        tidy_uv(&runtimes, &scripts, &pinned);
        assert!(!dir.join("uv").exists() && !scripts.exists());
        let _ = std::fs::remove_dir_all(&root);
    }

    /// uv's Python: the system one only when Apple's developer tools hold a
    /// real python3; otherwise uv's managed one; a choice already made stays.
    #[test]
    fn uv_launcher_prefers_a_real_system_python_only() {
        let root = temp("uvpy");
        let dir = root.join("uv-9.9.9");
        let launcher = root.join("uv");
        executable(&launcher, &download_launcher("uv", "Python tools", &fake_pinned("https://127.0.0.1:9/uv.tar.gz", &"0".repeat(64)), &dir, "about 20 MB", UV_PYTHON_SETUP));
        std::fs::create_dir_all(&dir).unwrap();
        executable(&dir.join("uv"), "#!/bin/sh\necho \"$UV_PYTHON_PREFERENCE\"\n");
        std::fs::write(dir.join(VERIFIED), "x\n").unwrap();
        let preference = |developer_dir: &Path, preset: Option<&str>| {
            let mut cmd = Command::new(&launcher);
            cmd.env("DEVELOPER_DIR", developer_dir).env_remove("UV_PYTHON_PREFERENCE");
            if let Some(p) = preset {
                cmd.env("UV_PYTHON_PREFERENCE", p);
            }
            String::from_utf8(cmd.output().unwrap().stdout).unwrap().trim().to_string()
        };
        // No developer tools (a folder without python3): never the stub
        let empty = root.join("no-tools");
        std::fs::create_dir_all(&empty).unwrap();
        assert_eq!(preference(&empty, None), "only-managed");
        assert_eq!(preference(&root.join("missing"), None), "only-managed");
        // Tools holding python3, with a shim that runs it
        let tools = root.join("tools");
        std::fs::create_dir_all(tools.join("usr/bin")).unwrap();
        executable(&tools.join("usr/bin/python3"), "#!/bin/sh\nexit 0\n");
        let shim_works = Command::new("/usr/bin/python3").args(["-c", ""]).env("DEVELOPER_DIR", &tools).output().is_ok_and(|o| o.status.success());
        assert_eq!(preference(&tools, None), if shim_works { "system" } else { "only-managed" });
        // A preference the person set is kept
        assert_eq!(preference(&empty, Some("only-system")), "only-system");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn quotes_for_sh() {
        assert_eq!(sh_quote("/Applications/My App's/opencode"), r"'/Applications/My App'\''s/opencode'");
    }

    /// The launchers run a stand-in engine with BUN_BE_BUN=1 and the
    /// arguments untouched, from a path with a space and a quote in it.
    #[test]
    fn launchers_run_the_engine_as_bun() {
        let root = temp("js");
        let dir = root.join("App Support's");
        std::fs::create_dir_all(&dir).unwrap();
        let engine = dir.join("opencode");
        std::fs::write(&engine, "#!/bin/sh\necho \"BUN_BE_BUN=$BUN_BE_BUN\"\nfor a in \"$@\"; do echo \"[$a]\"; done\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&engine, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        for (name, text) in launchers(&engine, &root) {
            assert!(write_if_changed(&dir.join(name), &text).unwrap());
            assert!(!write_if_changed(&dir.join(name), &text).unwrap(), "unchanged text is not rewritten");
        }
        let run = |name: &str, args: &[&str]| {
            let out = Command::new(dir.join(name)).args(args).env_remove("BUN_BE_BUN").output().unwrap();
            assert!(out.status.success(), "{name}: {}", String::from_utf8_lossy(&out.stderr));
            String::from_utf8(out.stdout).unwrap()
        };
        assert_eq!(run("vibework-js", &["script.ts", "a b"]), "BUN_BE_BUN=1\n[script.ts]\n[a b]\n");
        assert_eq!(run("bun", &["run", "x.js"]), "BUN_BE_BUN=1\n[run]\n[x.js]\n");
        assert_eq!(run("npx", &["-y", "cowsay"]), "BUN_BE_BUN=1\n[x]\n[-y]\n[cowsay]\n");
        assert_eq!(run("bunx", &["cowsay"]), "BUN_BE_BUN=1\n[x]\n[cowsay]\n");
        // A missing engine says so plainly.
        std::fs::remove_file(&engine).unwrap();
        let out = Command::new(dir.join("vibework-js")).output().unwrap();
        assert!(!out.status.success());
        assert!(String::from_utf8_lossy(&out.stderr).contains("Reopen Vibework"));
        let _ = std::fs::remove_dir_all(&root);
    }
}
