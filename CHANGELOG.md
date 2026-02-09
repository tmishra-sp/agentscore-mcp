## Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Release workflow now prioritizes npm trusted publishing (OIDC) with provenance, and supports a temporary `NPM_TOKEN` fallback during migration.
- Package metadata now uses normalized git repository URL and explicit publish config (`access: public`, `provenance: true`) to match npm best practices.
- Release docs now include a trusted-publishing-first setup and secret-removal guidance.

## [1.0.3] - 2026-02-09

### Added
- Tag-driven npm release workflow (`.github/workflows/release.yml`) with version/tag validation and full verification gates.
- Public contract regression suite (`test/public-contract.test.mjs`) to enforce README install/npm link correctness and report URL shape.
- JSON sample data file for README reference (`examples/agents.sample.json`).
- Launch kit assets for distribution (`marketing/launch-kit.md`).

### Changed
- Report URLs now use handle-based routes (`/agent/{handle}`) to match the public site route shape.
- README now clarifies the public site role (index/leaderboard) and report-link behavior.

## [1.0.2] - 2026-02-08

### Added
- `AGENTSCORE_PUBLIC_MODE` guardrail for production deployments, requiring an explicit adapter and blocking the demo adapter.
- Runtime/package version consistency check in the regression suite.
- `npm run package:check` (`npm pack --dry-run`) and CI packaging gate on Node 20.
- Dependabot configuration for npm and GitHub Actions updates.

### Changed
- Adapter and server version metadata now use a single shared runtime version constant.
- `prepublishOnly` now runs full verification (`coverage` + package dry-run).
- README/TRUST/.env docs now include production-mode guidance.
- GitHub Actions workflow now pins `actions/checkout` and `actions/setup-node` to immutable commit SHAs.
- Trust/security docs now clearly state outbound behavior for configured third-party adapter APIs.

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
