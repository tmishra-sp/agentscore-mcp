# Security Policy

## Reporting Vulnerabilities

**Please report security vulnerabilities via GitHub Security Advisories:**

https://github.com/tmishra-sp/agentscore-mcp/security/advisories/new

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

We'll acknowledge within 48 hours and provide a fix timeline within 7 days.

## Security Design

- **Input validation:** All inputs validated with Zod. Handles: `/^[\w-]{1,50}$/`
- **No secret persistence:** API keys held in memory only, never written to disk
- **Rate limiting:** Tool-level rate limits (`agentscore` 30/min, `sweep` 10/min per session) and adapter-level throttling (Moltbook `AGENTSCORE_RATE_LIMIT_MS`, GitHub retries/429)
- **Content isolation:** Agent content analyzed as text only, never evaluated or executed
- **Minimal surface:** 2 runtime dependencies total: `@modelcontextprotocol/sdk` + `zod`
- **No outbound data:** The server never sends your data to any external service

## Supported Versions

| Version | Supported |
|---|---|
| 1.x | Yes |
