"use client";

// First-run wizard Step 1 — owner account + workspace name. Visually
// matches the legacy RegisterForm (logo + card chrome) so the operator
// experiences a single continuous flow from install.sh → wizard → /login.

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Step1AdminForm() {
  const router = useRouter();
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const body = {
      name:          (form.get("name")          as string).trim(),
      email:         (form.get("email")         as string).trim(),
      password:       form.get("password")      as string,
      workspaceName: (form.get("workspaceName") as string).trim(),
    };

    const res = await fetch("/api/setup/admin", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.success) {
      setError(json.error ?? "Failed to create admin");
      setLoading(false);
      return;
    }
    router.push("/setup/domains");
  }

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt="launchtic"
        className="h-8 w-auto max-w-[180px] object-contain mb-6"
      />

      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
          Step 1 of 2
        </span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Set up your install</h1>
      <p className="text-gray-500 text-sm mb-6">
        Create the owner account and your first workspace.
      </p>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
          <input
            type="text"
            name="name"
            required
            placeholder="Jane Doe"
            autoFocus
            autoComplete="name"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Workspace name</label>
          <input
            type="text"
            name="workspaceName"
            required
            placeholder="My Business"
            defaultValue="My Workspace"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
        >
          {loading ? "Creating account…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
