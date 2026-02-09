# Releasing AgentScore MCP

## One-time Setup

1. In GitHub repo settings, add secret: `NPM_TOKEN`.
2. Ensure npm package ownership includes your publishing account.
3. Confirm workflow exists: `.github/workflows/release.yml`.

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
- publish to npm

## Emergency Manual Publish (Fallback)

If CI publishing is blocked:

```bash
npm whoami
npm run verify
npm publish --access public
```

Then tag the same version in Git for consistency.
