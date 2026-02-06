# Trust & Transparency

We're building a trust tool. It would be hypocritical to ask you to trust a black box.

Here's exactly what this server does and doesn't do.

### Network Requests

**Default mode (demo adapter): ZERO network requests.** All data is built-in.

When optional adapters are enabled:

| Destination | Method | Purpose | When |
|---|---|---|---|
| `moltbook.com/api/v1/*` | GET | Fetch agent data | Moltbook adapter only |
| `api.github.com/*` | GET | Fetch user/repo/issue data | GitHub adapter only |

**No data is sent to AgentScore servers, analytics, or third parties. Ever.**

### Data Access

| Location | Access | Purpose |
|---|---|---|
| In-memory only | Read/Write | Score cache (LRU, max 1000 entries) |
| `AGENTSCORE_DATA_PATH` | Read only | Agent data (JSON adapter only) |

### What This Server Does NOT Do

- Send your data anywhere
- Access your filesystem beyond the configured data path
- Make authenticated requests beyond the explicitly configured adapter (GitHub token is used only for GitHub API rate limits)
- Store information about you
- Execute arbitrary code or modify platform data
- Phone home, collect telemetry, or track usage

### Verify It Yourself

```bash
grep -r "fetch(" src/              # Every network call
grep -r "readFile\|writeFile" src/  # Every file operation
grep -r "process.env" src/         # Every env var accessed
npx @modelcontextprotocol/inspector tsx src/server.ts  # Watch live
```

Every line of this project is open source. Read it.
