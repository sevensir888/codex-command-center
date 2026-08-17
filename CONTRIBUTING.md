# Contributing

Codex Command Center is intentionally focused: it organizes local Codex engineering work around projects, tasks, sessions, Git changes, Skills, and MCP configuration.

Please keep contributions aligned with that scope.

## Local Development

```bash
npm install
npm run dev
npm run build
```

Use `npm run tauri:dev` when the local Tauri and Rust toolchain is available.

## Guidelines

- Keep the product Codex-only.
- Keep the app local-first.
- Avoid adding cloud services, accounts, telemetry, provider marketplaces, remote execution, terminal emulation, embedded editors, or chat-client behavior.
- Keep UI text English-only.
- Prefer small, readable changes over broad rewrites.
- Do not expose API keys, tokens, secrets, or raw stack traces in user-facing UI.
