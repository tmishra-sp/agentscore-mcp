# Trust & Transparency

We're building a trust tool. It would be hypocritical to ask you to trust a black box.

Here's exactly what this server does and doesn't do.

### Network Requests

**Default mode (demo adapter): ZERO network requests.** All data is built-in.

Set `AGENTSCORE_PUBLIC_MODE=true` to require an explicit non-demo adapter (`json`, `github`, or `moltbook`) for production use.

When optional adapters are enabled:

| Destination | Method | Purpose | When |
|---|---|---|---|
| `moltbook.com/api/v1/*` | GET | Fetch agent data | Moltbook adapter only |
| `api.github.com/*` | GET | Fetch user/repo/issue data | GitHub adapter only |

**No data is sent to AgentScore-owned servers, analytics, or telemetry services.**

### Rate Limiting

- Tool-level limits: `agentscore` 30/min, `sweep` 10/min, and `xray` 20/min per session.
- Adapter-level throttling: Moltbook uses `AGENTSCORE_RATE_LIMIT_MS`. GitHub respects API rate limit headers and retries on 429s.

### Data Access

| Location | Access | Purpose |
|---|---|---|
| In-memory only | Read/Write | Score cache (LRU, max 1000 entries) |
| `AGENTSCORE_DATA_PATH` | Read only | Agent data (JSON adapter only) |

### What This Server Does NOT Do

- Send your data to AgentScore-owned services or analytics endpoints
- Access your filesystem beyond the configured data path
- Make authenticated requests beyond the explicitly configured adapter (GitHub token is used only for GitHub API rate limits)
- Store information about you
- Execute arbitrary code or modify platform data
- Phone home, collect telemetry, or track usage

## xray — What It Detects and What It Doesn't

### Detects
- Hidden instructions in HTML/markdown comments
- Invisible unicode characters (zero-width spaces, direction overrides, unicode tag characters)
- CSS-hidden text (`display:none`, `opacity:0`, tiny font sizes, color masking, off-screen placement)
- Encoded payloads (base64, URL encoding, HTML entities, unicode/hex escapes)
- Instructional patterns hidden in code comments
- Structural hiding (image alt-text, link title fields, SVG text, script tags, suspicious frontmatter fields)

### Does NOT detect
- Novel obfuscation methods not yet catalogued in detector rules
- Image steganography in pixel data
- Multi-file coordinated payloads requiring repository-wide correlation
- Purely visible semantic prompt injection with no hiding technique

### Zero network requests
`xray` is fully local. Content in, findings out. Nothing is sent to external services.

### Verify It Yourself

```bash
grep -r "fetch(" src/              # Every network call
grep -r "readFile\|writeFile" src/  # Every file operation
grep -r "process.env" src/         # Every env var accessed
npx @modelcontextprotocol/inspector tsx src/server.ts  # Watch live
```

Every line of this project is open source. Read it.
