"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useEditor } from "@craftjs/core";
import { getRandomId } from "@craftjs/utils";
import styled from "styled-components";
import {
  ToolboxSection,
  ToolboxSectionTitle,
} from "./layout/EditorUI";

type SavedBlockListItem = {
  id: string;
  name: string;
  kind: "section" | "row";
  tags: string[];
  createdAt: string;
};

const SUGGESTED_TAGS = ["hero", "navigation", "cta", "pricing", "testimonial", "footer"];
const normalizeTag = (raw: string) => raw.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 30);

const BlockList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const BlockRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  background: #f4f6f8;
  border-radius: 6px;
  transition: background 0.15s;
  position: relative;
`;

const BlockMain = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const BlockTopRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const BlockKindBadge = styled.span<{ $kind: "section" | "row" }>`
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 3px;
  background: ${({ $kind }) => ($kind === "section" ? "#dbeafe" : "#fef3c7")};
  color: ${({ $kind }) => ($kind === "section" ? "#1e40af" : "#92400e")};
  text-transform: uppercase;
  letter-spacing: 0.3px;
  flex-shrink: 0;
`;

const BlockName = styled.div`
  flex: 1;
  font-size: 13px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const BlockTagsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
`;

const BlockTag = styled.span`
  font-size: 10px;
  padding: 1px 6px;
  background: #010102;
  color: #fbfbfc;
  border-radius: 10px;
`;

const MenuButton = styled.button`
  background: transparent;
  border: none;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &:hover {
    background: rgba(0, 0, 0, 0.08);
    color: #000;
  }
`;

const MenuPopup = styled.div`
  position: absolute;
  right: 6px;
  top: 36px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  z-index: 100;
  min-width: 120px;
  overflow: hidden;
`;

const MenuItem = styled.button<{ $danger?: boolean }>`
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
  color: ${({ $danger }) => ($danger ? "#c0392b" : "#333")};

  &:hover {
    background: #f4f6f8;
  }
`;

const Empty = styled.div`
  font-size: 12px;
  color: #888;
  padding: 8px 4px;
  font-style: italic;
