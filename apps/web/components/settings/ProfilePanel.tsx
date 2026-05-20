"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { apiFetch } from "../../lib/api-client";

export default function ProfilePanel({
  initialName,
  email,
}: {
  initialName: string;
  email: string;
}) {
  const { update } = useSession();
  const router = useRouter();

  // ── Name ──────────────────────────────────────────────────
  const [name, setName] = useState(initialName);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState(false);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim() === initialName) return;
    setSavingName(true); setNameError(null); setNameSuccess(false);
    const res = await apiFetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const json = await res.json();
    setSavingName(false);
    if (!res.ok) { setNameError(json.error ?? "Failed to update."); return; }
    await update({ name: name.trim() });
    setNameSuccess(true);
    setTimeout(() => setNameSuccess(false), 2500);
    router.refresh();
  }

  // ── Password ───────────────────────────────────────────────
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  async function handleSavePw(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) { setPwError("Passwords do not match."); return; }
    if (newPw.length < 6)   { setPwError("Password must be at least 6 characters."); return; }
    setSavingPw(true); setPwError(null); setPwSuccess(false);
    const res = await apiFetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
    });
    const json = await res.json();
    setSavingPw(false);
    if (!res.ok) { setPwError(json.error ?? "Failed to update."); return; }
    setCurrentPw(""); setNewPw(""); setConfirmPw("");
    setPwSuccess(true);
    setTimeout(() => setPwSuccess(false), 2500);
  }

  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Profile</h2>
        <p className="text-sm text-gray-500">Manage your personal account information.</p>
      </div>

      {/* Name */}
      <section className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Display name</h3>
        <form onSubmit={handleSaveName} className="flex gap-3">
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setNameSuccess(false); }}
            placeholder="Your name"
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={savingName || !name.trim() || name.trim() === initialName}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {savingName ? <Loader2 size={14} className="animate-spin" /> : "Save"}
          </button>
        </form>
        {nameError   && <p className="text-xs text-red-600">{nameError}</p>}
        {nameSuccess && <p className="text-xs text-green-600">Name updated.</p>}
      </section>

      {/* Email — read only */}
      <section className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Email address</h3>
        <input
          value={email}
          disabled
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-400"
        />
        <p className="text-xs text-gray-400">Email cannot be changed.</p>
      </section>

      {/* Password */}
      <section className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Change password</h3>
        <form onSubmit={handleSavePw} className="space-y-3">
          <input
            type="password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            placeholder="Current password"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="New password"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            placeholder="Confirm new password"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {pwError   && <p className="text-xs text-red-600">{pwError}</p>}
          {pwSuccess && <p className="text-xs text-green-600">Password updated.</p>}
          <button
            type="submit"
            disabled={savingPw || !currentPw || !newPw || !confirmPw}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {savingPw ? <><Loader2 size={14} className="animate-spin inline mr-1" />Saving…</> : "Update password"}
          </button>
        </form>
      </section>
    </div>
  );
}
