import { Patch, applyPatches } from 'immer';

type Timeline = Array<{
  patches: Patch[];
  inversePatches: Patch[];
  timestamp: number;
}>;

export const HISTORY_ACTIONS = {
  UNDO: 'HISTORY_UNDO',
  REDO: 'HISTORY_REDO',
  THROTTLE: 'HISTORY_THROTTLE',
  IGNORE: 'HISTORY_IGNORE',
  MERGE: 'HISTORY_MERGE',
  CLEAR: 'HISTORY_CLEAR',
};

// launchtic: bound the undo/redo timeline (memory) and coalesce a continuous
// burst of edits (slider drags, typing) into a single undo step. Ported from the
// former runtime monkey-patch (was packages/elements/.../historyLimit.ts).
const MAX_HISTORY = 50; // max undo depth
const MERGE_WINDOW = 400; // ms — edits closer than this collapse into one step

export class History {
  timeline: Timeline = [];
  pointer = -1;

  // Drop the oldest entries once the timeline exceeds MAX_HISTORY so it can't
  // grow without bound. `pointer` indexes from the front, so shift it too.
  private cap() {
    const over = this.timeline.length - MAX_HISTORY;
    if (over > 0) {
      this.timeline.splice(0, over);
      this.pointer = Math.max(-1, this.pointer - over);
    }
  }

  add(patches: Patch[], inversePatches: Patch[]) {
    if (patches.length === 0 && inversePatches.length === 0) {
      return;
    }

    // While edits keep arriving within MERGE_WINDOW, merge them into the current
    // entry (sliding the timestamp) instead of pushing a new one — a single
    // slider drag would otherwise create hundreds of undo steps. throttleAdd()
    // and merge() fall through to this method, so they inherit the cap.
    const atEnd = this.pointer >= 0 && this.pointer === this.timeline.length - 1;
    if (atEnd) {
      const last = this.timeline[this.pointer];
      if (Date.now() - last.timestamp < MERGE_WINDOW) {
        this.timeline[this.pointer] = {
          timestamp: Date.now(),
          patches: [...last.patches, ...patches],
          inversePatches: [...inversePatches, ...last.inversePatches],
        };
        return;
      }
    }

    this.pointer = this.pointer + 1;
    this.timeline.length = this.pointer;
    this.timeline[this.pointer] = {
      patches,
      inversePatches,
      timestamp: Date.now(),
    };
    this.cap();
  }

  throttleAdd(
    patches: Patch[],
    inversePatches: Patch[],
    throttleRate: number = 500
  ) {
    if (patches.length === 0 && inversePatches.length === 0) {
      return;
    }

    if (this.timeline.length && this.pointer >= 0) {
      const {
        patches: currPatches,
        inversePatches: currInversePatches,
        timestamp,
      } = this.timeline[this.pointer];

      const now = new Date();
      const diff = now.getTime() - timestamp;

      if (diff < throttleRate) {
        this.timeline[this.pointer] = {
          timestamp,
          patches: [...currPatches, ...patches],
          inversePatches: [...inversePatches, ...currInversePatches],
        };
        return;
      }
    }

    this.add(patches, inversePatches);
  }

  merge(patches: Patch[], inversePatches: Patch[]) {
    if (patches.length === 0 && inversePatches.length === 0) {
      return;
    }

    if (this.timeline.length && this.pointer >= 0) {
      const {
        patches: currPatches,
        inversePatches: currInversePatches,
        timestamp,
      } = this.timeline[this.pointer];

      this.timeline[this.pointer] = {
        timestamp,
        patches: [...currPatches, ...patches],
        inversePatches: [...inversePatches, ...currInversePatches],
      };
      return;
    }

    this.add(patches, inversePatches);
  }

  clear() {
    this.timeline = [];
    this.pointer = -1;
  }

  canUndo() {
    return this.pointer >= 0;
  }

  canRedo() {
    return this.pointer < this.timeline.length - 1;
  }

  undo(state) {
    if (!this.canUndo()) {
      return;
    }

    const { inversePatches } = this.timeline[this.pointer];
    this.pointer = this.pointer - 1;
    return applyPatches(state, inversePatches);
  }

  redo(state) {
    if (!this.canRedo()) {
      return;
    }

    this.pointer = this.pointer + 1;
    const { patches } = this.timeline[this.pointer];
    return applyPatches(state, patches);
  }
}