`;

const SearchWrapper = styled.div`
  position: relative;
  margin-bottom: 8px;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 6px 28px 6px 28px;
  font-size: 13px;
  border: 1px solid #ddd;
  border-radius: 5px;
  outline: none;
  &:focus { border-color: #2196F3; box-shadow: 0 0 0 2px rgba(33,150,243,0.15); }
`;

const SearchIcon = styled.i`
  position: absolute;
  left: 9px;
  top: 50%;
  transform: translateY(-50%);
  color: #999;
  font-size: 12px;
  pointer-events: none;
`;

const ClearSearchBtn = styled.button`
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 12px;
  &:hover { color: #333; }
`;

const FilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
`;

const FilterChip = styled.button<{ $active?: boolean }>`
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 12px;
  border: 1px solid ${({ $active }) => ($active ? "#2196F3" : "#d8dbdf")};
  background: ${({ $active }) => ($active ? "#e7f1ff" : "#fff")};
  color: ${({ $active }) => ($active ? "#1e40af" : "#555")};
  cursor: pointer;
  &:hover { border-color: #2196F3; }
`;

const ErrorBanner = styled.div`
  font-size: 12px;
  color: #c0392b;
  padding: 4px 6px;
  margin-bottom: 6px;
`;

// ── Edit Modal ────────────────────────────────────────────────────────────────

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ModalBox = styled.div`
  background: #fff;
  border-radius: 8px;
  padding: 20px 24px;
  width: 360px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
`;

const ModalTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #222;
`;

const ModalLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: #555;
  margin: 6px 0 4px;
`;

const ModalInput = styled.input`
  width: 100%;
  padding: 8px 10px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 5px;
  outline: none;
  margin-bottom: 8px;
  &:focus { border-color: #2196F3; box-shadow: 0 0 0 2px rgba(33,150,243,0.2); }
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

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
`;

const ModalBtn = styled.button<{ $primary?: boolean }>`
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

const ModalError = styled.div`
  font-size: 12px;
  color: #c0392b;
  margin-top: 6px;
  min-height: 16px;
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

const findSectionAncestor = (query: any, nodeId: string | null): string | null => {
  if (!nodeId) return null;
  let current: string | null = nodeId;
  while (current) {
    const node: any = query.node(current).get();
    if (!node) return null;
    if (node.data?.name === "Section") return current;
    current = node.data?.parent ?? null;
  }
  return null;
};

const lastSectionUnderRoot = (query: any): string | null => {
  const root = query.node("ROOT").get();
  const childIds: string[] = root?.data?.nodes ?? [];
  for (let i = childIds.length - 1; i >= 0; i--) {
    const node = query.node(childIds[i]).get();
    if (node?.data?.name === "Section") return childIds[i];
  }
  return null;
};

const buildFreshTree = (tree: any, query: any) => {
  const idMap = new Map<string, string>();
  Object.keys(tree.nodes).forEach((oldId) => idMap.set(oldId, getRandomId()));

  const newTree = {
    rootNodeId: idMap.get(tree.rootNodeId)!,
    nodes: {} as Record<string, any>,
  };

  Object.entries(tree.nodes).forEach(([oldId, serialized]: [string, any]) => {
    const newId = idMap.get(oldId)!;
    const remappedSerialized = {
      ...serialized,
      parent: serialized.parent ? idMap.get(serialized.parent) ?? serialized.parent : null,
      nodes: (serialized.nodes || []).map((cid: string) => idMap.get(cid) ?? cid),
      linkedNodes: serialized.linkedNodes
        ? Object.fromEntries(
            Object.entries(serialized.linkedNodes).map(([k, v]) => [k, idMap.get(v as string) ?? v])
          )
        : {},
    };
    const fresh = query.parseSerializedNode(remappedSerialized).toNode((node: any) => {
      node.id = newId;
    });
    newTree.nodes[newId] = fresh;
  });

  return newTree;
};

// ── Component ─────────────────────────────────────────────────────────────────

export const SavedBlocksToolbox: React.FC = () => {
  const { actions, query } = useEditor();
  const [items, setItems] = useState<SavedBlockListItem[]>([]);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<SavedBlockListItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const inFlight = useRef(false);

  const filtered = useMemo(() => {
    let list = items;
    if (activeTagFilter) {
      list = list.filter((b) => b.tags.includes(activeTagFilter));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((b) => b.name.toLowerCase().includes(q));
    }
    return list;
  }, [items, search, activeTagFilter]);

  const sortedTagChips = useMemo(() => {
    return Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  }, [tagCounts]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/saved-blocks");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load");
      setItems(json.data.items);
      setTagCounts(json.data.tagCounts ?? {});
    } catch (err: any) {
      setError(err?.message || "Failed to load saved blocks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
    const onChanged = () => fetchList();
    window.addEventListener("saved-blocks:changed", onChanged);
    return () => window.removeEventListener("saved-blocks:changed", onChanged);
  }, [fetchList]);

  // If the active tag filter no longer exists in the workspace, reset it.
  useEffect(() => {
    if (activeTagFilter && !(activeTagFilter in tagCounts)) {
      setActiveTagFilter(null);
    }
  }, [tagCounts, activeTagFilter]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!openMenuId) return;
    const onDocClick = () => setOpenMenuId(null);
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [openMenuId]);

  const handleInsert = async (item: SavedBlockListItem) => {
    if (inFlight.current) return;
    setError(null);

    let parentId: string | null = null;
    if (item.kind === "section") {
      parentId = "ROOT";
    } else {
      const selected = query.getEvent("selected").first();
      parentId = findSectionAncestor(query, selected ?? null) || lastSectionUnderRoot(query);
      if (!parentId) {
        setError("Add a Section first before inserting a Row.");
        return;
      }
    }

    inFlight.current = true;
    try {
      const res = await fetch(`/api/saved-blocks/${item.id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load block");

      const tree = json.data.contentJson;
      const fresh = buildFreshTree(tree, query);
      actions.addNodeTree(fresh as any, parentId);
      actions.selectNode(fresh.rootNodeId);
    } catch (err: any) {
      setError(err?.message || "Failed to insert block");
    } finally {
      inFlight.current = false;
    }
  };

  const openEdit = (item: SavedBlockListItem) => {
    setOpenMenuId(null);
    setEditingItem(item);
    setEditName(item.name);
    setEditTags(item.tags);
    setEditTagInput("");
    setEditError(null);
  };

  const addEditTag = (raw: string) => {
    const t = normalizeTag(raw);
    if (!t) return;
    setEditTags((prev) => (prev.includes(t) || prev.length >= 10 ? prev : [...prev, t]));
    setEditTagInput("");
  };

  const submitEdit = async () => {
    if (!editingItem) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditError("Name is required");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const finalTags = editTagInput.trim()
        ? [...editTags, normalizeTag(editTagInput)].filter((t, i, a) => t && a.indexOf(t) === i)
        : editTags;
      const res = await fetch(`/api/saved-blocks/${editingItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, tags: finalTags }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Update failed");
      setEditingItem(null);
      fetchList(); // Refresh to get updated tagCounts
    } catch (err: any) {
      setEditError(err?.message || "Update failed");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (item: SavedBlockListItem) => {
    setOpenMenuId(null);
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try {
      const res = await fetch(`/api/saved-blocks/${item.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to delete");
      fetchList();
    } catch (err: any) {
      setError(err?.message || "Delete failed");
    }
  };

  return (
    <ToolboxSection>
      <ToolboxSectionTitle>Saved blocks</ToolboxSectionTitle>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!loading && items.length > 0 && (
        <>
          <SearchWrapper>
            <SearchIcon className="fas fa-search" />
            <SearchInput
              type="text"
              placeholder="Search by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <ClearSearchBtn onClick={() => setSearch("")} title="Clear search">
                <i className="fas fa-times" />
              </ClearSearchBtn>
            )}
          </SearchWrapper>

          {sortedTagChips.length > 0 && (
            <FilterRow>
              <FilterChip
                $active={activeTagFilter === null}
                onClick={() => setActiveTagFilter(null)}
              >
                All ({items.length})
              </FilterChip>
              {sortedTagChips.map(([tag, count]) => (
                <FilterChip
                  key={tag}
                  $active={activeTagFilter === tag}
                  onClick={() =>
                    setActiveTagFilter((prev) => (prev === tag ? null : tag))
                  }
                >
                  {tag} ({count})
                </FilterChip>
              ))}
            </FilterRow>
          )}
        </>
      )}

      {loading ? (
        <Empty>Loading...</Empty>
      ) : items.length === 0 ? (
        <Empty>No saved blocks yet. Click 💾 on a Section or Row to save it.</Empty>
      ) : filtered.length === 0 ? (
        <Empty>
          {search
            ? `No blocks match "${search}".`
            : `No blocks tagged "${activeTagFilter}".`}
        </Empty>
      ) : (
        <BlockList>
          {filtered.map((item) => (
            <BlockRow key={item.id}>
              <BlockMain>
                <BlockTopRow>
                  <BlockKindBadge $kind={item.kind}>{item.kind}</BlockKindBadge>
                  <BlockName title={item.name}>{item.name}</BlockName>
                </BlockTopRow>
                {item.tags.length > 0 && (
                  <BlockTagsRow>
                    {[...item.tags].sort((a, b) => a.localeCompare(b)).map((t) => (
                      <BlockTag key={t}>{t}</BlockTag>
                    ))}
                  </BlockTagsRow>
                )}
              </BlockMain>
              <MenuButton
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(openMenuId === item.id ? null : item.id);
                }}
                title="Actions"
              >
                <i className="fas fa-ellipsis-h"></i>
              </MenuButton>
              {openMenuId === item.id && (
                <MenuPopup onClick={(e) => e.stopPropagation()}>
                  <MenuItem
                    onClick={() => {
                      setOpenMenuId(null);
                      handleInsert(item);
                    }}
                  >
                    <i className="fas fa-plus" style={{ marginRight: 8, fontSize: 11 }} />
                    Insert
                  </MenuItem>
                  <MenuItem onClick={() => openEdit(item)}>
                    <i className="fas fa-pen" style={{ marginRight: 8, fontSize: 11 }} />
                    Edit
                  </MenuItem>
                  <MenuItem $danger onClick={() => handleDelete(item)}>
                    <i className="far fa-trash-alt" style={{ marginRight: 8, fontSize: 11 }} />
                    Delete
                  </MenuItem>
                </MenuPopup>
              )}
            </BlockRow>
          ))}
        </BlockList>
      )}

      {editingItem && (
        <ModalOverlay onClick={() => !editSaving && setEditingItem(null)}>
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Edit block</ModalTitle>
            <ModalLabel>Block name</ModalLabel>
            <ModalInput
              autoFocus
              type="text"
              value={editName}
              maxLength={100}
              disabled={editSaving}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && !editSaving) setEditingItem(null);
              }}
            />

            <ModalLabel>Tags</ModalLabel>
            <TagPillBox>
              {editTags.map((t) => (
                <TagPill key={t}>
                  {t}
                  <TagPillRemove
                    onClick={() => setEditTags((prev) => prev.filter((x) => x !== t))}
                    title="Remove"
                  >
                    <i className="fas fa-times" />
                  </TagPillRemove>
                </TagPill>
              ))}
              <TagPillInput
                type="text"
                placeholder={editTags.length === 0 ? "e.g. hero, cta" : ""}
                value={editTagInput}
                disabled={editSaving}
                onChange={(e) => setEditTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addEditTag(editTagInput);
                  } else if (e.key === "Backspace" && !editTagInput && editTags.length) {
                    setEditTags((prev) => prev.slice(0, -1));
                  } else if (e.key === "Escape" && !editSaving) {
                    setEditingItem(null);
                  }
                }}
                onBlur={() => editTagInput && addEditTag(editTagInput)}
              />
            </TagPillBox>
            <SuggestionRow>
              {SUGGESTED_TAGS.filter((s) => !editTags.includes(s)).map((s) => (
                <SuggestionChip
                  key={s}
                  type="button"
                  onClick={() => addEditTag(s)}
                  disabled={editSaving}
                >
                  + {s}
                </SuggestionChip>
              ))}
            </SuggestionRow>

            <ModalError>{editError ?? ""}</ModalError>
            <ModalActions>
              <ModalBtn onClick={() => setEditingItem(null)} disabled={editSaving}>
                Cancel
              </ModalBtn>
              <ModalBtn $primary onClick={submitEdit} disabled={editSaving}>
                {editSaving ? "Saving..." : "Save"}
              </ModalBtn>
            </ModalActions>
          </ModalBox>
        </ModalOverlay>
      )}
    </ToolboxSection>
  );
};
