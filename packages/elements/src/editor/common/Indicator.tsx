import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { getRandomId } from "@craftjs/utils";
import { useNodeState } from "../hooks/useNodeState";
import { Node } from "@launchtic/editor-core";

// Editor chrome must use the system font, not the page-level font
// chosen via PageFontApplier (which wraps the canvas). Any styled component
// rendered inside a Section/Row/Field would otherwise inherit that font.
const SYSTEM_FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

const IndicatorLeft = styled.div<{ $top: number }>`
  position: absolute;
  left: -2px;
  top: ${(props) => props.$top}px;
  background-color: #2196F3;
  color: white;
  padding: 5px;
  font-size: 14px;
  font-family: ${SYSTEM_FONT};
  font-weight: normal;
  z-index: 12;
`;

const IndicatorRight = styled.div<{ $top: number }>`
  position: absolute;
  right: -2px;
  top: ${(props) => props.$top}px;
  display: flex;
  gap: 10px;
  background-color: #2196F3;
  padding: 5px;
  pointer-events: auto;
  font-size: 16px;
  font-family: ${SYSTEM_FONT};
  font-weight: normal;
  z-index: 12;
`;

const IndicatorButton = styled.div`
  cursor: pointer;
  color: white;
  font-size: 14px;
  font-family: ${SYSTEM_FONT};

  &:hover {
    color: #ddd;
  }
`;

interface IndicatorProps {
  name: string;
}

const SaveModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ${SYSTEM_FONT};
  font-weight: normal;
  font-style: normal;
`;

const SaveModal = styled.div`
  background: #fff;
  border-radius: 8px;
  padding: 20px 24px;
  width: 360px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  font-family: ${SYSTEM_FONT};
`;

const SaveModalTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #222;
`;

const SaveModalInput = styled.input`
  width: 100%;
  padding: 8px 10px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 5px;
  outline: none;
  margin-bottom: 8px;
  &:focus { border-color: #2196F3; box-shadow: 0 0 0 2px rgba(33,150,243,0.2); }
`;

const SaveModalError = styled.div`
  font-size: 12px;
  color: #c0392b;
  margin-bottom: 8px;
  min-height: 16px;
`;

const SaveModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
`;

const SaveModalBtn = styled.button<{ $primary?: boolean }>`
  padding: 7px 14px;
  font-size: 13px;
  border-radius: 5px;
  cursor: pointer;
  border: 1px solid ${({ $primary }) => ($primary ? "#2196F3" : "#ddd")};
  background: ${({ $primary }) => ($primary ? "#2196F3" : "#fff")};
  color: ${({ $primary }) => ($primary ? "#fff" : "#333")};
  &:hover { opacity: 0.9; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SaveModalLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: #555;
  margin: 6px 0 4px;
`;

const TagPillBox = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 5px;
  background: #fff;
  min-height: 36px;
  &:focus-within { border-color: #2196F3; box-shadow: 0 0 0 2px rgba(33,150,243,0.2); }
`;

const TagPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  font-size: 12px;
  background: #e7f1ff;
  color: #1e40af;
  border-radius: 3px;
`;

const TagPillRemove = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  color: #1e40af;
  font-size: 11px;
  &:hover { color: #c0392b; }
`;

const TagPillInput = styled.input`
  flex: 1;
  min-width: 80px;
  border: none;
  outline: none;
  font-size: 13px;
  padding: 2px 0;
`;

const SuggestionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
`;

const SuggestionChip = styled.button`
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid #d8dbdf;
  border-radius: 12px;
  background: #fff;
  color: #555;
  cursor: pointer;
  &:hover { border-color: #2196F3; color: #2196F3; }
`;

const SUGGESTED_TAGS = ["hero", "navigation", "cta", "pricing", "testimonial", "footer"];

const normalizeTag = (raw: string) => raw.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 30);

const cloneNodeTree = (node: Node, query: any, actions: any) => {
  const parentId = node.data.parent;
  if (!parentId) {
    console.error("No parent id found!");
    return;
  }
  return manualCloneNodeTree(node, query, actions);
};


const manualCloneNodeTree = (node: Node, query: any, actions: any) => {
  const parentId = node.data.parent;
  if (!parentId) {
    console.error("No parent id found!");
    return;
  }

  const oldTree = query.node(node.id).toNodeTree();

  const idMapping = new Map<string, string>();
  const createNewIds = (nodes: any) => {
    Object.keys(nodes).forEach(oldId => {
      idMapping.set(oldId, getRandomId());
    });
  };

  createNewIds(oldTree.nodes);

  const newTree = {
    ...oldTree,
    rootNodeId: idMapping.get(oldTree.rootNodeId)!,
    nodes: {}
  };

  Object.entries(oldTree.nodes).forEach(([oldId, oldNode]: [string, any]) => {
    const newId = idMapping.get(oldId)!;

    const tmpNode = {
      ...oldNode,
      id: newId,
      data: {
        ...oldNode.data,
        parent: oldNode.data.parent ? idMapping.get(oldNode.data.parent) : oldNode.data.parent,
        nodes: oldNode.data.nodes.map((childId: string) => idMapping.get(childId)!),
        linkedNodes: oldNode.data.linkedNodes ?
          Object.keys(oldNode.data.linkedNodes).reduce((acc, key) => ({
            ...acc,
            [key]: idMapping.get(oldNode.data.linkedNodes[key])!
          }), {}) : {},
        props: {
          ...oldNode.data.props,
          ...(oldNode.data.props?.htmlAttrId && {
            htmlAttrId: `${oldNode.data.name?.toLowerCase() || 'element'}-${Math.random().toString(16).substring(2, 10)}`
          })
        }
      },
      events: {
        dragged: false,
        hovered: false,
        selected: false,
      }
    };

    const freshNode = query.parseFreshNode(tmpNode).toNode();
    (newTree.nodes as any)[newId] = freshNode;
  });

  const parentNode = query.node(parentId).get();
  const nodeIndex = parentNode.data.nodes.indexOf(node.id);

  actions.addNodeTree(newTree, parentId, nodeIndex + 1);
  actions.selectNode(newTree.rootNodeId);

  return newTree.rootNodeId;
};

// Build a JSON-safe serialized tree from a Craft.js subtree.
// Raw nodes from `toNodeTree()` contain DOM/Fiber refs (circular) — we use
// `toSerializedNode()` to get plain data. Also strips user-set htmlAttrId
// so inserting on another page doesn't cause duplicate HTML ids.
const serializeSubtree = (rootId: string, query: any) => {
  const tree = query.node(rootId).toNodeTree();
  const nodes: Record<string, any> = {};
  Object.keys(tree.nodes).forEach((nodeId) => {
    const serialized = query.node(nodeId).toSerializedNode();
    if (serialized?.props?.htmlAttrId) {
      const { htmlAttrId, ...rest } = serialized.props;
      serialized.props = rest;
    }
    nodes[nodeId] = serialized;
  });
  return { rootNodeId: tree.rootNodeId, nodes };
};

export const Indicator: React.FC<IndicatorProps> = ({ name }) => {
  const { id, actions, query } = useNodeState();
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [blockName, setBlockName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [suggestedTags, setSuggestedTags] = useState<string[]>(SUGGESTED_TAGS);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pull tag suggestions from the workspace's existing saved blocks, sorted
  // by usage frequency. Falls back to the static defaults if the workspace
  // has no tagged blocks yet (or the request fails).
  useEffect(() => {
    if (!showSaveModal) return;
    let alive = true;
    fetch("/api/saved-blocks")
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        const counts = json?.data?.tagCounts as Record<string, number> | undefined;
        if (!counts) return;
        const sorted = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([tag]) => tag)
          .slice(0, 8);
        if (sorted.length > 0) setSuggestedTags(sorted);
      })
      .catch(() => { /* keep defaults */ });
    return () => { alive = false; };
  }, [showSaveModal]);

  const rootId = query.getState().nodes["ROOT"]?.id;
  const firstChildId = rootId ? query.node(rootId).descendants()[0] : null;
  const isFirstInPageRoot = firstChildId === id;
  const topDynamic = isFirstInPageRoot ? 0 : -30;

  const canSaveAsBlock = name === "Section" || name === "Row";

  const handleMouseEnter = () => {
    actions.setProp(id, (props: any) => {
      props.isHover = true;
    });
  };

  const handleMouseLeave = () => {
    actions.setProp(id, (props: any) => {
      props.isHover = false;
    });
  };

  const handleSelectParent = () => {
    let parentId = query.node(id).get().data.parent;
    if (parentId) {
      const parentNode = query.node(parentId).get();
      if (parentNode.data.type === "Column") {
        parentId = parentNode.data.parent;
      }
      if (parentId) {
        actions.selectNode(parentId);
      }
    }
  };

  const handleDelete = () => {
    // Capture the ancestor chain BEFORE deleting — once a node is removed
    // from the tree, query.node(...) for its parent still works but stops
    // returning the deleted child. We collect upward until we hit either
    // the page root or a non-prunable container.
    const PRUNABLE = new Set(["Column", "Row", "Section"]);
    const prunableAncestors: string[] = [];
    let cursor = query.node(id).get()?.data?.parent ?? null;
    while (cursor && cursor !== "ROOT") {
      const node = query.node(cursor).get();
      if (!node) break;
      const nodeName = node.data.displayName || (node.data as any).name;
      if (!PRUNABLE.has(nodeName)) break;
      prunableAncestors.push(cursor);
      cursor = node.data.parent ?? null;
    }

    actions.delete(id);

    // Walk up; delete any container that became empty as a result.
    // Stop as soon as one ancestor still has siblings — its parents are
    // by definition still non-empty, so cascading further is unnecessary.
    for (const ancestorId of prunableAncestors) {
      const ancestor = query.node(ancestorId).get();
      if (!ancestor) continue;
      const childIds: string[] = ancestor.data.nodes ?? [];
      if (childIds.length > 0) break;

      // Multi-column layouts are intentional: in a Row with 2+ Columns,
      // emptying one Column should NOT collapse it — user explicitly
      // chose that layout and likely plans to refill the empty side.
      const ancestorName = ancestor.data.displayName || (ancestor.data as any).name;
      if (ancestorName === "Column") {
        const parentId = ancestor.data.parent;
        const parent = parentId ? query.node(parentId).get() : null;
        const parentChildren: string[] = parent?.data?.nodes ?? [];
        if (parentChildren.length > 1) break;
      }

      actions.delete(ancestorId);
    }
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nodeToClone = query.node(id).get();
    cloneNodeTree(nodeToClone, query, actions);
  };

  const openSaveModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    setBlockName("");
    setTags([]);
    setTagInput("");
    setSaveError(null);
    setShowSaveModal(true);
  };

  const addTag = (raw: string) => {
    const t = normalizeTag(raw);
    if (!t) return;
    setTags((prev) => (prev.includes(t) || prev.length >= 10 ? prev : [...prev, t]));
    setTagInput("");
  };

  // Pure version: only mutates the tags list, doesn't touch input.
  // Used when splitting a multi-tag input ("a,b,c" or "a b c").
  const addTagSilent = (raw: string) => {
    const t = normalizeTag(raw);
    if (!t) return;
    setTags((prev) => (prev.includes(t) || prev.length >= 10 ? prev : [...prev, t]));
  };

  // Split on comma or whitespace as user types or pastes. Anything before a
  // separator gets committed as a tag; what comes after stays in the input
  // until the user adds another separator (or blurs / hits Enter).
  const handleTagInputChange = (value: string) => {
    if (!/[,\s]/.test(value)) {
      setTagInput(value);
      return;
    }
    const parts = value.split(/[,\s]+/).filter(Boolean);
    const endsWithSeparator = /[,\s]$/.test(value);
    if (endsWithSeparator) {
      parts.forEach(addTagSilent);
      setTagInput("");
    } else if (parts.length > 1) {
      const last = parts.pop()!;
      parts.forEach(addTagSilent);
      setTagInput(last);
    } else {
      setTagInput(parts[0] ?? "");
    }
  };

  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

  const submitSaveBlock = async () => {
    const trimmed = blockName.trim();
    if (!trimmed) {
      setSaveError("Please enter a name");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const sanitized = serializeSubtree(id, query);
      // If user typed a tag without confirming (no comma/Enter), include it.
      const finalTags = tagInput.trim() ? [...tags, normalizeTag(tagInput)].filter((t, i, a) => t && a.indexOf(t) === i) : tags;
      const res = await fetch("/api/saved-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          kind: name.toLowerCase(),
          tags: finalTags,
          contentJson: sanitized,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to save block");
      }
      setShowSaveModal(false);
      window.dispatchEvent(new CustomEvent("saved-blocks:changed"));
    } catch (err: any) {
      setSaveError(err?.message || "Failed to save block");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <IndicatorLeft $top={topDynamic}>{name}</IndicatorLeft>
      <IndicatorRight
        $top={topDynamic}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <IndicatorButton onClick={handleSelectParent}>
          <i className="fas fa-arrow-up"></i>
        </IndicatorButton>
        <IndicatorButton onClick={handleDuplicate}>
          <i className="far fa-copy"></i>
        </IndicatorButton>
        {canSaveAsBlock && (
          <IndicatorButton onClick={openSaveModal} title="Save as block">
            <i className="far fa-save"></i>
          </IndicatorButton>
        )}
        <IndicatorButton onClick={handleDelete}>
          <i className="far fa-trash-alt"></i>
        </IndicatorButton>
      </IndicatorRight>

      {showSaveModal && (
        <SaveModalOverlay onClick={() => !saving && setShowSaveModal(false)}>
          <SaveModal onClick={(e) => e.stopPropagation()}>
            <SaveModalTitle>Save {name.toLowerCase()} as block</SaveModalTitle>
            <SaveModalLabel>Block name</SaveModalLabel>
            <SaveModalInput
              autoFocus
              type="text"
              placeholder={`E.g. "Hero ${name.toLowerCase()}"`}
              value={blockName}
              maxLength={100}
              onChange={(e) => setBlockName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && !saving) setShowSaveModal(false);
              }}
              disabled={saving}
            />

            <SaveModalLabel>Tags (optional)</SaveModalLabel>
            <TagPillBox>
              {tags.map((t) => (
                <TagPill key={t}>
                  {t}
                  <TagPillRemove onClick={() => removeTag(t)} title="Remove">
                    <i className="fas fa-times" />
                  </TagPillRemove>
                </TagPill>
              ))}
              <TagPillInput
                type="text"
                placeholder={tags.length === 0 ? "e.g. hero, cta (or paste comma/space-separated)" : ""}
                value={tagInput}
                disabled={saving}
                onChange={(e) => handleTagInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(tagInput);
                  } else if (e.key === "Backspace" && !tagInput && tags.length) {
                    setTags((prev) => prev.slice(0, -1));
                  } else if (e.key === "Escape" && !saving) {
                    setShowSaveModal(false);
                  }
                }}
                onBlur={() => tagInput && addTag(tagInput)}
              />
            </TagPillBox>
            <SuggestionRow>
              {suggestedTags.filter((s) => !tags.includes(s)).map((s) => (
                <SuggestionChip key={s} type="button" onClick={() => addTag(s)} disabled={saving}>
                  + {s}
                </SuggestionChip>
              ))}
            </SuggestionRow>

            <SaveModalError>{saveError ?? ""}</SaveModalError>
            <SaveModalActions>
              <SaveModalBtn onClick={() => setShowSaveModal(false)} disabled={saving}>
                Cancel
              </SaveModalBtn>
              <SaveModalBtn $primary onClick={submitSaveBlock} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </SaveModalBtn>
            </SaveModalActions>
          </SaveModal>
        </SaveModalOverlay>
      )}
    </div>
  );
};
