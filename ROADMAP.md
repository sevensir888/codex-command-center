# Roadmap

This roadmap describes plausible directions for Codex Command Center. It is not a dated commitment.

## Current focus

- Keep the product centered on `Project -> Task -> Codex Session -> File Changes -> Result`.
- Make Windows setup, local builds, screenshots, and release packaging reproducible.
- Improve documentation accuracy around local-first behavior, Codex CLI integration, Git review, Skills, and MCP visibility.

## Near term

- Improve filtering and search across projects, tasks, and indexed Codex sessions.
- Add clearer task completion summaries and blocked-state notes.
- Make Git review more ergonomic without becoming a full Git client.
- Improve Codex session parsing resilience across local history formats.
- Expand lightweight tests for state normalization, session indexing, and redaction behavior.
- Improve accessibility for keyboard navigation, focus states, and table-heavy views.

## Later / exploratory

- More structured task/session timelines.
- Optional import/export for local application state.
- Better diagnostics for missing Codex CLI, Git, Rust, and Tauri build prerequisites.
- Additional packaging checks for unsigned Windows installers.
- Deeper visibility into locally configured Skills and MCP servers while preserving redaction.

## Non-goals

- Cloud sync, hosted accounts, telemetry, analytics, or remote repository orchestration.
- Provider switching or a generic AI-chat workspace.
- A built-in IDE, terminal emulator, advanced Git client, or code editor.
- Fabricated usage metrics, testimonials, or community activity.
