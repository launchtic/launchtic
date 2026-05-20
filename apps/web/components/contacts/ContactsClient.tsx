"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Search, Upload, ChevronDown, Tag as TagIcon,
  Mail, Phone, Globe, Loader2, UserPlus, Plus, Pencil,
} from "lucide-react";
import ImportDialog from "./ImportDialog";
import ContactFormDrawer from "./ContactFormDrawer";
import { useRole } from "../../lib/role";
import { apiFetch } from "../../lib/api-client";
type Tag = { id: string; name: string; color: string | null };
type Contact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  country: string | null;
  createdAt: string;
  tags: { tag: Tag }[];
};

function TagBadge({ tag }: { tag: Tag }) {
  const bg = tag.color ?? "#6366f1";
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: bg }}
    >
      {tag.name}
    </span>
  );
}

export default function ContactsClient({ allTags, initialTotal = 0 }: { allTags: Tag[]; initialTotal?: number }) {
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(initialTotal);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { canWrite } = useRole();

  const fetchPage = useCallback(async (q: string, tag: string | null, cursor: string | null) => {
    const params = new URLSearchParams();
    if (q)   params.set("search", q);
    if (tag) params.set("tagId", tag);
    if (cursor) params.set("cursor", cursor);
    const res = await apiFetch(`/api/contacts?${params}`);
    return res.json();
  }, []);

  const refresh = useCallback(async (q: string, tag: string | null) => {
    setLoading(true);
    const json = await fetchPage(q, tag, null);
    if (json.success) {
      setContacts(json.data.items);
      setNextCursor(json.data.nextCursor);
    }
    setLoading(false);
  }, [fetchPage]);

  // Workspace-level total count (separate from list — uses fast indexed count).
  const refreshTotal = useCallback(async () => {
    const res = await apiFetch("/api/contacts/count");
    const json = await res.json();
    if (json.success) setTotal(json.data.total);
  }, []);

  useEffect(() => {
    refresh(search, tagFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagFilter]);

  useEffect(() => {
    refreshTotal();
  }, [refreshTotal]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const json = await fetchPage(search, tagFilter, nextCursor);
    if (json.success) {
      setContacts((prev) => [...prev, ...json.data.items]);
      setNextCursor(json.data.nextCursor);
    }
    setLoadingMore(false);
  }

  function handleSearch(val: string) {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => refresh(val, tagFilter), 350);
  }

  function handleTagFilter(id: string | null) {
    setTagFilter(id);
  }

  const fullName = (c: Contact) =>
    [c.firstName, c.lastName].filter(Boolean).join(" ") || "—";

  const activeTag = tagFilter ? allTags.find((t) => t.id === tagFilter) ?? null : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-4 sm:px-6 py-4 shrink-0">
        <div className="shrink-0">
          <h1 className="text-xl font-bold text-gray-900">Contacts</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} {total === 1 ? "contact" : "contacts"}</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:flex-1 lg:justify-end lg:flex-wrap">
          <div className="relative sm:flex-1 lg:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search contacts…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          {allTags.length > 0 && (
            <div className="relative shrink-0">
              <select
                value={tagFilter ?? ""}
                onChange={(e) => handleTagFilter(e.target.value || null)}
                className="w-full sm:w-auto appearance-none pl-3 pr-8 py-2 text-sm border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer border-gray-200 text-gray-700"
                style={activeTag ? { backgroundColor: (activeTag.color ?? "#6366f1") + "1a", borderColor: (activeTag.color ?? "#6366f1") + "66", color: activeTag.color ?? "#4338ca", fontWeight: 500 } : undefined}
              >
                <option value="">All tags</option>
                {allTags.map((tag) => (
                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/${slug}/contacts/tags`}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <TagIcon size={13} />
              <span className="hidden sm:inline">Manage Tags</span>
            </Link>
            {canWrite && (
              <button
                onClick={() => setImportOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <Upload size={13} />
                <span className="hidden sm:inline">Import CSV</span>
              </button>
            )}
            {canWrite && (
              <button
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
              >
                <Plus size={13} />
                <span className="hidden sm:inline">New Contact</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 pb-4">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-3">
              <UserPlus size={20} className="text-blue-500" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">No contacts yet</p>
            <p className="text-xs text-gray-400">
              {search || tagFilter ? "No contacts match your search" : "Add or import contacts to get started"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-6 py-3 font-semibold">Name / Email</th>
                <th className="text-left px-4 py-3 font-semibold">Phone</th>
                <th className="text-left px-4 py-3 font-semibold">Country</th>
                <th className="text-left px-4 py-3 font-semibold">Tags</th>
                <th className="text-left px-4 py-3 font-semibold">Added</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-6 py-3">
                    <Link href={`/${slug}/contacts/${c.id}`} className="block">
                      <p className="font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
                        {fullName(c)}
                      </p>
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Mail size={11} />
                        {c.email}
                      </p>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {c.phone ? (
                      <span className="flex items-center gap-1"><Phone size={12} />{c.phone}</span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {c.country ? (
                      <span className="flex items-center gap-1"><Globe size={12} />{c.country}</span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map(({ tag }) => <TagBadge key={tag.id} tag={tag} />)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditId(c.id)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {(nextCursor || contacts.length > 0) && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Showing {contacts.length.toLocaleString()}{nextCursor ? "+" : ""}
            </p>
            {nextCursor && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 rounded-lg transition-colors"
              >
                {loadingMore && <Loader2 size={12} className="animate-spin" />}
                Load more
              </button>
            )}
          </div>
        )}
        </div>
      </div>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => { setImportOpen(false); refresh(search, tagFilter); refreshTotal(); }}
      />

      <ContactFormDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => { setCreateOpen(false); refresh(search, tagFilter); refreshTotal(); }}
        allTags={allTags}
      />

      <ContactFormDrawer
        open={editId !== null}
        onClose={() => setEditId(null)}
        onSuccess={() => { setEditId(null); refresh(search, tagFilter); }}
        allTags={allTags}
        editContactId={editId ?? undefined}
      />
    </div>
  );
}
