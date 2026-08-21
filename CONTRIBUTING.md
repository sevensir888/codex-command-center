# Contributing

Thanks for considering a contribution to Codex Command Center.

The project is intentionally focused: it organizes local Codex engineering work around projects, tasks, sessions, Git changes, Skills, and MCP configuration. Contributions should strengthen that workflow without turning the app into an IDE, terminal emulator, chat client, cloud service, or generic provider dashboard.

## Setup

Requirements:

- Windows 11 for the primary desktop development target.
- Node.js 24, matching the current CI/build environment.
- Rust and Cargo for Tauri development and desktop builds.
- Git on `PATH`.
- Codex CLI on `PATH` when testing launch, resume, session, Skills, or MCP behavior.

Install dependencies:

```bash
npm ci
```

Run the browser development surface:

```bash
npm run dev
```

Run the desktop app when Rust and Tauri prerequisites are available:

```bash
npm run tauri:dev
```

## Validation

Run the narrowest useful checks for your change. For most frontend or documentation changes:

```bash
npm run build
npm run check:secrets
```

For native changes, also run Rust checks from the repository root when Cargo is available:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

For packaging changes:

```bash
npm run tauri:build
```

## Coding expectations

- Keep the product Codex-only and local-first.
- Use existing React, TypeScript, Tauri, and Rust patterns before adding abstractions.
- Keep native commands small and explicit.
- Do not add cloud sync, accounts, telemetry, marketplace behavior, remote SSH orchestration, or provider switching.
- Keep UI and repository-facing text in professional English.
- Preserve readable errors such as "Codex CLI was not found." instead of exposing stack traces.
- Avoid unrelated refactors in bug-fix pull requests.

## Privacy and sensitive data

Codex Command Center may inspect local project paths, Git diffs, Codex session metadata, Skills, and MCP configuration. Do not include secrets, tokens, private repository content, personal data, session transcripts, or machine-specific identifiers in issues, screenshots, tests, or fixtures.

Use neutral examples such as `sample-web-app`, `desktop-client`, and `api-service`.

## Questions and discussions

Use [GitHub Discussions](https://github.com/sevensir888/codex-command-center/discussions) for usage questions, workflow discussion, open-ended ideas, and general feedback. Keep focused bug reports and actionable feature requests in Issues.

Report security vulnerabilities through the repository [Security page](https://github.com/sevensir888/codex-command-center/security) and private vulnerability reporting, not public Issues.

## Reporting bugs

Use the bug report form and include:

- app version or commit;
- Windows version;
- Codex CLI version if relevant;
- reproduction steps;
- expected and actual behavior;
- logs or screenshots with sensitive data removed.

## Proposing features

Feature requests should describe the workflow problem, the proposed behavior, alternatives considered, and the expected benefit. Requests that require cloud accounts, telemetry, collaboration hosting, generic provider switching, or remote execution are outside the current scope.

## Pull requests

Good pull requests are focused, explain the problem, describe the implementation, include validation evidence, and update documentation when behavior changes. UI changes should include screenshots.

Maintainer review focuses on:

- product scope;
- local-first behavior;
- correctness and maintainability;
- privacy and redaction;
- Windows reliability;
- attribution and licensing;
- test or build evidence.
