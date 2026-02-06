## Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- CI workflow for build, typecheck, and test runs.
- Public readiness regression tests for partial failures and comparison guards.

### Changed
- agentscore now continues scoring remaining handles and reports per-handle errors.
- GitHub thread ID parsing accepts `pulls` in addition to `issues`.
- README clarifies confidence levels, partial failures, and env behavior.

### Fixed
- Comparison verdict generation now handles missing category data.
- Invalid `createdAt` no longer causes silent NaN age handling.
- Sweep timing analysis ignores invalid timestamps.

## [1.0.0] - 2026-02-06

### Added
- MCP server with `agentscore` and `sweep` tools.
- Demo, GitHub, JSON, and Moltbook adapters.
- Scoring engine with six weighted categories and narrative briefings.
- Trust tiers, badges, caching, and configuration system.
