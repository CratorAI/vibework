// The six feature tiles under the hero. Each is one component of the app at
// about real size, cropped by its tile (Stageshow's bento rules: one thing
// per tile, no window chrome, no string repeated across tiles, one or two
// small motions at most; the hero leads). The copy for each tile is page
// text in the README, never inside the picture.
import { Bar, Collapse, Field, Stage, Text, Spinner, type Act } from '../kit'
import { Badge, I, Ico, ModePick, ModelPick, TypeChip, markLoop, marks } from './parts'
import openrouter from '@public/model-icons/openrouter.svg'
import claude from '@public/model-icons/claude-color.svg'
import openai from '@public/model-icons/openai.svg'
import zhipu from '@public/model-icons/zhipu-color.svg'
import moonshot from '@public/model-icons/moonshot-color.svg'
import notion from '@public/service-icons/notion.svg?raw'
import linear from '@public/service-icons/linear.svg?raw'
import './tiles.css'

type Props = { theme: 'light' | 'dark' }

function Tile({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <Stage width={400} height={260} initial={{}} className={`vw vw-tile vw-tile--${name}`}>
      {() => children}
    </Stage>
  )
}

/** A service's mark in the text colour, as the app's ServiceMark draws it */
function MaskMark({ src, size = 18 }: { src: string; size?: number }) {
  const svg = src.replace(/<title>.*?<\/title>/, '').replace('<svg ', '<svg fill="currentColor" ')
  return <span className="vw-maskmark" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />
}

// 1. Any open model: the model picker, its provider rail and the
// recommended list, with each model's own note from the app.
export function Models(_: Props) {
  const rows = [
    { src: marks.deepseek, name: 'DeepSeek V4.1 Flash', note: 'Fast and cheap, the default', cost: 'Mid cost', on: true },
    { src: zhipu, name: 'GLM 5.3', note: 'Multi-step file work; can’t read images', cost: 'Mid cost' },
    { src: moonshot, name: 'Kimi K3.1 Pro', note: 'Polished results; slower and costlier', cost: 'Higher cost', mono: true },
  ]
  return (
    <Tile name="models">
      <div className="vw-picker">
        <div className="vw-picker__rail">
          <span className="vw-rail-btn"><Ico icon={I.Star} size={17} /></span>
          <span className="vw-rail-btn" data-on><img src={openrouter} alt="" className="vw-invert" /></span>
          <span className="vw-rail-btn"><img src={claude} alt="" /></span>
          <span className="vw-rail-btn"><img src={openai} alt="" className="vw-invert" /></span>
        </div>
        <div className="vw-picker__list">
          <div className="vw-picker__search">
            <Ico icon={I.Search} />
            <span>Search models</span>
          </div>
          <div className="vw-picker__head">Recommended</div>
          {rows.map((r) => (
            <div className="vw-model" data-on={r.on || undefined} key={r.name}>
              <img src={r.src} alt="" className={r.mono ? 'vw-invert' : undefined} />
              <span className="vw-model__text">
                <span className="vw-model__line">
                  <span className="vw-model__name">{r.name}</span>
                  <span className="vw-model__cost">{r.cost}</span>
                </span>
                <span className="vw-model__note">{r.note}</span>
              </span>
              <span className="vw-model__check">{r.on && <Ico icon={I.Check} size={14} />}</span>
            </div>
          ))}
        </div>
      </div>
    </Tile>
  )
}

