// Craft.js keeps an UNBOUNDED undo/redo timeline (immer patches), and adds ONE
// entry per change — so dragging a slider (font-size, line-height…) pushes a
// history entry every tick: a single drag = hundreds of entries, ballooning
// memory and slowing the editor.
//
// Craft exposes no controls for this and its History instance is a private
// closure, so we patch the shared History class. `@craftjs/utils` resolves to a
// single version here (core and this package use the same instance), so patching
// its prototype affects the editor's real history. Two changes:
//   1. Coalesce rapid consecutive edits (slider drags, typing) into ONE undo
//      entry — same patch-merge craft already uses for throttled props, but with
//      a sliding window so a continuous drag stays a single step.
//   2. Cap the timeline depth so it can't grow without bound.
import { History } from "@craftjs/utils";

const MAX_HISTORY = 50;   // max undo depth
const MERGE_WINDOW = 400; // ms — edits closer than this collapse into one step

const proto = History.prototype as any;
if (!proto.__ltHistoryPatched) {
  proto.__ltHistoryPatched = true;
  const origAdd = proto.add;
  const origThrottleAdd = proto.throttleAdd;
  const origMerge = proto.merge;

  const cap = (h: any) => {
    const over = h.timeline.length - MAX_HISTORY;
    if (over > 0) {
      h.timeline.splice(0, over);
      h.pointer = Math.max(-1, h.pointer - over); // pointer indexes from the front
    }
  };

  proto.add = function (this: any, patches: any[], inversePatches: any[]) {
    const hasPatches = patches.length !== 0 || inversePatches.length !== 0;
    const atEnd = this.pointer >= 0 && this.pointer === this.timeline.length - 1;
    if (hasPatches && atEnd) {
      const last = this.timeline[this.pointer];
      if (Date.now() - last.timestamp < MERGE_WINDOW) {
        // Merge into the current entry — identical patch combination to craft's
        // own throttleAdd, but we slide the timestamp so a continuous drag/typing
        // burst keeps collapsing into this single step until a >window pause.
        this.timeline[this.pointer] = {
          timestamp: Date.now(),
          patches: [...last.patches, ...patches],
          inversePatches: [...inversePatches, ...last.inversePatches],
        };
        return;
      }
    }
    origAdd.call(this, patches, inversePatches);
    cap(this);
  };

  proto.throttleAdd = function (this: any, ...args: any[]) {
    const r = origThrottleAdd.apply(this, args);
    cap(this);
    return r;
  };
  proto.merge = function (this: any, ...args: any[]) {
    const r = origMerge.apply(this, args);
    cap(this);
    return r;
  };
}
