// Small pieces of Vibework's interface, shared by the illustrations. The
// wordmark and the icons are the app's own components; the provider marks
// are the app's own files in public/model-icons.
import type { CSSProperties, ReactNode } from 'react'
import { Lockup } from '@app/components/brand/Lockup'
import { Mark } from '@app/components/brand/Mark'
import * as I from '@app/lib/icons'
import { clock } from '../kit'
import deepseek from '@public/model-icons/deepseek-color.svg'
import './vw.css'

export { I, Lockup, Mark }
export const marks = { deepseek }

export type Hue = 'green' | 'violet' | 'blue' | 'amber' | 'orange' | 'grey'

export function Badge({ hue, letters, size }: { hue: Hue; letters: string; size?: 20 }) {
  return (
    <span className="vw-badge" data-hue={hue} data-size={size}>
      {letters}
    </span>
  )
}

const TYPE_ICON = { slides: I.Presentation, doc: I.FileText, sheet: I.Sheet, design: I.Shapes, web: I.Globe }
export type FileHue = keyof typeof TYPE_ICON

/** ArtifactTypeChip: md 36px (file card), tile 28px, sm 20px (tabs, rows) */
export function TypeChip({ hue, size = 'md' }: { hue: FileHue; size?: 'md' | 'tile' | 'sm' }) {
  const Icon = TYPE_ICON[hue]
  const px = size === 'md' ? 36 : size === 'tile' ? 28 : 20
  return (
    <span className="vw-type" data-hue={hue} data-size={size} style={{ width: px, height: px }}>
      <Icon size={size === 'sm' ? 13 : 16} strokeWidth={2.25} />
    </span>
  )
}

export function Ico({ icon: Icon, size = 16, style, className }: { icon: typeof I.Plus; size?: number; style?: CSSProperties; className?: string }) {
  return <Icon size={size} strokeWidth={2.25} className={`vw-ico${className ? ` ${className}` : ''}`} style={style} />
}

export function ModelPick({ name = 'DeepSeek V4.1 Flash', src = deepseek, chevron = true }: { name?: ReactNode; src?: string; chevron?: boolean }) {
  return (
    <span className="vw-pick">
      <img src={src} alt="" />
      <span>{name}</span>
      {chevron && <Ico icon={I.ChevronDown} size={14} />}
    </span>
  )
}

export function ModePick({ mode = 'Auto' }: { mode?: string }) {
  return (
    <span className="vw-pick" data-quiet>
      <span>{mode}</span>
      <Ico icon={I.ChevronDown} size={14} />
    </span>
  )
}

/** Tells render.mjs where each loop begins, so it can cut exactly one. */
export function markLoop() {
  const host = window as unknown as { __vw?: { loops: number[] } }
  host.__vw?.loops.push(clock.now())
}
