# Message rendering

Completed history and current streamed output are reconciled in
src/contexts/AgentSessionsContext.tsx and src/utils/agentEventHandler.ts.
The Rust engine adapter emits the shared frontend message types. Streaming text
is paced by useSmoothedText; history should render immediately. See DESIGN.md
and the tests beside src/lib and src/utils for current behavior.
