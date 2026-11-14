// Mounts one illustration: /?scene=hero&theme=dark&record=1
// With record=1 the page runs on Stageshow's virtual clock, so render.mjs can
// step it one frame at a time and every render of a loop is the same.
import { installVirtualClock } from './kit/clock'
import '@fontsource-variable/mona-sans/wght.css'
import '@fontsource-variable/geist-mono/wght.css'

const params = new URLSearchParams(location.search)
const record = params.get('record') === '1'
if (record) installVirtualClock({ fps: Number(params.get('fps') ?? 30), epoch: Date.UTC(2026, 10, 13, 9, 41) })

type Host = { __vw?: { loops: number[]; ready: boolean } }
const host = window as unknown as Host
host.__vw = { loops: [], ready: false }

async function boot() {
  const theme = params.get('theme') === 'dark' ? 'dark' : 'light'
  document.documentElement.dataset.theme = theme
  const name = params.get('scene') ?? 'hero'
  const { scenes } = await import('./scenes')
  const Scene = scenes[name]
  if (!Scene) throw new Error(`No scene named ${name}`)
  const { createRoot } = await import('react-dom/client')
  const { createElement } = await import('react')
  const root = document.getElementById('root')!
  root.className = 'vw-root'
  createRoot(root).render(createElement(Scene, { theme }))
  await document.fonts.ready
  host.__vw!.ready = true
}
boot().catch((error) => {
  document.body.textContent = String(error)
  throw error
})
