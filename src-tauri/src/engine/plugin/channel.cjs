"use strict";
// The launch payload ({ capability, connectors: [names] }) arrives once, on the
// engine's stdin, written by the app and closed. It is read on first use and
// kept in memory: never in process.env, a file or an argument, so commands
// and MCP servers the engine starts cannot see it. The engine instantiates
// plugins once per location; the payload is shared through a process-wide
// symbol so later locations reuse the first read (stdin is at EOF by then).
const fs = require("node:fs");
const KEY = Symbol.for("vibework.engine.launch");

function read() {
  if (globalThis[KEY] === undefined) {
    let text = "";
    try { text = fs.readFileSync(0, "utf8"); } catch (e) { text = ""; }
    let payload = {};
    try { payload = JSON.parse(text); } catch (e) { payload = {}; }
    Object.defineProperty(globalThis, KEY, { value: Object.freeze(payload), enumerable: false, configurable: false, writable: false });
  }
  return globalThis[KEY];
}

module.exports = Object.freeze({ read });
