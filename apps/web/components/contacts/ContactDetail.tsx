"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import {
  ChevronRight, ChevronLeft, Mail, Phone, Globe, Calendar, Tag as TagIcon,
  Plus, X, Trash2, Loader2, ShoppingCart, FileText, Eye, Pencil,
  MousePointer, CheckCircle, AlertCircle, Activity, Repeat,
} from "lucide-react";
import { useConfirm } from "../ui/ConfirmDialog";
import ContactFormDrawer from "./ContactFormDrawer";

type Tag = { id: string; name: string; color: string | null };
type ContactTag = { tag: Tag; addedAt: string };
type Event = {
  id: string;
  type: string;
  data: Record<string, string> | null;
  createdAt: string;
};
type Contact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  country: string | null;
  createdAt: string;
  tags: ContactTag[];
  events: Event[];
  _count: { orders: number };
};
type Enrollment = {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "EXITED" | "FAILED";
  currentStepIndex: number;
  totalSteps: number;
  nextSendAt: string;
  enrolledAt: string;
  completedAt: string | null;
  exitReason: string | null;
  sequence: { id: string; name: string };
};

const EVENT_ICON: Record<string, React.ReactNode> = {
  PAGE_VIEW:    <Eye size={13} className="text-blue-500" />,
  FORM_SUBMIT:  <FileText size={13} className="text-violet-500" />,
  EMAIL_OPEN:   <Mail size={13} className="text-sky-500" />,
  EMAIL_CLICK:  <MousePointer size={13} className="text-indigo-500" />,
  PURCHASE:     <ShoppingCart size={13} className="text-green-600" />,
  TAG_ADDED:    <TagIcon size={13} className="text-emerald-500" />,
  TAG_REMOVED:  <TagIcon size={13} className="text-gray-400" />,
  UNSUBSCRIBED: <AlertCircle size={13} className="text-red-500" />,
};

const EVENT_LABEL: Record<string, string> = {
  PAGE_VIEW:    "Viewed page",
  FORM_SUBMIT:  "Submitted form",
  EMAIL_OPEN:   "Opened email",
  EMAIL_CLICK:  "Clicked email",
  PURCHASE:     "Made a purchase",
  TAG_ADDED:    "Tag added",
  TAG_REMOVED:  "Tag removed",
  UNSUBSCRIBED: "Unsubscribed",
};

function TagBadge({ tag, onRemove }: { tag: Tag; onRemove: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: tag.color ?? "#6366f1" }}
    >
      {tag.name}
      <button onClick={onRemove} className="hover:bg-black/20 rounded-full p-0.5 transition-colors">
        <X size={10} />
      </button>
    </span>
  );
}

