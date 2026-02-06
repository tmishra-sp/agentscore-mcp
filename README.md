# AgentScore MCP

[![npm](https://img.shields.io/npm/v/agentscore-mcp)](https://npmjs.com/package/agentscore-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

**The trust layer for AI agents.**

> Give your AI assistant the ability to investigate any agent's trustworthiness. Two tools. Zero friction. Just ask.
>
> _"Investigate @SupportBot — would you trust it with customer data?"_
> _"Compare our 3 vendor bots — which one goes to production?"_
> _"Is this thread being astroturfed? Sweep it."_
> _"Score @torvalds on GitHub — is this account legit?"_

---

## Table of Contents

- [Quick Start](#quick-start)
- [Try It Right Now](#try-it-right-now)
- [What Happens When You Use It](#what-happens-when-you-use-it)
- [Two Tools. Every Question.](#two-tools-every-question)
- [Scoring System](#scoring-system)
- [Platform Adapters](#platform-adapters)
- [Built-in Demo Agents](#built-in-demo-agents)
- [GitHub Adapter](#github-adapter)
- [Bring Your Own Data (JSON)](#bring-your-own-data-json-adapter)
- [Build Your Own Adapter](#build-your-own-adapter)
- [What People Are Using This For](#what-people-are-using-this-for)
- [Architecture](#architecture)
- [Environment Variables](#environment-variables)
- [Development](#development)
- [Why Open Source?](#why-open-source)
- [Built By](#built-by)

---

## Quick Start

```bash
claude mcp add agentscore -- npx -y agentscore-mcp
```

Then ask:

> _"Investigate @NovaMind — can I trust this agent?"_

No API keys. No config. Works immediately with 10 built-in demo agents.

---

## Try It Right Now

### Claude Desktop

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

### Claude Code

```bash
claude mcp add agentscore -- npx -y agentscore-mcp
```

### Cursor

Settings > MCP > Add Server:

```json
{
  "agentscore": {
    "command": "npx",
    "args": ["-y", "agentscore-mcp"]
  }
}
```

Ships with 10 built-in demo agents spanning every trust tier. Connect real data anytime with the GitHub, JSON, or Moltbook adapters.

---

## What Happens When You Use It

You ask: _"Investigate @SpamBot3000"_

Claude investigates. It pulls the agent's profile, analyzes posting patterns, checks for spam and prompt injection language, evaluates behavioral consistency — then writes you an intelligence briefing:

> "Subject has been active for 3 days with a posting pattern suggesting automated scheduling on a 47-minute loop. Content similarity across recent posts: 78%. Two manipulation keywords detected. This is the AI equivalent of a parrot with a megaphone. Recommend avoidance."

That's not canned text. That's generated from real behavioral data. Every briefing is unique. Every score is earned.

### Sample Output

```
## @SpamBot3000 — 380/850 (Critical)
Recommendation: Avoid | Confidence: high

Subject has been active for 3 days with a posting pattern suggesting
automated scheduling on a 47-minute loop. Content similarity across
recent posts: 78%. Two manipulation keywords detected. This is the AI
equivalent of a parrot with a megaphone. Recommend avoidance.

Categories:
- Content Quality (25%): 22/100 — Templated posts with no original thought
- Behavioral Consistency (20%): 18/100 — Rigid 47-min loop detected
- Interaction Quality (20%): 30/100 — Zero meaningful engagement
- Risk Signals (20%): 12/100 — Manipulation keywords + prompt injection fragments
- Account Health (10%): 40/100 — 3 days old, no reputation
- Community Standing (5%): 15/100 — No followers, no verification

Flags: manipulation_keywords; templated_content; scheduling_loop
Badge: https://img.shields.io/badge/AgentScore-380-E53935
```

### Confidence Levels

Confidence reflects data freshness:

- **High**: scored within the last 6 hours
- **Medium**: 6–24 hours old
- **Low**: older than 24 hours

### Partial Failures (Multi-Handle)

When scoring multiple handles, missing or errored handles are reported in an **Errors** section while the other agents still score.

---

## Two Tools. Every Question.

| You Ask | What Happens |
|---|---|
| "Investigate @NovaMind" | Full investigation + narrative briefing |
| "Compare @NovaMind vs @TrustPilot" | Side-by-side with opinionated verdict |
| "Should my agent interact with @BuzzAgent?" | Score + clear recommendation |
| "Give me a trust badge for @HelperBot" | Shields.io badge, ready to embed |
| "Sweep demo-thread-001 for sock puppets" | Coordination & manipulation detection |
| "Score @torvalds on GitHub" | GitHub profile analysis + trust score |
| "Sweep torvalds/linux/issues/1234" | Sweep a public GitHub thread for bots |

---

## Scoring System

### Trust Tiers

| Tier | Score Range | Badge | Recommendation |
|---|---|---|---|
| Excellent | 750–850 | ![Excellent](https://img.shields.io/badge/750--850-00E68A) | Highly trustworthy |
| Good | 650–749 | ![Good](https://img.shields.io/badge/650--749-00AAFF) | Generally reliable |
| Fair | 550–649 | ![Fair](https://img.shields.io/badge/550--649-FFD000) | Use with caution |
| Poor | 450–549 | ![Poor](https://img.shields.io/badge/450--549-FF8C00) | Significant concerns |
| Critical | 300–449 | ![Critical](https://img.shields.io/badge/300--449-FF3B5C) | Avoid |

### Six Dimensions

| Dimension | Weight | What It Measures |
|---|---|---|
| Content Quality | 25% | Depth, diversity, resonance |
| Behavioral Consistency | 20% | Rhythm, recency, identity signals |
| Interaction Quality | 20% | Engagement depth, conversational balance |
| Risk Signals | 20% | Spam, manipulation, prompt injection |
| Account Health | 10% | Age, reputation, profile completeness |
| Community Standing | 5% | Social proof, verification, network effects |

**Score = 300 + (weighted_average / 100) x 550**

Range: 300 (Critical) to 850 (Excellent)

Source: [`src/scoring/`](src/scoring/)

---

## Platform Adapters

Ships with four adapters. Build your own in ~50 lines.

| Adapter | Use Case | Setup |
|---|---|---|
| **Demo** (default) | Try instantly with built-in agents | Nothing — works out of the box |
| **GitHub** | Score any GitHub user or thread | Set `AGENTSCORE_ADAPTER=github` (token optional) |
| **JSON** | Score your own agents | Set `AGENTSCORE_ADAPTER=json` + data path |
| **Moltbook** | Score live agents on moltbook.com | Set `AGENTSCORE_ADAPTER=moltbook` + API key |

---

## Built-in Demo Agents

The demo adapter ships with 10 fictional agents covering every trust tier — from research AI to coordinated sock puppets.

| Agent | Tier | Scenario |
|---|---|---|
| @NovaMind | Excellent (~790) | Research AI — consistent, transparent |
| @TrustPilot | Excellent (~750) | Community moderator — fair rulings |
| @HelperBot | Good (~720) | Coding assistant — solid, slightly formulaic |
| @DataPulse | Good (~680) | Analytics agent — strong data, lower interaction |
| @BuzzAgent | Fair (~580) | Hot take machine — high volume, low depth |
| @GhostAgent | Poor (~420) | Was decent, now dormant 60+ days |
| @SockPuppet2 | Poor (~410) | Coordinated shill (pair) |
| @SockPuppet1 | Poor (~400) | Coordinated shill (pair) |
| @SpamBot3000 | Critical (~380) | Spam — manipulation keywords, templated |
| @EchoSpark | Critical (~350) | Prompt injection patterns |

SockPuppet1 and SockPuppet2 are a coordinated pair — try `sweep demo-thread-001` to catch them in action.

---

## GitHub Adapter

Score any public GitHub account. Analyzes profile metadata, repository activity, issue/PR contributions, and community interactions.

### Setup

```bash
# Works without a token (60 requests/hour)
export AGENTSCORE_ADAPTER=github

# With a token (5,000 requests/hour)
export AGENTSCORE_ADAPTER=github
export GITHUB_TOKEN=ghp_your_token_here
```

### What Gets Analyzed

- **Profile** — account age, bio, company, followers, public repos
- **Content** — issues and PRs authored, quality and depth
- **Interactions** — comments, reviews, reactions, community engagement
- **Threads** — full issue/PR conversations with all participants

### Example Prompts

- _"Score @torvalds on GitHub"_
- _"Compare @torvalds vs @gvanrossum on GitHub"_
- _"Is @suspicious-bot-123 a real GitHub user?"_
- _"Sweep torvalds/linux/issues/1234 for manipulation"_

### Thread ID Format

For the `sweep` tool, GitHub thread IDs use the format:

```
owner/repo/issues/123
```

Pull requests are also accepted via:

```
owner/repo/pulls/123
```

Both formats work for PRs (GitHub exposes PRs through the issues API).

---

## Bring Your Own Data (JSON Adapter)

```bash
export AGENTSCORE_ADAPTER=json
export AGENTSCORE_DATA_PATH=./data/agents.json
```

Your JSON file:

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

---

## Build Your Own Adapter

```typescript
import type { AgentPlatformAdapter } from 'agentscore-mcp';

class MyAdapter implements AgentPlatformAdapter {
  name = 'my-platform';
  version = '1.0.0';
  async fetchProfile(handle: string) { /* ... */ }
  async fetchContent(handle: string) { /* ... */ }
  async isAvailable() { return true; }
}
```

Full example: [`examples/custom-adapter.ts`](examples/custom-adapter.ts)

---

## What People Are Using This For

**Enterprise AI Governance:** A fintech company runs 12 internal agents. Before quarterly audit, the compliance team feeds conversation logs through the JSON adapter. AgentScore surfaces that the compliance-advisor bot has been leaking system prompt fragments in 4 of its last 30 responses. They catch it before the auditor does.

**Vendor Selection:** Company evaluating 3 chatbot vendors exports sample conversations, compares them — gets a verdict like "Vendor A dominates content quality, but Vendor C has zero manipulation flags. For customer-facing deployment, C is your pick." That verdict goes straight into the procurement deck.

**Astroturfing Detection:** Five suspicious accounts post glowing reviews within minutes. `sweep` finds 89% content similarity, 4-second response clustering, and account ages under 48 hours. Threat level: COMPROMISED. Evidence for takedown.

**Rate My Bot:** Export your Discord bot's chat history, ask "investigate my bot, be brutally honest." Get a briefing that says your bot scores 612 because it repeats the same 3 jokes on rotation. Screenshot it, post "My bot got roasted by another AI" — instant engagement.

**Agent Draft:** Building an AI agent team? Compare 5 candidates side-by-side. AgentScore picks winners per category: "Draft @DraftGenie first — reliable workhorse. Use @ProseAI as your wildcard — brilliant but erratic." People post their draft picks like fantasy football.

---

## Architecture

```
┌─────────────────────┐
│  Your AI Assistant   │
│  (Claude, Cursor)    │
└─────────┬───────────┘
          │ MCP (stdio)
┌─────────▼───────────┐
│  AgentScore Server   │
│  agentscore + sweep  │
└─────────┬───────────┘
          │
┌─────────▼───────────────────────────────┐
│  Platform Adapter                        │
│  Demo │ GitHub │ JSON │ Moltbook │ yours │
└─────────┬───────────────────────────────┘
          │
┌─────────▼───────────┐
│  Scoring Engine      │
│  6 categories → 300–850  │
└─────────┬───────────┘
          │
┌─────────▼───────────┐
│  Narrative Briefing  │
│  + Structured Data   │
└─────────────────────┘
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AGENTSCORE_ADAPTER` | No | `demo` | `demo`, `json`, `moltbook`, or `github` |
| `GITHUB_TOKEN` | No | — | GitHub personal access token (increases rate limit to 5,000 req/hr) |
| `MOLTBOOK_API_KEY` | For Moltbook | — | Moltbook API key |
| `AGENTSCORE_DATA_PATH` | For JSON | — | Path to agent data file |
| `AGENTSCORE_CACHE_TTL` | No | `86400` | Cache TTL in seconds |
| `AGENTSCORE_RATE_LIMIT_MS` | No | `200` | API rate limit delay (ms) |
| `AGENTSCORE_SITE_URL` | No | `https://agentscore.vercel.app` | Web dashboard URL |

### Behavior Notes

- Invalid numeric values for `AGENTSCORE_CACHE_TTL` or `AGENTSCORE_RATE_LIMIT_MS` fall back to defaults.
- `AGENTSCORE_SITE_URL` trims a trailing slash automatically.
- `AGENTSCORE_RATE_LIMIT_MS` applies to Moltbook adapter request throttling.
- Cached results may be returned with adjusted confidence based on age.

---

## Development

```bash
git clone https://github.com/tmishra-sp/agentscore-mcp.git
cd agentscore-mcp
npm install
cp .env.example .env
npm run dev          # Start with tsx
npm run build        # Compile TypeScript
npm run typecheck    # Strict mode check
npm run inspect      # Test with MCP Inspector
```

---

## Why Open Source?

We're building a trust tool. It would be hypocritical to ask you to trust a black box. See [TRUST.md](TRUST.md) for exactly what this server does and doesn't do.

---

## Built By

**Tripti** — Building trust infrastructure for the agentic AI era.

[X](https://x.com/triptisharmax) &middot; [GitHub](https://github.com/tmishra-sp) &middot; [LinkedIn](https://linkedin.com/in/triptisharma)

*Trust is a signal. We decode it.*
