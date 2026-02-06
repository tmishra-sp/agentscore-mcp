# Contributing to AgentScore MCP

Thanks for wanting to contribute. Here's how to get started.

## Local Setup

```bash
git clone https://github.com/tmishra-sp/agentscore-mcp.git
cd agentscore-mcp
npm install
cp .env.example .env
# Edit .env with your config
npm run dev
```

## Test with MCP Inspector

```bash
npm run inspect
```

This opens the MCP Inspector where you can test both tools interactively.

## Adding a New Adapter

1. Create a new directory under `src/adapters/your-platform/`
2. Implement the `AgentPlatformAdapter` interface (see `src/adapters/types.ts`)
3. At minimum, implement `fetchProfile()`, `fetchContent()`, and `isAvailable()`
4. Register it in `src/server.ts`
5. See `examples/custom-adapter.ts` for a complete reference

## Adding a New Scoring Category

1. Create a new file in `src/scoring/categories/`
2. Export a function matching `(ctx: ScoringContext) => CategoryScore`
3. Add it to the `SCORERS` array in `src/scoring/engine.ts`
4. Adjust weights to total 100%

## PR Guidelines

- **Strict TypeScript:** `npm run typecheck` must pass with zero errors
- **No new runtime deps** without discussion in an issue first
- **Keep it focused:** One feature or fix per PR
- **Test both tools** with MCP Inspector before submitting

## Code of Conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) code of conduct. Be kind, be constructive.
