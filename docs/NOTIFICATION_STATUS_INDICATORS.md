# Task status indicators

DESIGN.md is the source of truth for task status presentation. Working tasks use
a spinner, tasks waiting for input use amber, and unseen completed tasks use blue.
AgentSessionsContext holds session state; the sidebar and desktop notification
components render it. Do not infer task activity from a selected tab or window.
