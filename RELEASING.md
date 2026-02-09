# Releasing AgentScore MCP

## One-time Setup

1. Configure npm Trusted Publishing for this package/workflow (preferred):
   - npm package settings -> Trusted publishers
   - Provider: GitHub Actions
   - Repository: `tmishra-sp/agentscore-mcp`
   - Workflow: `.github/workflows/release.yml`
2. Ensure npm package ownership includes your publishing account.
3. Confirm workflow exists: `.github/workflows/release.yml`.
4. Optional migration fallback: add `NPM_TOKEN` GitHub secret temporarily until trusted publishing is confirmed.

## Standard Release Flow

1. Prepare changes and merge to `main`.
2. Bump version locally:

```bash
npm version patch --no-git-tag-version
```

3. Update:
- `CHANGELOG.md`
- `release-notes/vX.Y.Z.md`
- `src/version.ts` if needed

4. Validate:

```bash
npm run verify
```

5. Commit and push:

```bash
git add .
git commit -m "Release vX.Y.Z"
git push origin main
```

6. Create and push tag:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

The release workflow will:
- verify tag matches `package.json` version
- run full verification
- publish to npm with provenance
- prefer trusted publishing (OIDC), fallback to `NPM_TOKEN` if present

## Emergency Manual Publish (Fallback)

If CI publishing is blocked:

```bash
npm whoami
npm run verify
npm publish --access public
```

Then tag the same version in Git for consistency.

## After Trusted Publishing Is Working

1. Remove `NPM_TOKEN` from GitHub repo secrets.
2. Remove local npm auth tokens not needed for CI.
3. Keep using tagged releases (`vX.Y.Z`) as the only publish path.
