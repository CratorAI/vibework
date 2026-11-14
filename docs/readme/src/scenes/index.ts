import type { ComponentType } from 'react'
import Hero from './hero'
import { Agents, Artifacts, Connectors, Models, Modes, Steer } from './tiles'

export const scenes: Record<string, ComponentType<{ theme: 'light' | 'dark' }>> = {
  hero: Hero,
  models: Models,
  artifacts: Artifacts,
  steer: Steer,
  modes: Modes,
  connectors: Connectors,
  agents: Agents,
}
