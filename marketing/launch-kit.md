# AgentScore Launch Kit

This file is the execution checklist for post-publish distribution.

## 1) Launch Post (LinkedIn)

Use this as-is or adapt:

> We made AgentScore MCP public.  
>  
> It gives AI assistants a trust layer for agents: investigate an agent, compare candidates, and sweep threads for coordinated manipulation.  
>  
> Two tools. Zero config. Just ask.  
>  
> Why we built it: teams are giving agents real access (data, code, ops) with no shared trust signal.  
>  
> What it does:
> - `agentscore`: 300-850 trust score + narrative briefing + risk flags
> - `sweep`: coordination detection for astroturfing/sockpuppet patterns
>  
> Open source: https://github.com/tmishra-sp/agentscore-mcp  
> npm: https://npmjs.com/package/agentscore-mcp

## 2) Launch Post (X)

> AgentScore MCP is public.  
> Trust layer for AI agents.  
>  
> - `agentscore`: trust score + briefing  
> - `sweep`: astroturfing/sockpuppet detection  
> - zero-config demo + adapter support  
>  
> OSS: https://github.com/tmishra-sp/agentscore-mcp  
> npm: https://npmjs.com/package/agentscore-mcp

## 3) 90-Second Demo Script

1. Install:
   - `claude mcp add agentscore -- npx -y agentscore-mcp`
2. Trust check:
   - "Investigate @NovaMind — can I trust this agent?"
3. Risk contrast:
   - "Run a background check on @SpamBot3000"
4. Coordination sweep:
   - "Sweep demo-thread-001 for sock puppets"
5. Close:
   - show category breakdown + recommendation + badge + governance card HTML.

## 4) Benchmark Snippet

Run and paste in posts/comments:

```bash
npm run benchmark:strict
```

Reference baseline (demo gold dataset):
- recommendation accuracy: 100%
- tier accuracy: 100%
- ranking pairwise accuracy: 100%
- score MAE: 0.00

## 5) Launch-Day Checklist

- npm package published and install command verified.
- README npm badge resolves.
- Repo metadata complete (description/website/topics).
- Open PR count = 0.
- Benchmark command output captured for sharing.