// 2. Artifacts you can edit: the side panel's tabs (the only colour in the
// row) and a design open in its editor, one text layer selected.
export function Artifacts(_: Props) {
  return (
    <Tile name="artifacts">
      <div className="vw-ed">
        <div className="vw-ed__tabs">
          <span className="vw-ptab" data-on>
            <TypeChip hue="design" size="sm" />
            <span>poster.design.html</span>
            <Ico icon={I.X} size={12} />
          </span>
          <span className="vw-ptab">
            <TypeChip hue="sheet" size="sm" />
            <span>budget.xlsx</span>
          </span>
          <span className="vw-ptab">
            <TypeChip hue="doc" size="sm" />
            <span>brief.md</span>
          </span>
        </div>
        <div className="vw-ed__tools">
          <Ico icon={I.MousePointer2} />
          <Ico icon={I.Type} />
          <Ico icon={I.Square} />
          <Ico icon={I.Circle} />
          <Ico icon={I.Minus} />
          <span className="vw-ed__sep" />
          <Ico icon={I.Undo2} />
          <Ico icon={I.Redo2} />
          <span className="vw-grow" />
          <span className="vw-ed__zoom">72%</span>
        </div>
        <div className="vw-ed__canvas">
          <div className="vw-poster">
            <span className="vw-poster__kicker" />
            <div className="vw-poster__title-wrap">
              <span className="vw-poster__title">Open studio</span>
              <span className="vw-sel">
                <i data-c="tl" /><i data-c="tr" /><i data-c="bl" /><i data-c="br" />
              </span>
            </div>
            <span className="vw-poster__sun" />
            <span className="vw-poster__ground" />
          </div>
          <div className="vw-inspect">
            <div className="vw-inspect__head">Text</div>
            <div className="vw-inspect__row"><span>Size</span><span className="vw-inspect__val">44</span></div>
            <div className="vw-inspect__row"><span>Weight</span><span className="vw-inspect__val">Bold</span></div>
            <div className="vw-inspect__row"><span>Colour</span><span className="vw-swatch" /></div>
          </div>
        </div>
      </div>
    </Tile>
  )
}

// 3. Steer while it works (a short loop): a message written mid-task waits
// its turn as an outlined bubble; the cursor removes it, which is the reset.
type SteerS = { draft: string; queued: boolean }
const steerInitial: SteerS = { draft: '', queued: false }
const QUEUED = 'Also add a chart of the scores'
async function steerScript(a: Act<SteerS>) {
  markLoop()
  await a.wait(900)
  await a.type('draft', QUEUED, { interval: 38 })
  await a.wait(320)
  await a.set({ draft: '', queued: true })
  await a.wait(1900)
  await a.move({ at: 'remove', x: 0.5, y: 0.5 })
  await a.click()
  await a.set({ queued: false })
  await a.wait(500)
  await a.move({ at: 'steer-rest', x: 0.5, y: 0.5 })
  await a.wait(300)
}
export function Steer(_: Props) {
  return (
    <Stage width={400} height={260} initial={steerInitial} poster={{ draft: '', queued: true }} script={steerScript} cursor={{ at: 'steer-rest', style: 'real' }} className="vw vw-tile vw-tile--steer">
      {(s) => (
        <div className="vw-steer">
          <span className="vw-steer__rest" data-target="steer-rest" />
          <div className="vw-tool"><Ico icon={I.FileText} /><span>Read survey.csv</span></div>
          <div className="vw-tool"><Ico icon={I.Pencil} /><span className="vw-shimmer">Writing summary.md</span></div>
          <div className="vw-steer__queue">
            <Collapse open={s.queued} reveal="drop">
              <div className="vw-queued">
                <div className="vw-queued__bubble">{QUEUED}</div>
                <div className="vw-queued__acts">
                  <span className="vw-qbtn"><Ico icon={I.ArrowUp} size={14} /></span>
                  <span className="vw-qbtn"><Ico icon={I.Pencil} size={14} /></span>
                  <span className="vw-qbtn" data-target="remove"><Ico icon={I.X} size={14} /></span>
                </div>
              </div>
            </Collapse>
          </div>
          <div className="vw-steer__box">
            <Field className="vw-tfield" value={s.draft} placeholder="Queue a message, or ⌘↵ to send now" focused />
            <span className="vw-stop"><span /></span>
          </div>
          <div className="vw-steer__row">
            <Ico icon={I.Plus} />
            <span className="vw-grow" />
            <ModelPick />
          </div>
        </div>
      )}
    </Stage>
  )
}

