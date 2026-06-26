"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { StickyNote, Loader2, Pencil, Trash2, Check, X, Pin, PinOff } from "lucide-react";
import { useConfirm } from "../ui/ConfirmDialog";
import { useRole } from "../../lib/role";
import { apiFetch } from "../../lib/api-client";

type Note = {
  id: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  authorName: string | null;
};

// Pinned notes first, then newest. Mirrors the server ordering so optimistic
// updates stay consistent with a later refetch.
function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

// Render plain text with clickable http(s) links.
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all">
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

export default function ContactNotes({ contactId }: { contactId: string }) {
  const { canManageContacts } = useRole();
  const confirm = useConfirm();

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/contacts/${contactId}/notes`);
    const json = await res.json();
    if (json.success) setNotes(json.data.notes);
    setLoading(false);
  }, [contactId]);

  useEffect(() => { load(); }, [load]);

  async function addNote() {
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    const res = await apiFetch(`/api/contacts/${contactId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const json = await res.json();
    setSaving(false);
    if (res.ok) {
      setNotes((prev) => sortNotes([json.data, ...prev]));
      setDraft("");
    }
  }

  async function togglePin(note: Note) {
    const pinned = !note.pinned;
    setNotes((prev) => sortNotes(prev.map((n) => (n.id === note.id ? { ...n, pinned } : n))));
    const res = await apiFetch(`/api/contacts/${contactId}/notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned }),
    });
    if (!res.ok) {
      setNotes((prev) => sortNotes(prev.map((n) => (n.id === note.id ? { ...n, pinned: note.pinned } : n))));
    }
  }

  async function saveEdit(id: string) {
    const body = editBody.trim();
    if (!body) return;
    const res = await apiFetch(`/api/contacts/${contactId}/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const json = await res.json();
    if (res.ok) {
      setNotes((prev) => prev.map((n) => (n.id === id ? json.data : n)));
      setEditingId(null);
    }
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: "Delete note?",
      description: "This note will be permanently removed.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await apiFetch(`/api/contacts/${contactId}/notes/${id}`, { method: "DELETE" });
  }

  return (
    <div className="mb-6">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <StickyNote size={13} /> Notes
      </p>

      {canManageContacts && (
        <div className="bg-white border border-gray-200 rounded-xl p-3 mb-3 shadow-sm">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a note… (e.g. talked about pricing, follow up next week)"
            rows={2}
            className="w-full text-sm resize-y bg-transparent focus:outline-none placeholder:text-gray-400"
          />
          <div className="flex justify-end">
            <button
              onClick={addNote}
              disabled={saving || !draft.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition-colors"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <StickyNote size={13} />}
              Add note
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-gray-400" /></div>
      ) : notes.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">No notes yet.</p>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <div
              key={n.id}
              className={`group rounded-xl px-4 py-3 shadow-sm border ${
                n.pinned ? "bg-amber-50/60 border-amber-200" : "bg-white border-gray-100"
              }`}
            >
              {editingId === n.id ? (
                <div>
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={2}
                    autoFocus
                    className="w-full text-sm resize-y border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex justify-end gap-1 mt-1.5">
                    <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                      <X size={13} />
                    </button>
                    <button onClick={() => saveEdit(n.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg">
                      <Check size={13} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {n.pinned && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1">
                      <Pin size={10} className="fill-amber-500 text-amber-500" /> Pinned
                    </span>
                  )}
                  <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                    <Linkified text={n.body} />
                  </p>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <span className="text-[11px] text-gray-400">
                      {n.authorName ? `${n.authorName} · ` : ""}
                      {new Date(n.createdAt).toLocaleString()}
                      {n.updatedAt !== n.createdAt ? " (edited)" : ""}
                    </span>
                    {canManageContacts && (
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => togglePin(n)}
                          className={`p-1.5 rounded-lg transition-all ${
                            n.pinned
                              ? "text-amber-500 hover:bg-amber-100"
                              : "text-gray-400 hover:text-amber-600 hover:bg-amber-50 opacity-0 group-hover:opacity-100"
                          }`}
                          title={n.pinned ? "Unpin" : "Pin"}
                        >
                          {n.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                        </button>
                        <button
                          onClick={() => { setEditingId(n.id); setEditBody(n.body); }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Edit"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => remove(n.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
