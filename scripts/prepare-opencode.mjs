// Places the pinned OpenCode engine binary where Tauri expects its sidecar
// (src-tauri/binaries/opencode-<target-triple>, see bundle.externalBin).
//
// The archive URL and both SHA-256 digests (zip and extracted binary) are
// pinned in scripts/opencode-manifest.json. Nothing is trusted that does not
// match them. No credentials are read or used. macOS only for now.
//
// Runs before `tauri dev` / `tauri build` (tauri.conf.json) and via
// `bun run prepare:opencode`. When the sidecar is already in place and its
// digest matches, it does nothing.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(new URL("./opencode-manifest.json", import.meta.url), "utf8"));
const target =
  process.env.TAURI_ENV_TARGET_TRIPLE ||
  process.env.CARGO_BUILD_TARGET ||
  { arm64: "aarch64-apple-darwin", x64: "x86_64-apple-darwin" }[process.arch];

const artifact = manifest.artifacts[target];
if (process.platform !== "darwin" || !artifact) {
  throw new Error(`OpenCode sidecar: only macOS (arm64, x64) is supported for now, not ${process.platform}/${target}`);
}

const destination = join(root, "src-tauri", "binaries", `opencode-${target}`);
const cache = join(root, "node_modules", ".cache", "vibework-opencode", `${artifact.sha256}.zip`);

const hashBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashFile = (path) =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });

// Already prepared and intact: nothing to do.
if (await stat(destination).then(() => true, () => false)) {
  if ((await hashFile(destination)) === artifact.binarySha256) {
    console.log(`OpenCode ${manifest.version} sidecar is current (${target})`);
    process.exit(0);
  }
  console.log("OpenCode sidecar digest does not match the manifest; preparing it again");
}

let bytes = await readFile(cache).catch(() => undefined);
if (!bytes || hashBytes(bytes) !== artifact.sha256) {
  console.log(`Downloading OpenCode ${manifest.version} (${target})`);
  const response = await fetch(artifact.url);
  if (!response.ok) throw new Error(`OpenCode download failed: HTTP ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
  if (hashBytes(bytes) !== artifact.sha256) throw new Error("OpenCode archive SHA-256 does not match the manifest");
  await mkdir(dirname(cache), { recursive: true });
  await writeFile(cache, bytes);
}

const temp = await mkdtemp(join(tmpdir(), "vibework-opencode-"));
try {
  const archive = join(temp, "archive.zip");
  const extracted = join(temp, "out");
  await writeFile(archive, bytes);
  // ditto keeps the upstream code signature intact.
  execFileSync("/usr/bin/ditto", ["-x", "-k", archive, extracted]);
  const binary = join(extracted, "opencode");
  if ((await hashFile(binary)) !== artifact.binarySha256) {
    throw new Error("Extracted OpenCode binary SHA-256 does not match the manifest");
  }
  await mkdir(dirname(destination), { recursive: true });
  // Copy next to the destination first so the final rename is atomic.
  const staging = `${destination}.tmp`;
  await copyFile(binary, staging);
  await chmod(staging, 0o755);
  await rename(staging, destination);
  console.log(`Prepared OpenCode ${manifest.version} sidecar (${target})`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
