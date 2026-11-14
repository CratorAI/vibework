// Frames real window captures for the README: a hairline and a short shadow
// (the same treatment as the illustrations), on a transparent ground, so a
// light window still has an edge on GitHub's white page.
//
//   node frame-shots.mjs <folder of captures>
//
// Takes every <name>-light.png and <name>-dark.png in the folder (window
// captures from `screencapture -o -l <window id>`, 1400 x 872) and writes
// ../shots/<name>-<theme>.webp.
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const from = path.resolve(process.argv[2] ?? '.')
const out = path.resolve(here, '../shots')
const work = mkdtempSync(path.join(tmpdir(), 'vibework-shots-'))
const PAD = 28
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const file of readdirSync(from).filter((f) => /-(light|dark)\.png$/.test(f))) {
    const dark = file.endsWith('-dark.png')
    const page = await browser.newPage({ viewport: { width: 1400 + PAD * 2, height: 872 + PAD * 2 }, deviceScaleFactor: 1 })
    const ring = dark ? 'rgb(255 255 255 / 0.12)' : 'rgb(0 0 0 / 0.10)'
    const fall = dark ? '0 16px 32px -14px rgb(0 0 0 / 0.7)' : '0 14px 30px -14px rgb(0 0 0 / 0.22)'
    const html = path.join(work, `${file}.html`)
    writeFileSync(html, `<html><body style="margin:0;background:transparent">
      <img src="${pathToFileURL(path.join(from, file))}" style="display:block;margin:${PAD}px;width:1400px;height:872px;border-radius:16px;box-shadow:0 0 0 1px ${ring}, ${fall}">
      </body></html>`)
    await page.goto(pathToFileURL(html).href)
    await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0)
    const png = path.join(work, file)
    await page.screenshot({ path: png, omitBackground: true })
    await page.close()
    const webp = path.join(out, file.replace(/\.png$/, '.webp'))
    execFileSync('cwebp', ['-quiet', '-q', '90', '-m', '6', '-alpha_q', '100', png, '-o', webp])
    console.log(path.basename(webp), Math.round(statSync(webp).size / 1024), 'KB')
  }
} finally {
  await browser.close()
  rmSync(work, { recursive: true, force: true })
}
