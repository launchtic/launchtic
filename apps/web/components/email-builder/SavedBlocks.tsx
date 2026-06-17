"use client";

// Saved email blocks — reusable Craft sections stored per workspace. Mirrors the
// landing-page editor's saved blocks. Provider fetches the list; Toolbox lists +
// inserts them, Section settings save the selected section.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api-client";

export type EmailBlock = { id: string; name: string; contentJson: { root: string; nodes: Record<string, any> } };

type Ctx = {
  blocks: EmailBlock[];
  available: boolean;                         // false if the API is forbidden (degrade gracefully)
  save: (name: string, contentJson: any) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
};
const SavedBlocksContext = createContext<Ctx | null>(null);
export const useSavedBlocks = () => useContext(SavedBlocksContext);

export function SavedBlocksProvider({ children }: { children: React.ReactNode }) {
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/email-blocks");
        const json = await res.json();
        if (cancelled) return;
        if (json.success) setBlocks(json.data.items);
        else setAvailable(false);
      } catch { if (!cancelled) setAvailable(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = useCallback(async (name: string, contentJson: any) => {
    try {
      const res = await apiFetch("/api/email-blocks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, contentJson }),
      });
      const json = await res.json();
      if (json.success) { setBlocks((b) => [json.data, ...b]); return true; }
      return false;
    } catch { return false; }
  }, []);

  const remove = useCallback(async (id: string) => {
    setBlocks((b) => b.filter((x) => x.id !== id));
    try { await apiFetch(`/api/email-blocks/${id}`, { method: "DELETE" }); } catch { /* best-effort */ }
  }, []);

  return <SavedBlocksContext.Provider value={{ blocks, available, save, remove }}>{children}</SavedBlocksContext.Provider>;
}

// Extract a node + its whole subtree from a serialized Craft tree as a portable
// block (root has no parent — set on insert).
export function extractSubtree(tree: Record<string, any>, id: string): { root: string; nodes: Record<string, any> } {
  const nodes: Record<string, any> = {};
  const walk = (nid: string) => {
    const n = tree[nid];
    if (!n || nodes[nid]) return;
    nodes[nid] = JSON.parse(JSON.stringify(n));
    (n.nodes ?? []).forEach((c: string) => walk(c));
    Object.values(n.linkedNodes ?? {}).forEach((c: any) => walk(c));
  };
  walk(id);
  if (nodes[id]) delete nodes[id].parent;
  return { root: id, nodes };
}

// Append a saved block (fresh ids) as a new Section under ROOT.
export function insertSavedBlock(query: any, actions: any, block: { root: string; nodes: Record<string, any> }) {
  if (!block?.nodes?.[block.root]) return;
  const tree: Record<string, any> = JSON.parse(query.serialize());
  if (!tree.ROOT) return;
  const gid = () => "n" + Math.random().toString(36).slice(2, 10);
  const idMap: Record<string, string> = {};
  for (const oldId of Object.keys(block.nodes)) idMap[oldId] = gid();
  for (const oldId of Object.keys(block.nodes)) {
    const src = block.nodes[oldId];
    const n = JSON.parse(JSON.stringify(src));
    n.nodes = (src.nodes ?? []).map((c: string) => idMap[c]).filter(Boolean);
    n.linkedNodes = Object.fromEntries(
      Object.entries(src.linkedNodes ?? {}).map(([k, v]: any) => [k, idMap[v]]).filter(([, v]) => v),
    );
    n.parent = oldId === block.root ? "ROOT" : idMap[src.parent];
    tree[idMap[oldId]] = n;
  }
  tree.ROOT.nodes = [...(tree.ROOT.nodes ?? []), idMap[block.root]];
  actions.deserialize(JSON.stringify(tree));
}