// 4. Ask, Auto or Yolo: the approval prompt docked in the message box's
// place, with the mode it is running in under it.
export function Modes(_: Props) {
  return (
    <Tile name="modes">
      <div className="vw-modes">
        <div className="vw-waiting">
          <span className="vw-dot" />
          <span>Waiting for your approval</span>
          <Ico icon={I.ChevronRight} size={14} />
        </div>
        <div className="vw-dock">
        <div className="vw-prompt">
          <div className="vw-prompt__head">
            <Ico icon={I.ShieldCheck} className="vw-amber" />
            <span className="vw-prompt__title">Run a command</span>
            <span className="vw-grow" />
            <span className="vw-prompt__stop"><span className="vw-stopsq" />Stop</span>
          </div>
          <div className="vw-prompt__cmd vw-mono">python3 make_chart.py --in survey.csv --out scores.png</div>
          <div className="vw-prompt__foot">
            <span className="vw-prompt__why">Ask mode asks before every command.</span>
            <span className="vw-btn" data-ghost>Deny</span>
            <span className="vw-split"><span className="vw-btn">Allow once</span><span className="vw-btn vw-split__more"><Ico icon={I.ChevronDown} size={13} /></span></span>
          </div>
        </div>
        <div className="vw-modes__row">
          <Ico icon={I.Plus} />
          <span className="vw-grow" />
          <ModePick mode="Ask" />
        </div>
        </div>
      </div>
    </Tile>
  )
}

// 5. Connectors: Settings → Connectors, one signed in, one signing in
// through the browser, one waiting for sign-in.
export function Connectors(_: Props) {
  return (
    <Tile name="connectors">
      <div className="vw-conn">
        <div className="vw-conn__title">Connectors</div>
        <div className="vw-conn__card">
          <div className="vw-crow">
            <span className="vw-ctile"><MaskMark src={notion} /></span>
            <span className="vw-crow__text">
              <span className="vw-crow__name">Notion</span>
              <span className="vw-crow__status"><span className="vw-dot" data-tone="ok" />Connected</span>
            </span>
            <span className="vw-switch" data-on><span /></span>
          </div>
          <div className="vw-crow">
            <span className="vw-ctile"><MaskMark src={linear} /></span>
            <span className="vw-crow__text">
              <span className="vw-crow__name">Linear</span>
              <span className="vw-crow__status"><Spinner size={12} />Signing in through your browser…</span>
            </span>
            <span className="vw-btn" data-ghost data-small>Cancel</span>
          </div>
          <div className="vw-crow">
            <span className="vw-ctile"><Ico icon={I.Globe} /></span>
            <span className="vw-crow__text">
              <span className="vw-crow__name">Team wiki</span>
              <span className="vw-crow__status"><span className="vw-dot" data-tone="warn" />Needs sign-in</span>
            </span>
            <span className="vw-btn" data-outline data-small>Sign in</span>
          </div>
          <div className="vw-crow">
            <span className="vw-ctile" />
            <span className="vw-crow__text" data-filler>
              <Bar w={64} h={6} tone={4} />
              <Bar w={120} h={5} tone={2} />
            </span>
          </div>
        </div>
      </div>
    </Tile>
  )
}

// 6. Claude Code and Codex: a task handed from Claude Code to Codex
// mid-conversation; the note is the app's own, above the message it
// applies to.
export function Agents(_: Props) {
  return (
    <Tile name="agents">
      <div className="vw-agents">
        <div className="vw-agents__prose">
          <Bar w="92%" h={6} tone={3} />
          <Bar w="64%" h={6} tone={3} />
        </div>
        <div className="vw-agents__worked"><Ico icon={I.Copy} size={14} /><span>Worked for 41s</span></div>
        <div className="vw-note"><Ico icon={I.Plug} size={14} /><span>Switched to Codex</span></div>
        <div className="vw-agents__q">
          <span className="vw-bubble">Review the changes and run the tests</span>
        </div>
        <div className="vw-tool"><Ico icon={I.SquareTerminal} /><span className="vw-shimmer">Running bun test</span></div>
        <div className="vw-agents__row">
          <Ico icon={I.Plus} />
          <span className="vw-grow" />
          <ModelPick src={openai} name="GPT-6.1-Sol · Low" />
          <ModePick />
        </div>
      </div>
    </Tile>
  )
}

export { Badge, Text }
