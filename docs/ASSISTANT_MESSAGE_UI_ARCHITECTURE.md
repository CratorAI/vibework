# Assistant messages

The OpenCode adapter in src-tauri/src/engine translates engine events and history
into the UI message types. AgentSessionsContext buffers streaming updates;
agentEventHandler applies incoming events. Components in src/components/blocks
render text, thinking and tools. DESIGN.md describes current presentation rules.
External CLI adapters have their own recorded-fixture tests. Keep render behavior
consistent between history replay and streaming; run Vitest after changes.
