# @launchtic/editor-utils

Vendored fork of [`@craftjs/utils`](https://github.com/prevwong/craft.js) **v0.2.5**
(exact published source, tag `@craftjs/utils@0.2.5`, commit `7751319`), the low-level
companion to [`@launchtic/editor-core`](../editor-core). Consumed **as TypeScript source**
via `transpilePackages` (no build step); `types/` ships craft's original `.d.ts`.

## Local modifications vs upstream 0.2.5

- **`src/History.ts`** — undo/redo timeline made bounded + coalescing, ported from the
  former runtime monkey-patch (`packages/elements/src/editor/app/historyLimit.ts`,
  now deleted):
  - `MAX_HISTORY = 50` — cap timeline depth so undo history can't grow unbounded.
  - `MERGE_WINDOW = 400ms` — a continuous burst of edits (slider drag, typing) coalesces
    into ONE undo step instead of hundreds. `throttleAdd()` / `merge()` fall through to
    `add()`, so they inherit both behaviours.
- Test files removed.

## Updating from upstream

Download the target tag's `packages/utils/src`, copy over `src/`, refresh `types/` from
the package's `lib/*.d.ts`, then re-apply the History changes (search `launchtic`).
