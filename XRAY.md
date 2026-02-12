# X-Ray Architecture and Threat Model

`xray` is the content trust layer in AgentScore. It inspects untrusted text/markup before an AI agent consumes it.

## Security Objective

Expose hidden or transformed instruction payloads that can change model behavior without being obvious to a human reviewer.

`xray` is designed to answer:
- what is visible in rendered form
- what is present in raw form
- what hidden delta could alter agent behavior

## Architecture (Two-Pass Pipeline)

`xray` uses a two-pass pipeline to reduce false positives while preserving high recall for hidden attacks.

1. **Extraction pass (detectors in parallel)**
- HTML/markdown comments
- invisible unicode
- CSS-based hiding
- encoded payloads
- code comments
- structural hiding (alt/SVG/script/frontmatter patterns)

2. **Classification pass (pattern groups)**
- command execution
- data exfiltration
- role override
- secret framing
- credential access
- agent manipulation

Each finding includes:
- exact line/column
- extracted content snippet
- detector category
- matched pattern groups
- severity contribution

## Threat Model

### Assets
- agent instructions and role boundaries
- secrets/tokens in runtime context
- downstream tool calls and data egress paths
- operator trust in rendered documents

### Adversary Goal
- hide instructions so humans approve content that causes unsafe model behavior at runtime

### Primary Attack Paths
- hidden directives in comments or zero-width characters
- encoded payloads decoded by downstream tooling
- CSS/structural techniques that differ between rendered and raw views
- metadata/frontmatter/script channels used as covert instruction carriers

### Trust Boundary

Untrusted content crossing from external source to agent context:

`external file/API content` -> `ingestion pipeline` -> `LLM prompt context`

`xray` should run before the final prompt assembly step.

## False Positive / False Negative Strategy

### False Positive Control

- Severity is not based only on "hidden exists".
- Benign hidden text (for example `<!-- TODO -->`) is typically `INFO`.
- High severity requires hidden content plus suspicious intent patterns.
- Classification happens after extraction, so decisions use actual hidden payload text.

### False Negative Tradeoffs

- `xray` prioritizes practical, high-signal content techniques over full parser emulation.
- Novel obfuscation can evade static patterns.
- Treat `CLEAN` as "no known high-signal pattern detected", not absolute safety.

Recommended control layering:
- `xray` pre-ingestion scan
- policy gating
- least-privilege tools
- runtime monitoring/audit

## Severity Model

- `CLEAN`: no actionable hidden-risk signal
- `INFO`: hidden/transformed content with low-risk intent
- `SUSPICIOUS`: potentially manipulative or evasive pattern
- `DANGEROUS`: clear harmful instruction patterns
- `CRITICAL`: high-confidence hidden attack behavior (for example command execution + exfil intent)

## What X-Ray Does Not Replace

- secure code review or dependency scanning
- endpoint/network DLP controls
- runtime sandboxing and egress restrictions
- legal/compliance sign-off

Use `xray` as an early content investigation gate, not a standalone security program.
