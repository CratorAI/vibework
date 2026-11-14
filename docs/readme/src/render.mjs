// Renders every README illustration into ../ (docs/readme/).
//
//   npm run build                 every asset
//   npm run build -- hero         only assets whose name starts with "hero"
//   npm run build -- --frames     also keep the PNG frames (in the temp dir)
//
// How: Vite serves the scenes; headless Chrome (your installed Google Chrome,
// via playwright-core) opens each one on Stageshow's virtual clock and steps
// it one frame at a time, so every render of a loop is identical. Loops are
// cut at the exact frame each script starts again (scenes call markLoop()),
// consecutive identical frames are merged, and img2webp (libwebp) writes an
// animated WebP. Stills are written as lossless WebP. Nothing is fetched
// from the network: fonts come from @fontsource packages in node_modules.
// Needs: Node 20+, Google Chrome, img2webp (brew install webp).
import { createServer } from 'vite'
import { chromium } from 'playwright-core'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(here, '..')
const args = process.argv.slice(2)
const keepFrames = args.includes('--frames')
const only = args.filter((a) => !a.startsWith('--'))

const FPS = 30
const SCALE = 2

// name, scene, stage size, and whether it loops. Every asset is rendered
// in both themes: <name>-light.webp and <name>-dark.webp.
const ASSETS = [
  { name: 'hero', scene: 'hero', width: 960, height: 560, loop: true, quality: 82 },
  { name: 'hero-compact', scene: 'hero', width: 358, height: 344, loop: true, quality: 82 },
  { name: 'models', scene: 'models', width: 400, height: 260 },
  { name: 'artifacts', scene: 'artifacts', width: 400, height: 260 },
  { name: 'steer', scene: 'steer', width: 400, height: 260, loop: true, quality: 85 },
  { name: 'modes', scene: 'modes', width: 400, height: 260 },
  { name: 'connectors', scene: 'connectors', width: 400, height: 260 },
  { name: 'agents', scene: 'agents', width: 400, height: 260 },
]

// The header wordmark: the app's own Lockup paths, one file per theme
{
  const lockup = readFileSync(path.resolve(here, '../../../src/components/brand/Lockup.tsx'), 'utf8')
  const paths = [...lockup.matchAll(/<path d="([^"]+)"/g)].map((m) => `<path d="${m[1]}"/>`).join('')
  const viewBox = lockup.match(/viewBox="([^"]+)"/)[1]
  for (const [theme, fill] of [['light', '#171717'], ['dark', '#ececec']]) {
    writeFileSync(path.join(outDir, `wordmark-${theme}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="240" height="41" role="img" aria-label="Vibework"><title>Vibework</title><g fill="${fill}">${paths}</g></svg>\n`)
  }
}

const server = await createServer({ configFile: path.join(here, 'vite.config.ts'), server: { port: 1493 } })
await server.listen()
const base = server.resolvedUrls.local[0].replace(/\/$/, '')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const work = mkdtempSync(path.join(tmpdir(), 'vibework-readme-'))

try {
  for (const asset of ASSETS) {
    if (only.length && !only.some((o) => asset.name.startsWith(o))) continue
    for (const theme of ['light', 'dark']) {
      const file = path.join(outDir, `${asset.name}-${theme}.webp`)
      const t0 = Date.now()
      if (asset.loop) await renderLoop(asset, theme, file)
      else await renderStill(asset, theme, file)
      const kb = Math.round(statSync(file).size / 1024)
      console.log(`${path.basename(file)}  ${kb} KB  ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    }
  }
} finally {
  await browser.close()
  await server.close()
  if (!keepFrames) rmSync(work, { recursive: true, force: true })
  else console.log('frames kept in', work)
}

async function open(asset, theme, record) {
  const page = await browser.newPage({ viewport: { width: asset.width, height: asset.height }, deviceScaleFactor: SCALE })
  page.on('pageerror', (e) => console.error(`[${asset.name}/${theme}]`, e.message))
  await page.goto(`${base}/?scene=${asset.scene}&theme=${theme}${record ? `&record=1&fps=${FPS}` : ''}`)
  // On the virtual clock nothing moves unless stepped, page boot included
  for (let i = 0; ; i++) {
    const ready = await page.evaluate(() => window.__vw?.ready === true && !!document.querySelector('.ss-stage'))
    if (ready) break
    if (i > 400) throw new Error(`${asset.name}: the scene never became ready`)
    if (record) await page.evaluate(() => window.__stageshow?.clock?.step(1))
    await page.waitForTimeout(25)
  }
  return page
}

function shoot(page) {
  return page.locator('.ss-stage').first().screenshot({ omitBackground: true, animations: 'allow', type: 'png' })
}
function step(page, n = 1) {
  return page.evaluate((k) => window.__stageshow.clock.step(k), n)
}
function loops(page) {
  return page.evaluate(() => window.__vw.loops.slice())
}

async function renderLoop(asset, theme, file) {
  const page = await open(asset, theme, true)
  // Run to the start of the second loop, so the first frame is a settled one
  let starts = await loops(page)
  for (let guard = 0; starts.length < 2; guard++) {
    if (guard > FPS * 60) throw new Error(`${asset.name}: no second loop within 60s`)
    await step(page)
    starts = await loops(page)
  }
  const dir = path.join(work, `${asset.name}-${theme}`)
  mkdirSync(dir, { recursive: true })
  const frames = []
  for (let i = 0; ; i++) {
    const png = await shoot(page)
    const hash = createHash('sha1').update(png).digest('hex')
    const last = frames.at(-1)
    if (last && last.hash === hash) last.count++
    else {
      const name = path.join(dir, `f${String(i).padStart(5, '0')}.png`)
      writeFileSync(name, png)
      frames.push({ name, hash, count: 1 })
    }
    await step(page)
    if ((await loops(page)).length > 2) break
    if (i > FPS * 30) throw new Error(`${asset.name}: loop longer than 30s`)
  }
  await page.close()
  // Frame durations: img2webp takes whole milliseconds; spread the rounding
  let t = 0
  let at = 0
  const list = ['-loop', '0', '-min_size']
  for (const f of frames) {
    t += (f.count * 1000) / FPS
    const d = Math.max(1, Math.round(t - at))
    at += d
    list.push('-d', String(d), '-lossy', '-q', String(asset.quality ?? 82), '-m', '6', f.name)
  }
  list.push('-o', file)
  const argsFile = path.join(dir, 'args.txt')
  writeFileSync(argsFile, list.join('\n'))
  execFileSync('img2webp', [argsFile], { stdio: 'inherit' })
  console.log(`  ${frames.length} distinct frames, ${(at / 1000).toFixed(2)}s loop`)
}

async function renderStill(asset, theme, file) {
  const page = await open(asset, theme, false)
  await page.waitForTimeout(1200)
  const png = await shoot(page)
  await page.close()
  const tmp = path.join(work, `${asset.name}-${theme}.png`)
  writeFileSync(tmp, png)
  execFileSync('cwebp', ['-quiet', '-lossless', '-z', '9', '-exact', tmp, '-o', file])
}
