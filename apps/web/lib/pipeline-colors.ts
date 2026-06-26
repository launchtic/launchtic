// Client-safe stage color palette (no server imports — usable in client
// components and on the server). lib/pipelines.ts re-exports these.

export const STAGE_PALETTE = [
  "#6366f1", "#0ea5e9", "#f59e0b", "#16a34a", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b",
];

export const stageColor = (i: number) => STAGE_PALETTE[i % STAGE_PALETTE.length];
