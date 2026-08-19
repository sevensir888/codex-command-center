# Changelog

All notable changes to Codex Command Center are documented here.

The format is based on Keep a Changelog, and this project uses semantic versioning for public release candidates.

## [Unreleased]

### Added

- Release-readiness automation for CI, dependency updates, and Windows release packaging.
- Public project documentation for contribution, security reporting, maintainership, and roadmap planning.

## [0.1.0] - Release candidate

### Added

- Windows-first Tauri desktop shell for a local Codex workflow workspace.
- Project registration for local development folders.
- Lightweight engineering task tracking with Planned, Active, Completed, and Blocked states.
- Local Codex session metadata discovery and task-session linking.
- Codex CLI launch and resume actions through native commands.
- Git status, staged/unstaged file visibility, per-file diff loading, staging, unstaging, and commit support.
- Codex CLI, local configuration, Skills, and MCP server visibility.
- Local JSON state storage under the user's local application data directory.

### Documentation

- README, release notes, roadmap, contribution guide, security policy, issue forms, and pull request template for public evaluation.
- Attribution notes preserving the project's relationship to CodMate and the Apache-2.0 license.

### Packaging

- Tauri metadata normalized for Codex Command Center v0.1.0.
- Windows release workflow prepared for tagged release builds.

### Known limitations

- The project is Windows-first. Other desktop platforms are not documented as release targets.
- Installers are unsigned unless the maintainer later adds code signing.
- The app expects local Codex CLI and Git commands to be available for launch/resume and Git review features.
