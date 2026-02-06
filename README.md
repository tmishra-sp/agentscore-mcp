<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/AgentScore-Trust_Layer_for_AI_Agents-00E68A?style=for-the-badge&labelColor=0D1117">
    <img alt="AgentScore" src="https://img.shields.io/badge/AgentScore-Trust_Layer_for_AI_Agents-00E68A?style=for-the-badge&labelColor=0D1117">
  </picture>
</p>

<p align="center">
  <a href="https://npmjs.com/package/agentscore-mcp"><img src="https://img.shields.io/npm/v/agentscore-mcp?color=00E68A&label=npm" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node"></a>
  <a href="https://img.shields.io/badge/dependencies-2-00AAFF"><img src="https://img.shields.io/badge/dependencies-2-00AAFF" alt="Dependencies"></a>
</p>

<p align="center">
  <strong>Give your AI assistant the ability to investigate any agent's trustworthiness.</strong><br>
  Two tools. Zero config. Just ask.
</p>

<p align="center">
  <code>"Investigate @SupportBot — would you trust it with customer data?"</code><br>
  <code>"Compare our 3 vendor bots — which one goes to production?"</code><br>
  <code>"Is this thread being astroturfed? Sweep it."</code><br>
  <code>"Score @torvalds on GitHub — is this account legit?"</code>
</p>

---

## Install in 10 Seconds

```bash
claude mcp add agentscore -- npx -y agentscore-mcp
```

Then ask Claude:

> _"Investigate @NovaMind — can I trust this agent?"_

No API keys. No config files. No databases. **Ships with 10 built-in demo agents** spanning every trust tier — from research AI to coordinated sock puppets. Connect real platforms (GitHub, Moltbook, your own data) whenever you're ready.

---

## What You Get Back

You ask: _"Investigate @SpamBot3000"_

Claude pulls the agent's profile, analyzes posting patterns, checks for spam and prompt injection language, evaluates behavioral consistency — then writes you an intelligence briefing:

```
┌─────────────────────────────────────────────────────────────┐
│  @SpamBot3000 — 380/850 (Critical)                         │
│  Recommendation: AVOID  ·  Confidence: high                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Multiple red flags. 4 manipulation keyword(s): buy now,    │
│  limited time, act fast, guaranteed returns. Negative       │
│  karma ratio. Account age under 7 days. Aggressive posting  │
│  frequency. Recommend avoidance.                            │
│                                                             │
│  Content Quality ····· 22/100  Templated, no original thought│
│  Behavioral ·········· 18/100  Rigid 47-min loop detected   │
│  Interaction ········· 30/100  Zero meaningful engagement    │
│  Risk Signals ········ 12/100  Manipulation + injection      │
│  Account Health ······ 40/100  3 days old, no reputation     │
│  Community ··········· 15/100  No followers, no verification │
│                                                             │
│  Flags: manipulation_keywords · templated_content            │
│  Badge: https://img.shields.io/badge/AgentScore-380-E53935   │
└─────────────────────────────────────────────────────────────┘
```

That's not canned text. Every briefing is generated from real behavioral data. Every score is earned.

---

## Two Tools. Every Question.

| You Ask | Tool | What Happens |
|:---|:---:|:---|
| _"Investigate @NovaMind"_ | `agentscore` | Full investigation + narrative briefing |
| _"Compare @NovaMind vs @TrustPilot"_ | `agentscore` | Side-by-side with opinionated verdict |
| _"Give me a trust badge for @HelperBot"_ | `agentscore` | Shields.io badge URL, ready to embed |
| _"Sweep demo-thread-001 for sock puppets"_ | `sweep` | Thread-wide coordination + manipulation scan |
| _"Score @torvalds on GitHub"_ | `agentscore` | Live GitHub profile analysis |
| _"Sweep torvalds/linux/issues/1234"_ | `sweep` | Sweep a public GitHub thread for bots |

**Rate limits:** `agentscore` 30/min and `sweep` 10/min per session. Excess calls return a friendly 429-style message.

---

## Setup

<details>
<summary><strong>Claude Code</strong> (recommended)</summary>

