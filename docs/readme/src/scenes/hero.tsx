// The hero: Vibework's core loop in one take.
//
// Gold copied: the skill's `linear` (a wide product window inset at the top,
// running off the bottom) for the frame and `ai-chat` (a request typed and
// sent, the answer arriving under it) for the story, after an earlier trial
// of this same story. Beats:
//   1. Home: a task is typed into the message box and sent.
//   2. The message box docks, the request lands as the person's message and
//      the agent works: three tool rows, a line of reply.
//   3. The file card arrives and the side panel opens on the deck it made.
//   4. Hold; the cursor presses New task and home comes back (the reset
//      has a visible cause).
// Real strings: the home heading, the request, the three tool rows, the
// file name and type, the slide's title, the task title. Everything else is
// placeholder bars around the app's own marks.
import { Bar, Collapse, Field, Stage, Text, Window, type Act, type Layout } from '../kit'
import { Badge, I, Ico, Lockup, ModelPick, ModePick, TypeChip, markLoop } from './parts'
import './hero.css'

const REQUEST = 'Turn interview-notes.md into a short deck'
const FILE = 'findings.slides.md'
const TITLE = 'Interview findings deck'

type S = {
  draft: string
  view: 'home' | 'task'
  docked: boolean
  working: boolean
  rows: number
  card: boolean
  done: boolean
  panel: boolean
  slide: boolean
  away: boolean
}

const initial: S = { draft: '', view: 'home', docked: false, working: false, rows: 0, card: false, done: false, panel: false, slide: false, away: false }
const poster: S = { draft: '', view: 'task', docked: true, working: false, rows: 4, card: true, done: true, panel: true, slide: true, away: false }

async function script(a: Act<S>) {
  markLoop()
  const compact = a.layout === 'compact'
  await a.wait(700)

  // 1. The task, typed into the home message box, then sent
  a.mark('type')
  void a.move({ at: 'home-rest', x: 0.5, y: 0.5 })
  await a.type('draft', REQUEST, { interval: 32 })
  await a.wait(220)
  await a.move({ at: 'send', x: 0.55, y: 0.6 })
  await a.click()
  a.mark('send')
  await a.set({ view: 'task', draft: '' })
  void a.move({ at: 'rest', x: 0.5, y: 0.5 })
  await a.wait(420)
  await a.set({ docked: true, working: true })
  await a.wait(380)

  // 2. The agent works
  a.mark('work')
  await a.set({ rows: 1 })
  await a.wait(620)
  await a.set({ rows: 2 })
  await a.wait(620)
  await a.set({ rows: 3 })
  await a.wait(700)
  await a.set({ rows: 4 })
  await a.wait(420)

  // 3. The payoff: the file card, then the panel opens on the deck
  a.mark('card')
  await a.set({ card: true, working: false, done: true })
  await a.wait(520)
  a.mark('panel')
  await a.set({ panel: true, slide: true })
  if (compact) void a.move({ at: 'panel-rest', x: 0.5, y: 0.5 })

  // 4. Hold on the result, then New task brings home back
  a.mark('hold')
  await a.wait(2300)
  a.mark('reset')
  if (compact) {
    // The panel covers the window's band here: close it first
    await a.move({ at: 'close', x: 0.5, y: 0.5 })
    await a.click()
    await a.set({ panel: false })
    await a.wait(420)
  }
  await a.move(compact ? { at: 'new', x: 0.5, y: 0.5 } : { at: 'new-spot', x: 0.5, y: 0.5 })
  await a.click()
  await a.set({ panel: false, away: true })
  await a.wait(compact ? 160 : 260)
  await a.snap({ view: 'home', docked: false, rows: 0, card: false, done: false, slide: false })
  await a.set({ away: false })
  await a.wait(700)
}

const RECENTS: { hue: 'green' | 'blue' | 'amber' | 'orange' | 'violet' | 'grey'; l: string; w: number }[] = [
  { hue: 'blue', l: 'PL', w: 108 },
  { hue: 'green', l: 'FN', w: 86 },
  { hue: 'orange', l: 'HM', w: 118 },
  { hue: 'violet', l: 'RS', w: 74 },
  { hue: 'amber', l: 'TR', w: 98 },
  { hue: 'grey', l: 'NT', w: 112 },
  { hue: 'blue', l: 'PL', w: 80 },
  { hue: 'green', l: 'FN', w: 104 },
  { hue: 'orange', l: 'HM', w: 90 },
]

