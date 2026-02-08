## Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `AGENTSCORE_PUBLIC_MODE` guardrail for production deployments, requiring an explicit adapter and blocking the demo adapter.
- Runtime/package version consistency check in the regression suite.
- `npm run package:check` (`npm pack --dry-run`) and CI packaging gate on Node 20.

### Changed
- Adapter and server version metadata now use a single shared runtime version constant.
- `prepublishOnly` now runs full verification (`coverage` + package dry-run).
- README/TRUST/.env docs now include production-mode guidance.

## [1.0.1] - 2026-02-07

### Added
- CI workflow for build, typecheck, and test runs.
- Public readiness regression tests for partial failures and comparison guards.
- Adapter contract regression tests for GitHub and Moltbook retry/outage behavior.
- CI coverage gate with minimum thresholds and `c8` reporting.

### Changed
- agentscore now continues scoring remaining handles and reports per-handle errors.
- GitHub thread ID parsing accepts `pulls` in addition to `issues`.
- README clarifies confidence levels, partial failures, and env behavior.
- CI now enforces build, typecheck, full test suite, and coverage checks.
- Sweep falls back to content-only coordination analysis when participant profiles are unavailable.
- Moltbook thread participant extraction now uses available thread author metadata.

### Fixed
- Comparison verdict generation now handles missing category data.
- Invalid `createdAt` no longer causes silent NaN age handling.
- Sweep timing analysis ignores invalid timestamps.
- Invalid `AGENTSCORE_ADAPTER` values now fail fast with a clear startup error.
- GitHub client now handles 403 and 429 rate-limit responses with retry/backoff.
- Tool rate-limiting no longer collapses callers into a shared anonymous bucket.

## [1.0.0] - 2026-02-06

### Added
- MCP server with `agentscore` and `sweep` tools.
- Demo, GitHub, JSON, and Moltbook adapters.
- Scoring engine with six weighted categories and narrative briefings.
- Trust tiers, badges, caching, and configuration system.
