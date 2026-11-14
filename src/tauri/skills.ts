/**
 * Skills API module
 * A skill is a folder with a SKILL.md. Skills are discovered when a conversation starts.
 */

import { invoke } from "@tauri-apps/api/core";

/** bundled: ships with the app; user: the app's skills folder; claude: ~/.claude/skills; agents: ~/.agents/skills */
export type SkillSource = "bundled" | "user" | "claude" | "agents";

/** A personal skill source with its on/off switch. */
export interface SkillSourceState {
  id: "user" | "claude" | "agents";
  path: string;
  enabled: boolean;
  /** Skills found in the folder (whether or not it is on) */
  count: number;
}

export interface SkillsSummary {
  sources: SkillSourceState[];
  /** Skills offered to the model (bundled plus sources that are on) */
  loaded: number;
  /** Rough tokens the skill list adds to each task's first message */
  approxTokens: number;
}

export async function getSkillsSummary(): Promise<SkillsSummary> {
  return await invoke<SkillsSummary>("skills_summary");
}

export async function setSkillSourceEnabled(id: SkillSourceState["id"], enabled: boolean): Promise<SkillsSummary> {
  return await invoke<SkillsSummary>("skills_set_source_enabled", { id, enabled });
}

export interface SkillInfo {
  name: string;
  description: string;
  source: SkillSource;
  /** Path of the skill's folder or SKILL.md */
  path: string;
}

export async function listSkills(): Promise<SkillInfo[]> {
  return await invoke<SkillInfo[]>("skills_list");
}

/** A skill the message box's "/" menu offers (bundled, or from a source that is on). */
export interface SkillChoice {
  /** The engine's id: the skill's folder name. What the chip shows and the message sends. */
  id: string;
  name: string;
  description: string;
  source: SkillSource;
}

/** Skills a task can use: bundled ones and those of the sources switched on in Settings. */
export async function listAvailableSkills(): Promise<SkillChoice[]> {
  return await invoke<SkillChoice[]>("skills_available");
}

/** Absolute path of the user skills folder */
export async function getSkillsFolderPath(): Promise<string> {
  return await invoke<string>("skills_folder_path");
}

/** Reveals the user skills folder in Finder. */
export async function openSkillsFolder(): Promise<void> {
  await invoke("skills_open_folder");
}

export const skillsApi = {
  list: listSkills,
  available: listAvailableSkills,
  getFolderPath: getSkillsFolderPath,
  openFolder: openSkillsFolder,
  summary: getSkillsSummary,
  setSourceEnabled: setSkillSourceEnabled,
} as const;