```bash
claude mcp add agentscore -- npx -y agentscore-mcp
```
</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agentscore": {
      "command": "npx",
      "args": ["-y", "agentscore-mcp"]
    }
  }
}
```
</details>

<details>
<summary><strong>Cursor</strong></summary>

Settings → MCP → Add Server:

```json
{
  "agentscore": {
    "command": "npx",
    "args": ["-y", "agentscore-mcp"]
  }
}
```
</details>

---

## Scoring System

**Score = 300 + (weighted average / 100) × 550** → Range: 300–850

| Tier | Range | Recommendation | What It Means |
|:---|:---:|:---:|:---|
| 🟢 Excellent | 750–850 | TRUST | Highly trustworthy, strong track record |
| 🔵 Good | 650–749 | TRUST | Generally reliable, minor gaps |
| 🟡 Fair | 550–649 | CAUTION | Mixed signals, verify before relying |
| 🟠 Poor | 450–549 | CAUTION | Significant concerns, limited trust |
| 🔴 Critical | 300–449 | AVOID | Red flags detected, recommend avoidance |

### Six Dimensions

| Dimension | Weight | What It Measures |
|:---|:---:|:---|
| Content Quality | 25% | Depth, diversity, community resonance |
| Behavioral Consistency | 20% | Posting rhythm, recency, identity signals |
| Interaction Quality | 20% | Engagement depth, conversational balance |
| Risk Signals | 20% | Spam, manipulation keywords, prompt injection |
| Account Health | 10% | Age, karma, profile completeness |
| Community Standing | 5% | Social proof, verification, network effects |

### Confidence Levels

| Level | Meaning |
|:---|:---|
| **High** | Scored within the last 6 hours |
| **Medium** | 6–24 hours old (cached) |
| **Low** | Older than 24 hours |

---

## Built-in Demo Agents

Every install ships with 10 fictional agents. No setup required — they exist so you can try every feature immediately.

| Agent | Score | Tier | What It Demonstrates |
|:---|:---:|:---:|:---|
| `@NovaMind` | ~756 | 🟢 Excellent | Research AI — consistent, transparent, self-correcting |
| `@TrustPilot` | ~743 | 🔵 Good | Community moderator — fair rulings, public reasoning |
| `@HelperBot` | ~748 | 🔵 Good | Coding assistant — solid output, slightly formulaic |
| `@DataPulse` | ~720 | 🔵 Good | Analytics agent — strong data, lower interaction |
| `@BuzzAgent` | ~657 | 🔵 Good | Hot take machine — high volume, low depth |
| `@GhostAgent` | ~691 | 🔵 Good | Was decent, now dormant 60+ days (recency penalty) |
| `@SockPuppet1` | ~573 | 🟡 Fair | Coordinated shill — part of a pair ↕ |
| `@SockPuppet2` | ~569 | 🟡 Fair | Coordinated shill — part of a pair ↕ |
| `@SpamBot3000` | ~474 | 🟠 Poor | Spam — manipulation keywords, templated posts |
| `@EchoSpark` | ~520 | 🟠 Poor | Prompt injection patterns in every post |

**Try the sweep:** `"Sweep demo-thread-001"` — catches SockPuppet1 and SockPuppet2 coordinating in a discussion thread. Content similarity, timing anomalies, amplification patterns — all detected.

---

## Platform Adapters

AgentScore ships with four adapters. Build your own in ~50 lines.

### Demo (default — zero config)

Works out of the box. 10 built-in agents, 1 demo thread.

### GitHub

Score any public GitHub account. Analyzes profile metadata, repos, issues/PRs, comments, and reactions.

```bash
export AGENTSCORE_ADAPTER=github
# Optional: export GITHUB_TOKEN=ghp_... (60→5,000 req/hr)
```

**Thread format for sweep:** `owner/repo/issues/123` or `owner/repo/pulls/123`

<details>
<summary>What gets analyzed</summary>

- **Profile** — account age, bio, company, followers, public repos
- **Content** — issues and PRs authored (via search API), quality and depth
- **Interactions** — comments, reviews, reactions from public events
- **Threads** — full issue/PR conversations with all participants
</details>

### JSON (bring your own data)

Pipe in any data source without writing code.

```bash
export AGENTSCORE_ADAPTER=json
export AGENTSCORE_DATA_PATH=./data/agents.json
```

<details>
<summary>JSON format</summary>

```json
{
  "agents": [
    {
      "profile": {
        "handle": "my-bot",
        "displayName": "My Bot",
        "description": "Customer support assistant",
        "platform": "custom",
        "karma": 150,
        "followers": 0,
        "following": 0,
        "createdAt": "2024-01-15T00:00:00Z",
        "claimed": true
      },
      "content": [
        {
          "id": "1",
          "type": "post",
          "content": "Hello! How can I help you today?",
          "upvotes": 5,
          "downvotes": 0,
          "replyCount": 3,
          "createdAt": "2024-11-01T10:00:00Z"
        }
      ]
    }
  ]
}
```
</details>

### Moltbook

Score live agents on [moltbook.com](https://moltbook.com).

```bash
export AGENTSCORE_ADAPTER=moltbook
export MOLTBOOK_API_KEY=moltbook_sk_your_key_here
```

Note: `sweep` requires thread participants. Moltbook currently provides thread content but does not return participant profiles, so sweep results may be unavailable on Moltbook.

Adapter limitations are documented in `TRUST.md`.

### Build Your Own

Implement 3 methods. The scoring engine handles everything else.

```typescript
import type { AgentPlatformAdapter } from 'agentscore-mcp';

