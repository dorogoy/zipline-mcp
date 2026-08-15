---
title: 'Fix silent exit-0 on npx/bin launch: resolve symlinks in main-module check'
type: 'bugfix'
created: '2026-08-15'
status: 'done'
route: 'one-shot'
---

# Fix silent exit-0 on npx/bin launch: resolve symlinks in main-module check

## Intent

**Problem:** Launched via `npx` or a global bin wrapper, the server exited silently with code 0 and never answered MCP requests ([issue #146](https://github.com/dorogoy/zipline-mcp/issues/146)). Direct `node dist/index.js`, programmatic import, and non-symlinked launches were unaffected.

**Approach:** The old inline check compared `fileURLToPath(import.meta.url)` with `path.resolve(process.argv[1])` — lexical only, blind to the symlink npm creates for bin entries (pre-fix diff: `git show c1bd7c4 -- src/index.ts`, baseline `df263c6`). Extracted `isMainModule()` into `src/utils/isMain.ts`, resolving both sides via `realpathSync`, which also covers `--preserve-symlinks-main`. An `if (!scriptPath)` guard handles undefined `argv[1]`; try/catch handles nonexistent paths. Unit tests cover the symlinked-bin regression plus chains, mismatches, and missing paths (symlink tests assume POSIX semantics; CI runs ubuntu-latest). Verified: bug reproduced via a hand-made symlink (silent exit 0), then `npm run build`, `npm run test:run`, `npm run lint`, `npm run format:check` all pass and the symlink launch answers `initialize`. Delivered in [PR #158](https://github.com/dorogoy/zipline-mcp/pull/158) — open, not yet merged or released at trace time.

## Suggested Review Order

**Main-module detection**

- Entry point: realpath on both sides makes symlinked bins match the real module
  [`isMain.ts:12`](../../src/utils/isMain.ts#L12)
- Guard for undefined `argv[1]` (e.g. programmatic import) keeps startup safe
  [`isMain.ts:16`](../../src/utils/isMain.ts#L16)
- Core comparison; try/catch keeps nonexistent paths from crashing startup
  [`isMain.ts:20`](../../src/utils/isMain.ts#L20)

**Entry-point wiring**

- Call site replaces the old lexical `path.resolve` comparison
  [`index.ts:1748`](../../src/index.ts#L1748)

**Regression coverage**

- Symlinked-bin case from the issue
  [`isMain.test.ts:21`](../../src/utils/isMain.test.ts#L21)
- Both sides symlinked — simulates `--preserve-symlinks-main`
  [`isMain.test.ts:29`](../../src/utils/isMain.test.ts#L29)
- Mismatched file
  [`isMain.test.ts:39`](../../src/utils/isMain.test.ts#L39)
- Undefined `scriptPath`
  [`isMain.test.ts:47`](../../src/utils/isMain.test.ts#L47)
- Nonexistent `scriptPath`
  [`isMain.test.ts:53`](../../src/utils/isMain.test.ts#L53)
