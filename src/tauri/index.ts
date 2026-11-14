/**
 * Tauri API exports
 * Central export point for all Tauri command invocations and event listeners
 */

export * from "./agent";
export * from "./artifacts";
export * from "./app";
export * from "./byok";
export * from "./files";
export * from "./mcp";
export * from "./models";
export * from "./settings";
export * from "./skills";
export * from "./web";

// Re-export namespaces for convenient access
export { agentApi } from "./agent";
export { appApi } from "./app";
export { byokApi } from "./byok";
export { filesApi } from "./files";
export { mcpApi } from "./mcp";
export { modelsApi } from "./models";
export { settingsApi } from "./settings";
export { skillsApi } from "./skills";
export { webApi } from "./web";

// Create a unified API object
import { agentApi } from "./agent";
import { appApi } from "./app";
import { byokApi } from "./byok";
import { filesApi } from "./files";
import { mcpApi } from "./mcp";
import { modelsApi } from "./models";
import { settingsApi } from "./settings";
import { skillsApi } from "./skills";
import { webApi } from "./web";

export const tauriApi = {
  agent: agentApi,
  app: appApi,
  byok: byokApi,
  files: filesApi,
  mcp: mcpApi,
  models: modelsApi,
  settings: settingsApi,
  skills: skillsApi,
  web: webApi,
} as const;

export default tauriApi;
