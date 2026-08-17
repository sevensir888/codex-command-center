# Codex Command Center Repository Guidelines

Purpose
- This repository contains Codex Command Center, a Windows-first Tauri 2 + React + TypeScript desktop application for organizing local Codex engineering work.
- Keep the product Codex-only. Do not add Claude, Gemini, generic provider switching, OAuth provider management, remote SSH orchestration, cloud sync, telemetry, accounts, or marketplace features.

Product Model
- The primary workflow is `Project -> Task -> Codex Session -> File Changes -> Result`.
- Projects are local folder references only. Do not copy project source code into application storage.
- Tasks are lightweight engineering objectives with Planned, Active, Completed, and Blocked statuses.
- Codex sessions are indexed as external local history. Do not mutate Codex session files.
- Git review should stay lightweight: branch, staged and unstaged files, diff, stage, unstage, and commit.

Architecture
- Frontend: `src/` with React and TypeScript.
- Native shell: `src-tauri/` with Rust commands for filesystem, process, Git, Codex, Skills, and MCP discovery.
- Storage: local JSON state under the user local app data directory. SQLite may be introduced only if the data model outgrows JSON.
- Keep native commands small and explicit. Avoid adding background services or long-running supervisors.

UI Rules
- English-only UI and repository-facing text.
- Use restrained desktop-native styling: dark, dense, readable, subtle borders, clear spacing.
- Do not build an IDE, code editor, terminal emulator, chat client, or advanced Git client.
- Do not show raw secrets, tokens, API keys, or stack traces in normal UI.
- Error messages should be understandable, for example: "Codex CLI was not found." or "This directory is not a Git repository."

Implementation Rules
- Prefer small, direct data structures over framework-heavy abstractions.
- Keep task organization more prominent than raw session browsing.
- Keep all functionality local-first. Do not send project paths, source code, sessions, Git diffs, or configuration to external services.
- Use existing package scripts from `package.json`.
- Do not create generated reports, screenshots, or build artifacts in the repository unless explicitly requested.

Validation
- For ordinary changes run the narrowest useful checks, usually `npm run build`.
- For native changes, also run `npm run tauri:build` when Rust/Cargo and Tauri prerequisites are available.
- If Rust/Cargo is unavailable, report that clearly instead of claiming the Tauri build passed.

Git
- Do not commit, tag, push, merge, or rewrite history unless explicitly requested.
- Preserve unrelated user changes.
- Keep changes focused on the requested product direction.
