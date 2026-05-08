// Assemble multiple SavedBlock contentJson trees into a single Craft.js
// pageJson under a synthetic ROOT (Page) node. Used by
// /api/page-templates/build to create a PageTemplate from a stack of
// section-kind saved blocks.
//
// SavedBlock.contentJson shape (per-block, what we store):
//   { rootNodeId: string, nodes: { [id]: SerializedNode } }
//
// PageTemplate.pageJson shape (what Craft.js expects):
//   { ROOT: SerializedNode, [id]: SerializedNode, ... }   // flat map
//
// Each block is treated as a top-level Section under ROOT. We regenerate
// every node id so multiple instances of the same block don't collide.

const ROOT_ID = "ROOT";

function generateId(): string {
  return Math.random().toString(36).substring(2, 12);
}

type SerializedNode = {
  type: string | { resolvedName: string };
  isCanvas?: boolean;
  props: any;
  displayName?: string;
  custom?: any;
  parent: string | null;
  hidden?: boolean;
  nodes?: string[];
  linkedNodes?: Record<string, string>;
};

type BlockTree = {
  rootNodeId: string;
  nodes: Record<string, SerializedNode>;
};

export function assembleTemplate(blocks: { contentJson: unknown }[]): Record<string, SerializedNode> {
  const rootChildIds: string[] = [];
  const allNodes: Record<string, SerializedNode> = {};

  for (const block of blocks) {
    const tree = block.contentJson as BlockTree | null;
    if (!tree?.rootNodeId || !tree?.nodes) continue;

    const idMap = new Map<string, string>();
    Object.keys(tree.nodes).forEach((oldId) => idMap.set(oldId, generateId()));

    const newRootId = idMap.get(tree.rootNodeId);
    if (!newRootId) continue;
    rootChildIds.push(newRootId);

    for (const [oldId, serialized] of Object.entries(tree.nodes)) {
      const newId = idMap.get(oldId);
      if (!newId) continue;

      const remappedNodes = (serialized.nodes ?? []).map(
        (cid) => idMap.get(cid) ?? cid,
      );
      const remappedLinkedNodes = serialized.linkedNodes
        ? Object.fromEntries(
            Object.entries(serialized.linkedNodes).map(([k, v]) => [
              k,
              idMap.get(v) ?? v,
            ]),
          )
        : {};

      allNodes[newId] = {
        ...serialized,
        // The root of each block becomes a child of ROOT.
        parent:
          oldId === tree.rootNodeId
            ? ROOT_ID
            : serialized.parent
              ? (idMap.get(serialized.parent) ?? serialized.parent)
              : null,
        nodes: remappedNodes,
        linkedNodes: remappedLinkedNodes,
      };
    }
  }

  return {
    [ROOT_ID]: {
      type: { resolvedName: "Page" },
      isCanvas: true,
      props: {},
      displayName: "Page",
      custom: {},
      parent: null,
      hidden: false,
      nodes: rootChildIds,
      linkedNodes: {},
    },
    ...allNodes,
  };
}