function Sidebar() {
  return (
    <div className="vw-side">
      <div className="vw-side__brand">
        <Ico icon={I.PanelLeft} />
        <Lockup className="vw-wordmark" />
      </div>
      <div className="vw-side__nav">
        <div className="vw-nav" data-new data-target="new">
          <Ico icon={I.Plus} />
          <Text className="vw-nav__label">New task</Text>
          <span className="vw-nav__spot" data-target="new-spot" />
        </div>
        <div className="vw-nav">
          <Ico icon={I.Search} />
          <Text className="vw-nav__label">Search</Text>
          <span className="vw-kbd">⌘K</span>
        </div>
        <div className="vw-nav">
          <Ico icon={I.Folder} />
          <Text className="vw-nav__label">Artifacts</Text>
        </div>
      </div>
      <div className="vw-side__head">Recents</div>
      <div className="vw-side__list">
        {RECENTS.map((r, i) => (
          <div className="vw-task" key={i}>
            <Badge hue={r.hue} letters={r.l} />
            <Bar w={r.w} h={6} tone={3} />
          </div>
        ))}
      </div>
    </div>
  )
}

function Slide({ on }: { on: boolean }) {
  return (
    <div className="vw-slide" data-on={on || undefined}>
      <span className="vw-slide__kicker" />
      <span className="vw-slide__rule" />
      <Text className="vw-slide__title">What we heard</Text>
      <span className="vw-slide__sub">
        <Bar w="62%" h={5} tone={2} />
        <Bar w="40%" h={5} tone={2} />
      </span>
    </div>
  )
}

function Thumb({ i, on }: { i: number; on: boolean }) {
  return (
    <div className="vw-thumb" data-on={on || undefined} data-selected={i === 0 || undefined} style={{ transitionDelay: on ? `${120 + i * 60}ms` : '0ms' }}>
      <div className="vw-thumb__page" data-first={i === 0 || undefined}>
        {i === 0 ? (
          <>
            <span className="vw-thumb__t" style={{ width: 30 }} />
            <span className="vw-thumb__l" style={{ width: 22 }} />
          </>
        ) : (
          <>
            <span className="vw-thumb__t" style={{ width: [0, 34, 28, 36][i] }} />
            <span className="vw-thumb__l" style={{ width: [0, 40, 30, 24][i] }} />
            {i === 2 && (
              <span className="vw-thumb__cols">
                <span style={{ height: 6 }} />
                <span style={{ height: 9 }} />
                <span style={{ height: 13 }} data-hi />
              </span>
            )}
            {i !== 2 && <span className="vw-thumb__l" style={{ width: [0, 30, 0, 38][i] }} />}
          </>
        )}
      </div>
      <span className="vw-thumb__n">{i + 1}</span>
    </div>
  )
}