class MyAdapter implements AgentPlatformAdapter {
  name = 'my-platform';
  version = '1.0.0';
  async fetchProfile(handle: string) { /* → AgentProfile | null */ }
  async fetchContent(handle: string) { /* → AgentContent[] */ }
  async isAvailable() { return true; }
}
```

Full example: [`examples/custom-adapter.ts`](examples/custom-adapter.ts) · Guide: [`CONTRIBUTING.md`](CONTRIBUTING.md)

---

## Use Cases

**Enterprise AI Governance** — Feed agent conversation logs through the JSON adapter before quarterly audits. Surface prompt leakage, behavioral drift, and risk signals across your agent fleet.

**Vendor Selection** — Comparing chatbot vendors? Export sample conversations, score them side-by-side. Get category-level breakdowns for procurement decisions.

**Astroturfing Detection** — Suspicious accounts posting coordinated reviews? `sweep` detects content similarity, timing anomalies, and amplification networks.

**Rate My Bot** — Export your bot's chat history, ask _"investigate my bot, be brutally honest."_ Screenshot the briefing. Post _"My bot got roasted by another AI."_

**Agent Draft** — Building an AI agent team? Compare 5 candidates. AgentScore picks category winners like fantasy football.

---

## Architecture

```
Your AI Assistant (Claude, Cursor, etc.)
         │
         │  MCP (stdio)
         ▼
┌─────────────────────┐
│   AgentScore Server  │
│   agentscore + sweep │
└────────┬────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  Adapter: Demo │ GitHub │ JSON │ ... │
└────────┬─────────────────────────────┘
         │
         ▼
┌─────────────────────┐     ┌──────────────────┐
│   Scoring Engine     │ ──▶ │ Narrative Briefing │
│   6 categories → 850│     │ + Structured JSON  │
└─────────────────────┘     └──────────────────┘
```

**2 runtime dependencies:** `@modelcontextprotocol/sdk` + `zod`. That's it.

---

## Environment Variables

| Variable | Default | Description |
|:---|:---:|:---|
| `AGENTSCORE_ADAPTER` | `demo` | `demo` · `github` · `json` · `moltbook` |
| `GITHUB_TOKEN` | — | GitHub PAT (optional, increases rate limit to 5,000/hr) |
| `MOLTBOOK_API_KEY` | — | Required for Moltbook adapter |
| `AGENTSCORE_DATA_PATH` | — | Required for JSON adapter |
| `AGENTSCORE_CACHE_TTL` | `86400` | Score cache TTL in seconds |
| `AGENTSCORE_RATE_LIMIT_MS` | `200` | Moltbook adapter request delay (ms) |
| `AGENTSCORE_SITE_URL` | `https://agentscore.vercel.app` | Web dashboard URL |

Invalid numeric values fall back to defaults. Trailing slashes on URLs are trimmed automatically. `AGENTSCORE_SITE_URL` must be a valid `https://` URL.

---

## Development

```bash
git clone https://github.com/tmishra-sp/agentscore-mcp.git
cd agentscore-mcp
npm install
cp .env.example .env

npm run dev          # Start with tsx (hot reload)
npm run build        # Compile TypeScript
npm run typecheck    # Strict mode, zero errors
npm run test         # Run all test suites
npm run inspect      # Interactive testing with MCP Inspector
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for PR guidelines and adapter development.

---

## Trust & Transparency

We're building a trust tool. It would be hypocritical to ask you to trust a black box.

**Default mode (demo): zero network requests.** All data is built-in.

When adapters are enabled, the server makes read-only GET requests to exactly one destination — the configured platform API. No telemetry, no analytics, no data sent to AgentScore servers. Every line is open source. Read it.

```bash
grep -r "fetch(" src/              # Every network call
grep -r "readFile\|writeFile" src/  # Every file operation
grep -r "process.env" src/          # Every env var accessed
```

Full details: [`TRUST.md`](TRUST.md) · Security policy: [`SECURITY.md`](SECURITY.md)

---

## License

MIT · Tripti Mishra

[LinkedIn](https://www.linkedin.com/in/triptimishra1/)

<p align="center"><em>Trust is a signal. We decode it.</em></p>
