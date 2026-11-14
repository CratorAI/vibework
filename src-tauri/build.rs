fn main() {
    // bundle.resources points at the staged skills (scripts/prepare-skills.mjs,
    // run before `tauri dev` / `tauri build`). A plain `cargo build` or
    // `cargo test` on a fresh clone has not staged them yet; an empty folder
    // keeps the resource check happy (such a build has no bundled skills).
    let _ = std::fs::create_dir_all("bundle-resources/.vibework");
    tauri_build::build()
}
