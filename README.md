# Codex Command Center

**Turn Codex sessions into organized engineering work.**

Codex Command Center is a local desktop control center for organizing projects, engineering tasks, Codex sessions, Git changes, Skills, and MCP configuration. Codex remains the execution engine for reasoning, editing, commands, and tests; Codex Command Center provides the organizational layer above that work.

![Codex Command Center banner](public/repository-banner.png)

## Overview

Developers can accumulate many Codex sessions across many repositories. Those sessions are valuable, but engineering work is usually tracked by project, objective, code changes, and result.

Codex Command Center connects those pieces into one local workflow:

`Project -> Task -> Codex Session -> File Changes -> Result`

The app is intentionally smaller than an IDE, a chat client, or a full Git GUI. It focuses on keeping Codex engineering work understandable and resumable.

## Features

- **Project workspace**: register local development folders and see branch, Git state, task counts, and recent activity.
- **Engineering tasks**: organize objectives with Planned, Active, Completed, and Blocked statuses.
- **Local Codex session indexing**: discover useful metadata from local Codex session files without mutating them.
- **Session resume**: resume a selected Codex session through the local Codex CLI.
- **Launch Codex for a task**: start Codex from a project with the task title and context.
- **Git change review**: inspect branch, staged files, unstaged files, working-tree state, and readable diffs.
- **Codex CLI visibility**: show detected Codex executable and version when available.
- **Skills discovery**: browse locally discoverable Codex Skills.
- **MCP visibility**: show locally discoverable MCP server configuration.
- **Local-first storage**: keep projects, tasks, session links, and settings on the local machine.
- **No telemetry**: no analytics, accounts, cloud sync, or source-code upload.

## Screenshots

Screenshots can be added under `docs/screenshots/` when release images are captured.

Suggested first screenshots:

- `docs/screenshots/dashboard.png`
- `docs/screenshots/project-workspace.png`
- `docs/screenshots/codex-environment.png`

## How It Works

- **Project**: a local source folder that Codex works inside.
- **Task**: an engineering objective, such as implementing settings, fixing a bug, or preparing a release.
- **Codex Session**: local Codex history associated with a task or project.
- **File Changes**: current Git state for the selected project.
- **Result**: the completed, blocked, or still-active outcome of the engineering task.

Codex Command Center indexes Codex sessions as external local data. It does not rewrite Codex history and does not copy project source code into application storage.

## Local-First

Codex Command Center is designed for local engineering workflows:

- project references stay local;
- Codex sessions stay local;
- Git diffs stay local;
- Skills and MCP configuration are inspected locally;
- no telemetry or external analytics are added;
- no cloud synchronization is added.

Configuration previews redact lines that appear to contain keys, tokens, secrets, or passwords.

## Requirements

- Windows 11 is the primary target.
- Node.js 20 or newer.
- Rust and Cargo for Tauri desktop development builds.
- Codex CLI on `PATH` for resume and launch actions.
- Git on `PATH` for Git review.

## Development

Install dependencies:

```bash
npm install
```

Run the web development surface:

```bash
npm run dev
```

Run the desktop app:

```bash
npm run tauri:dev
```

Build the frontend:

```bash
npm run build
```

Build the desktop app:

```bash
npm run tauri:build
```

## Architecture

- **React + TypeScript** for the desktop UI.
- **Tauri 2** for the desktop shell.
- **Rust native commands** for local filesystem, process, Git, Codex, Skills, and MCP integration.
- **Local state** for projects, tasks, settings, and task-session associations.
- **Codex CLI/session integration** without adding a competing chat interface.
- **Git CLI integration** for lightweight repository review.

## GitHub Setup

Recommended repository description:

> A local desktop control center for organizing Codex projects, engineering tasks, sessions, Git changes, Skills, and MCP configuration.

Recommended topics:

`codex`, `codex-cli`, `developer-tools`, `ai-coding`, `tauri`, `rust`, `react`, `local-first`

## Relationship to CodMate

Codex Command Center evolved from the open-source CodMate project by Loocor. CodMate explored a macOS SwiftUI interface for managing CLI AI sessions across several tools. Codex Command Center narrows that work into a Windows-first, Codex-only control center focused on projects, tasks, sessions, and Git changes.

The Apache License 2.0 license and upstream attribution are preserved.

## Privacy

Codex Command Center does not add telemetry, analytics, accounts, cloud synchronization, source-code upload, Codex-session upload, or Git-diff upload. It is designed to organize local engineering work on the developer's machine.

## Disclaimer

Codex Command Center is an independent open-source project and is not affiliated with or endorsed by OpenAI.