function Panel({ s, compact }: { s: S; compact: boolean }) {
  return (
    <div className="vw-panel" data-open={s.panel || undefined}>
      <div className="vw-panel__band">
        <span className="vw-tab">
          <TypeChip hue="slides" size="sm" />
          <Text className="vw-tab__name">{FILE}</Text>
          <span className="vw-tab__x" data-target="close">
            <Ico icon={I.X} size={12} />
          </span>
        </span>
        <span className="vw-grow" data-target="panel-rest" />
        {!compact && <Ico icon={I.MoreHorizontal} />}
        <Ico icon={I.PanelRight} />
      </div>
      <div className="vw-panel__tools">
        <Ico icon={I.ChevronLeft} size={14} />
        <span className="vw-pager">1 / 4</span>
        <Ico icon={I.ChevronRight} size={14} />
        <span className="vw-grow" />
        <span className="vw-present">
          <Ico icon={I.Play} size={12} />
        </span>
      </div>
      <div className="vw-panel__stage">
        <Slide on={s.slide} />
        <div className="vw-thumbs">
          {[0, 1, 2, 3].map((i) => (
            <Thumb key={i} i={i} on={s.slide} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Scene({ s, layout }: { s: S; layout: Layout }) {
  const compact = layout === 'compact'
  const task = s.view === 'task'
  const lead = (
    <span className="vw-lead" data-on={task && !s.away ? true : undefined}>
      {compact && (
        <span className="vw-lead__btns">
          <Ico icon={I.PanelLeft} />
          <span className="vw-lead__new" data-target="new">
            <Ico icon={I.Plus} />
          </span>
        </span>
      )}
      <span className="vw-crumb">
        <Badge hue="violet" letters="RS" />
        {!compact && <span className="vw-crumb__folder">research</span>}
        <Text className="vw-crumb__title">{TITLE}</Text>
      </span>
    </span>
  )
  const toolbar = (
    <span className="vw-bar-end">
      <span className="vw-band-rest" data-target="band-rest" />
      <Ico icon={I.PanelRight} />
    </span>
  )
  return (
    <div className="vw-frame">
      <Window
        className="vw-window"
        sidebar={compact ? undefined : <Sidebar />}
        sidebarWidth={208}
        barSize={compact ? undefined : 'tall'}
        lights="grey"
        lead={lead}
        toolbar={toolbar}
        body={{ className: 'vw-body' }}
      >
        <div className="vw-main" data-view={s.view} data-panel={s.panel || undefined} data-away={s.away || undefined}>
          {/* Home: the heading over the message box */}
          <div className="vw-home">
            <div className="vw-heading">
              <div className="vw-heading__q">
                What should we get done in <span className="vw-heading__folder">research</span>?
              </div>
              <div className="vw-heading__or">or start without a folder</div>
            </div>
          </div>
          <span className="vw-home-rest" data-target="home-rest" />

          {/* The task */}
          <div className="vw-thread">
            <div className="vw-col">
              <span className="vw-rest" data-target="rest" />
              <div className="vw-q" data-on={task || undefined}>
                <Text className="vw-bubble" wrap>
                  {REQUEST}
                </Text>
              </div>
              <div className="vw-steps">
                {!compact && (
                  <Collapse open={s.rows >= 1}>
                    <div className="vw-tool">
                      <Ico icon={I.FileText} />
                      <span>Read interview-notes.md</span>
                    </div>
                  </Collapse>
                )}
                <Collapse open={s.rows >= 2}>
                  <div className="vw-tool">
                    <Ico icon={I.BookOpen} />
                    <span>Loaded the vibework-slides skill</span>
                  </div>
                </Collapse>
                <Collapse open={s.rows >= 3}>
                  <div className="vw-tool">
                    <Ico icon={I.Pencil} />
                    <span>Wrote {FILE}</span>
                  </div>
                </Collapse>
              </div>
              <Collapse open={s.rows >= 4}>
                <div className="vw-prose">
                  <span className="vw-prose__line"><Bar w="96%" h={6} tone={3} /></span>
                  {!compact && <span className="vw-prose__line"><Bar w="58%" h={6} tone={3} /></span>}
                </div>
              </Collapse>
              <Collapse open={s.card} reveal="drop">
                <div className="vw-card">
                  <TypeChip hue="slides" />
                  <div className="vw-card__text">
                    <Text className="vw-card__name">{FILE}</Text>
                    <Text className="vw-card__type">Slides · 4 slides</Text>
                  </div>
                  {!compact && (
                    <span className="vw-card__acts">
                      <Ico icon={I.ExternalLink} />
                      <Ico icon={I.Folder} />
                    </span>
                  )}
                </div>
              </Collapse>
              <div className="vw-status">
                <span className="vw-status__item" data-on={s.working || undefined}>
                  <span className="vw-shimmer">Working…</span>
                </span>
                <span className="vw-status__item" data-on={s.done || undefined}>
                  <Ico icon={I.Copy} size={14} />
                  <span>Worked for 18s</span>
                </span>
              </div>
            </div>
          </div>

          {/* One message box: home's, docking to the foot of the task */}
          <div className="vw-composer" data-view={s.view} data-docked={s.docked || undefined}>
            <div className="vw-composer__box" data-target="composer">
              <Field
                className="vw-field"
                value={s.draft}
                placeholder={task ? (s.docked ? 'Reply, or ask for something new…' : undefined) : 'Describe a task, or drop in files…'}
                focused={!task}
              />
              <span className="vw-composer__home-row">
                <Ico icon={I.Plus} />
                <span className="vw-grow" />
                <ModelPick />
                {!compact && <ModePick />}
              </span>
              <span className="vw-send" data-on={s.draft ? true : undefined} data-target="send">
                <Ico icon={I.ArrowUp} />
              </span>
            </div>
            <div className="vw-composer__row">
              <Ico icon={I.Plus} />
              <span className="vw-grow" />
              <ModelPick />
              <ModePick />
            </div>
          </div>
        </div>
      </Window>
      <div className="vw-panel-clip">
        <Panel s={s} compact={compact} />
      </div>
    </div>
  )
}

export default function Hero() {
  return (
    <Stage
      width={960}
      height={560}
      compact={{ below: 600, width: 358, height: 344 }}
      initial={initial}
      poster={poster}
      script={script}
      cursor={{ at: { wide: 'new-spot', compact: 'new' }, style: 'real' }}
      className="vw vw-hero"
    >
      {(s, _rect, layout) => <Scene s={s} layout={layout} />}
    </Stage>
  )
}
