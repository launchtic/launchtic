"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Loader2, Plus, Trash2, Crown, X, Copy, Check, AlertTriangle } from "lucide-react";
import { apiFetch } from "../../lib/api-client";

type Role = {
  id:          string;
  name:        string;
  permissions: string[];
};

// Member = invited user with a WorkspaceMember row. The Organization owner
// is rendered separately from `ownerInfo` because they don't have (and
// don't need) a WorkspaceMember row — they bypass permissions via
// Organization.ownerId.
type Member = {
  userId:   string;
  roleId:   string;
  role:     Role;
  joinedAt: string;
  user: { id: string; name: string | null; email: string; avatar: string | null };
};

type OwnerInfo = {
  userId: string;
  name:   string | null;
  email:  string;
  avatar: string | null;
};

type CreatedCredentials = {
  name:     string;
  email:    string;
  password: string;
};

function initials(name: string | null, email: string) {
  if (name) {
    const parts = name.trim().split(" ");
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      className="p-1 text-gray-400 hover:text-gray-700 rounded transition-colors"
      title="Copy"
    >
      {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
    </button>
  );
}

export default function TeamPanel({
  ownerInfo,
  initialMembers,
  currentUserId,
  currentUserRole,
  isOwner: viewerIsOwner,
}: {
  ownerInfo:        OwnerInfo | null;
  initialMembers:   Member[];
  currentUserId:    string;
  currentUserRole:  string;
  /** True when the viewer is the Organization owner (always full access). */
  isOwner:          boolean;
}) {
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = params?.workspaceSlug ?? "";

  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [roles, setRoles]     = useState<Role[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);

  // Anyone with members:manage can manage. Owner has it via bypass; Admin
  // role has it by default (if Owner created one). Server enforces the
  // real check — this is just to hide UI affordances early.
  const canManage = viewerIsOwner || currentUserRole === "Admin";

  // Fetch available roles for the invite dropdown
  useEffect(() => {
    apiFetch("/api/roles")
      .then((r) => r.json())
      .then((r) => { if (r.success) setRoles(r.data); })
      .finally(() => setRolesLoaded(true));
  }, []);

  // ── Invite ──────────────────────────────────────────────
  const [showInvite, setShowInvite]   = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState<string>("");
  const [inviting, setInviting]       = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);

  // Default invite role to the first available role when roles load.
  useEffect(() => {
    if (!inviteRoleId && roles.length > 0) {
      setInviteRoleId(roles[0].id);
    }
  }, [roles, inviteRoleId]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteRoleId) return;
    setInviting(true);
    setInviteError(null);
    const res  = await apiFetch("/api/team", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: inviteEmail.trim(), roleId: inviteRoleId }),
    });
    const json = await res.json();
    setInviting(false);
    if (!res.ok) { setInviteError(json.error ?? "Failed to add member"); return; }

    setMembers((prev) => [...prev, json.data]);
    setShowInvite(false);

    if (json.data.generatedPassword) {
      setCredentials({
        name:     json.data.user.email,
        email:    json.data.user.email,
        password: json.data.generatedPassword,
      });
    }

    setInviteEmail("");
  }

  // ── Change role ─────────────────────────────────────────
  const [changingRole, setChangingRole] = useState<string | null>(null);

  async function handleRoleChange(member: Member, newRoleId: string) {
    setChangingRole(member.userId);
    const res  = await apiFetch(`/api/team/${member.userId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ roleId: newRoleId }),
    });
    const json = await res.json();
    setChangingRole(null);
    if (!res.ok) { alert(json.error ?? "Failed to change role"); return; }
    setMembers((prev) =>
      prev.map((m) => m.userId === member.userId
        ? { ...m, roleId: json.data.roleId, role: json.data.role }
        : m
      )
    );
  }

  // ── Remove ──────────────────────────────────────────────
  const [removing, setRemoving] = useState<string | null>(null);

  async function handleRemove(member: Member) {
    if (!confirm(`Remove ${member.user.name ?? member.user.email} from this workspace?`)) return;
    setRemoving(member.userId);
    const res  = await apiFetch(`/api/team/${member.userId}`, { method: "DELETE" });
    const json = await res.json();
    setRemoving(null);
    if (!res.ok) { alert(json.error ?? "Failed to remove member"); return; }
    setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
  }

  function canEditMember(member: Member): boolean {
    if (member.userId === currentUserId) return false;         // Can't edit yourself
    return canManage;
  }

  const noRoles = rolesLoaded && roles.length === 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">Team</h2>
          <p className="text-sm text-gray-500">Manage who has access to this workspace.</p>
        </div>
        {canManage && (
          <button
            onClick={() => { setShowInvite(true); setInviteError(null); setInviteEmail(""); }}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Plus size={14} />
            Add member
          </button>
        )}
      </div>

      {/* Member list — Owner row always first, then invited members */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {/* Owner row (Organization founder) */}
        {ownerInfo && (
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-xs font-semibold text-amber-700 shrink-0">
              {ownerInfo.avatar
                ? <img src={ownerInfo.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                : initials(ownerInfo.name, ownerInfo.email)
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {ownerInfo.name ?? ownerInfo.email}
                {ownerInfo.userId === currentUserId && (
                  <span className="ml-1.5 text-xs text-gray-400">(you)</span>
                )}
              </p>
              {ownerInfo.name && (
                <p className="text-xs text-gray-400 truncate">{ownerInfo.email}</p>
              )}
            </div>
            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200">
              <Crown size={12} className="text-amber-500" />
              Owner
            </span>
          </div>
        )}

        {members.map((member) => (
          <div
            key={member.userId}
            className="flex items-center gap-3 px-5 py-4 border-t border-gray-100"
          >
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
              {member.user.avatar
                ? <img src={member.user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                : initials(member.user.name, member.user.email)
              }
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {member.user.name ?? member.user.email}
                {member.userId === currentUserId && (
                  <span className="ml-1.5 text-xs text-gray-400">(you)</span>
                )}
              </p>
              {member.user.name && (
                <p className="text-xs text-gray-400 truncate">{member.user.email}</p>
              )}
            </div>

            {/* Role selector (editable) or badge (locked: self / not manager) */}
            {canEditMember(member) ? (
              <div className="relative shrink-0">
                {changingRole === member.userId ? (
                  <Loader2 size={14} className="animate-spin text-gray-400" />
                ) : (
                  <select
                    value={member.roleId}
                    onChange={(e) => handleRoleChange(member, e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-50 text-gray-600 border-gray-200">
                {member.role.name}
              </span>
            )}

            {canEditMember(member) && (
              <button
                onClick={() => handleRemove(member)}
                disabled={removing === member.userId}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40 transition-colors shrink-0"
                title="Remove member"
              >
                {removing === member.userId
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Trash2 size={13} />
                }
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add member modal */}
      {showInvite && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
          onClick={() => setShowInvite(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Add team member</h2>
              <button onClick={() => setShowInvite(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Empty roles state — block invite until at least one role exists */}
            {noRoles ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-700 leading-relaxed">
                    <p className="font-medium mb-0.5">No roles defined</p>
                    <p>Create at least one role before inviting members. Roles control what new members can do in this workspace.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowInvite(false)}
                    className="flex-1 px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <Link
                    href={`/${workspaceSlug}/settings/roles`}
                    className="flex-1 flex items-center justify-center gap-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
                  >
                    Create role
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {inviteError && (
                  <p className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{inviteError}</p>
                )}

                <form onSubmit={handleInvite} className="space-y-3">
                  <input
                    autoFocus
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Email address"
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                    <select
                      value={inviteRoleId}
                      onChange={(e) => setInviteRoleId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-gray-400">
                      Manage roles in{" "}
                      <Link href={`/${workspaceSlug}/settings/roles`} className="text-blue-600 hover:underline">
                        Settings → Roles
                      </Link>.
                    </p>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowInvite(false)}
                      className="flex-1 px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={inviting || !inviteEmail.trim() || !inviteRoleId}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 transition-colors"
                    >
                      {inviting ? <><Loader2 size={13} className="animate-spin" /> Creating…</> : "Create & add"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Credentials modal — shown once after account creation */}
      {credentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center shrink-0">
                <Check size={16} className="text-green-600" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Account created</h2>
                <p className="text-xs text-gray-500">Share these credentials with the new member</p>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">Email</p>
                  <p className="text-sm font-mono text-gray-800">{credentials.email}</p>
                </div>
                <CopyButton text={credentials.email} />
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">Temporary password</p>
                  <p className="text-sm font-mono text-gray-800">{credentials.password}</p>
                </div>
                <CopyButton text={credentials.password} />
              </div>
            </div>

            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              This password is shown only once. The user should change it after first login via Settings → Profile.
            </p>

            <button
              onClick={() => setCredentials(null)}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
