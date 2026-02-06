# Security Policy

## Reporting Vulnerabilities

**Email:** triptisharmax@gmail.com (48h response)

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

We'll acknowledge within 48 hours and provide a fix timeline within 7 days.

## Security Design

- **Input validation:** All inputs validated with Zod. Handles: `/^[\w-]{1,50}$/`
- **No secret persistence:** API keys held in memory only, never written to disk
- **Rate limiting:** All API calls rate-limited (default 200ms between requests)
- **Content isolation:** Agent content analyzed as text only, never evaluated or executed
- **Minimal surface:** 2 runtime dependencies total: `@modelcontextprotocol/sdk` + `zod`
- **No outbound data:** The server never sends your data to any external service

## Supported Versions

| Version | Supported |
|---|---|
| 1.x | Yes |
