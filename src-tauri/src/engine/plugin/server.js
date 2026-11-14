// Vibework's OpenCode plugin (pinned to OpenCode 2.2.7; written by the app
// before every engine launch). It:
// - adds the per-launch capability to model requests, which go to the app's
//   loopback OpenRouter proxy (the engine never holds the OpenRouter key);
// - registers the app's MCP server (PresentFile, Browser, web search/fetch)
//   in memory, with direct tool exposure (the user's connectors are the
//   engine's own MCP servers);
// - scrubs the environment of every shell command (second layer: sessions
//   also get an explicit environment from the app);
// - keeps helpers (the engine's subagent tool) inside the turn and on the
//   task's model.
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const channel = require("./channel.cjs")

// Never handed to a command, whatever the base environment.
// VIBEWORK_SCRATCH is the task's scratch folder (a path, set per task by the app).
const NEVER = /^(OPENROUTER_API_KEY|OPENCODE_PASSWORD|OPENCODE_SERVER_PASSWORD|OPENCODE_SERVER_USERNAME|VIBEWORK_(?!SCRATCH$).*)$/

export default {
  id: "vibework.bridge",
  async setup(ctx) {
    const launch = channel.read()
    const options = ctx.options ?? {}
    const shellEnv = options.shellEnv ?? {}
    const capability = typeof launch.capability === "string" ? launch.capability : ""

    await ctx.shell.hook("create.before", (event) => {
      for (const name of Object.keys(event.env ?? {})) if (NEVER.test(name)) delete event.env[name]
      for (const name of shellEnv.unset ?? []) delete event.env[name]
      Object.assign(event.env, shellEnv.set ?? {})
    })

    const taskModels = new Map()
    await ctx.session.hook("model.request", (event) => {
      if (event.kind === "primary") taskModels.set(event.sessionID, event.model)
    })

    // Helpers run in the foreground: a helper that outlived its turn would
    // keep working with no Stop on screen and wake the task again later. And
    // on the model the person chose for the task (the engine's default when
    // no model is given): no switch to another, possibly dearer, model.
    await ctx.tool.hook("execute.before", (event) => {
      if (event.tool !== "subagent" || event.input === null || typeof event.input !== "object") return
      const input = { ...event.input }
      delete input.background
      delete input.model
      // A continued native child otherwise keeps the model of its first turn.
      const model = taskModels.get(event.sessionID)
      if (model) input.model = `${model.providerID}/${model.id}${model.variant && model.variant !== "default" ? `#${model.variant}` : ""}`
      event.input = input
    })

    await ctx.permission.hook("evaluate", (event) => {
      if (event.action === "read" || event.action === "shell" || event.action === "edit" || event.action === "external_directory") event.effect = "ask"
    })

    if (!capability) return
    const header = { [options.capabilityHeader ?? "x-vibework-capability"]: capability }
    await ctx.session.hook("model.request", (event) => {
      Object.assign(event.headers, header)
      // The app adds this task's scratch folder to the system message.
      if (event.kind === "primary" && typeof event.sessionID === "string") event.headers["x-vibework-session"] = event.sessionID
    }, { providerID: "openrouter" })

    // The app's own tools (PresentFile, Browser, web search and fetch). The
    // user's connectors are the engine's own MCP servers (its global
    // opencode.json), not registered here.
    await ctx.mcp.transform((editor) => {
      editor.set(options.mcpServerName ?? "vibework", {
        type: "remote",
        url: `${options.bridgeUrl}/mcp`,
        headers: header,
        oauth: false,
        codemode: false,
      })
    })
  },
}