export default function ContactDetail({
  contact: initial,
  allTags,
  enrollments = [],
}: {
  contact: Contact;
  allTags: Tag[];
  enrollments?: Enrollment[];
}) {
  const [contact, setContact] = useState(initial);
  const [tagSearch, setTagSearch] = useState("");
  const [addingTag, setAddingTag] = useState<string | null>(null);
  const [removingTag, setRemovingTag] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"info" | "timeline">("info");
  const router = useRouter();
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const confirm = useConfirm();

  const assignedIds = new Set(contact.tags.map((ct) => ct.tag.id));
  const availableTags = allTags.filter(
    (t) => !assignedIds.has(t.id) && t.name.toLowerCase().includes(tagSearch.toLowerCase())
  );

  async function addTag(tag: Tag) {
    setAddingTag(tag.id);
    const res = await fetch(`/api/contacts/${contact.id}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId: tag.id }),
    });
    if (res.ok) {
      setContact((c) => ({
        ...c,
        tags: [...c.tags, { tag, addedAt: new Date().toISOString() }],
      }));
    }
    setAddingTag(null);
  }

  async function removeTag(tagId: string) {
    setRemovingTag(tagId);
    await fetch(`/api/contacts/${contact.id}/tags`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    setContact((c) => ({ ...c, tags: c.tags.filter((ct) => ct.tag.id !== tagId) }));
    setRemovingTag(null);
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete contact?",
      description: `This will permanently delete ${contact.email} and all their data.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
    router.push(`/${slug}/contacts`);
  }

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left — contact info */}
      <div className={`
        w-full md:w-80 md:shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto
        ${mobileView === "info" ? "flex" : "hidden md:flex"}
      `}>
        {/* Breadcrumb */}
        <div className="px-5 py-4 border-b border-gray-100">
          <nav className="flex items-center gap-1 text-xs text-gray-400 mb-3">
            <Link href={`/${slug}/contacts`} className="hover:text-blue-600">Contacts</Link>
            <ChevronRight size={11} />
            <span className="text-gray-700 truncate font-medium">{contact.email}</span>
          </nav>

          {/* Avatar */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">
              <span className="text-blue-700 text-base font-bold">
                {(contact.firstName?.[0] ?? contact.email[0]).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">{fullName}</p>
              <p className="text-xs text-gray-400 truncate">{contact.email}</p>
            </div>
            {/* Mobile: switch to timeline */}
            <button
              onClick={() => setMobileView("timeline")}
              className="md:hidden flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors shrink-0"
            >
              <Activity size={12} />
              Activity
            </button>
          </div>
        </div>

        {/* Info fields */}
        <div className="px-5 py-4 space-y-3 border-b border-gray-100">
          {[
            { icon: <Mail size={13} />, label: "Email", value: contact.email },
            { icon: <Phone size={13} />, label: "Phone", value: contact.phone },
            { icon: <Globe size={13} />, label: "Country", value: contact.country },
            { icon: <Calendar size={13} />, label: "Added", value: new Date(contact.createdAt).toLocaleDateString() },
            { icon: <ShoppingCart size={13} />, label: "Orders", value: contact._count.orders || "0" },
          ].map(({ icon, label, value }) => (
            <div key={label} className="flex items-center gap-2.5 text-sm">
              <span className="text-gray-400 shrink-0">{icon}</span>
              <span className="text-gray-400 w-16 shrink-0 text-xs">{label}</span>
              <span className="text-gray-800 truncate">{value ?? "—"}</span>
            </div>
          ))}
        </div>

        {/* Tags */}
        <div className="px-5 py-4 space-y-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {contact.tags.map(({ tag }) => (
              <TagBadge
                key={tag.id}
                tag={tag}
                onRemove={() => !removingTag && removeTag(tag.id)}
              />
            ))}
            {contact.tags.length === 0 && (
              <p className="text-xs text-gray-400">No tags</p>
            )}
          </div>

          {/* Add tag */}
          {availableTags.length > 0 && (
            <div>
              <input
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder="Search tags…"
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 mb-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
                {availableTags.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => addTag(t)}
                    disabled={addingTag === t.id}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  >
                    {addingTag === t.id ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color ?? "#6366f1" }} />
                    )}
                    <Plus size={10} className="text-gray-400" />
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sequences */}
        <div className="px-5 py-4 space-y-2 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <Repeat size={12} /> Sequences
          </p>
          {enrollments.length === 0 ? (
            <p className="text-xs text-gray-400">Not enrolled in any sequence.</p>
          ) : (
            <div className="space-y-1.5">
              {enrollments.map((e) => (
                <Link
                  key={e.id}
                  href={`/${slug}/sequences/${e.sequence.id}`}
                  className="block border border-gray-200 hover:border-blue-200 hover:bg-blue-50/30 rounded-lg px-2.5 py-2 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-gray-800 truncate flex-1">
                      {e.sequence.name}
                    </span>
                    <span className={`text-[9px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                      e.status === "ACTIVE"    ? "bg-blue-50 text-blue-700"
                      : e.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700"
                      : e.status === "FAILED"    ? "bg-red-50 text-red-700"
                      :                            "bg-gray-100 text-gray-500"
                    }`}>
                      {e.status.toLowerCase()}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Step {Math.min(e.currentStepIndex + 1, e.totalSteps)} / {e.totalSteps}
                    {e.status === "ACTIVE" && (
                      <> · next {new Date(e.nextSendAt).toLocaleString()}</>
                    )}
                    {e.status === "EXITED" && e.exitReason && (
                      <> · {e.exitReason}</>
                    )}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 mt-auto flex items-center gap-2">
          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
          >
            <Pencil size={12} />
            Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
          >
            {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Delete
          </button>
        </div>
      </div>

      {/* Right — timeline */}
      <div className={`
        flex-1 flex flex-col overflow-hidden bg-gray-50
        ${mobileView === "timeline" ? "flex" : "hidden md:flex"}
      `}>
        {/* Mobile back header */}
        <div className="md:hidden flex items-center gap-2 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={() => setMobileView("info")}
            className="p-1.5 -ml-1 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-gray-900">Activity Timeline</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Activity Timeline</p>

        {contact.events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CheckCircle size={32} className="text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">No activity yet</p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
            <div className="space-y-1">
              {contact.events.map((ev) => (
                <div key={ev.id} className="flex gap-4 relative">
                  <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center shrink-0 z-10">
                    {EVENT_ICON[ev.type] ?? <CheckCircle size={13} className="text-gray-400" />}
                  </div>
                  <div className="flex-1 bg-white border border-gray-100 rounded-xl px-4 py-2.5 mb-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800">
                        {EVENT_LABEL[ev.type] ?? ev.type}
                      </p>
                      <span className="text-xs text-gray-400 shrink-0">
                        {new Date(ev.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {ev.data && Object.keys(ev.data).length > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {Object.entries(ev.data).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </div>

      <ContactFormDrawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSuccess={() => { setEditOpen(false); router.refresh(); }}
        allTags={allTags}
        editContactId={contact.id}
      />
    </div>
  );
}
