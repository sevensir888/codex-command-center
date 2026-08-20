# Security Policy

## Supported versions

Security fixes are accepted for the current public release line:

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |

## Reporting a vulnerability

Codex Command Center is a local desktop application that can inspect local project paths, Git status, Codex session metadata, Skills, and MCP configuration. Please do not disclose exploitable vulnerabilities publicly before the maintainer has had a reasonable opportunity to review them.

Use GitHub's private vulnerability reporting feature if it is enabled for the repository. If it is not enabled yet, open a public issue only with a high-level description and omit exploit details, secrets, private paths, tokens, and sensitive logs.

Useful reports include:

- affected app version or commit;
- Windows version;
- Codex CLI version if relevant;
- exact reproduction steps;
- expected and actual behavior;
- whether local files, session metadata, Git diffs, or configuration previews are affected;
- screenshots or logs with secrets and private content removed.

## Scope

In scope:

- unintended exposure of local paths, Codex session content, Git diffs, or configuration values;
- insufficient redaction of secret-like configuration lines;
- unsafe filesystem, process, Codex CLI, or Git command behavior;
- packaging or update workflow issues that could affect users of official release artifacts.

Out of scope:

- vulnerabilities in unrelated local repositories opened through the app;
- issues caused by third-party Codex, Git, Rust, Node, or operating-system installations unless Codex Command Center handles them unsafely;
- social engineering, spam, or denial-of-service reports without a product-specific impact.
