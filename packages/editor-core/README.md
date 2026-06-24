# @launchtic/editor-core

Vendored fork of [`@craftjs/core`](https://github.com/prevwong/craft.js) **v0.2.12**
(the exact published source, tag `@craftjs/core@0.2.12`, commit `d02fb1e`), under our
control so we can patch the editor engine in readable source instead of patching the
minified npm dist.

It replaces the `@craftjs/core` npm dependency everywhere (`@craftjs/utils` is still the
upstream npm package). Consumed **as TypeScript source** via `transpilePackages` (no build
step) — `main` points at `src/index.tsx`, `types` ships craft's original `.d.ts` (`types/`).

## Local modifications vs upstream 0.2.12

- **`src/editor/Editor.tsx`** — the `onNodesChange` subscription throttled.
  Upstream serializes the ENTIRE node tree (`JSON.stringify`) on **every** store change,
  purely to detect changes for `onNodesChange`. During slider-drag / drag-drop / resize the
  node data changes every frame → a full serialize per frame (measured ~38% CPU on a
  ~90-node page → visible lag). The host app's `onNodesChange` (`markAsChanged`) doesn't use
  the json, so the serialize is throttled to ~5/s. Dirty-tracking still fires; canvas/slider
  stay responsive (they re-render through other subscribers, not this one).
- `src/index.tsx` — dropped the `./utils/testHelpers` re-export (jest-only, unused at runtime).
- Test files removed.

## Updating from upstream

To re-sync with a newer craft 0.2.x: download that tag's `packages/core/src`, copy over
`src/`, refresh `types/` from the package's `lib/*.d.ts`, then re-apply the throttle in
`src/editor/Editor.tsx` (search `launchtic perf`).
