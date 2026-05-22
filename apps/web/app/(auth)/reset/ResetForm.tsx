"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type State = "checking" | "ready" | "invalid" | "submitting" | "done";

export default function ResetForm({
  brandLogoUrl,
  brandName,
}: {
  brandLogoUrl?: string | null;
  brandName?:    string;
} = {}) {
  const router = useRouter();
  const params = useSearchParams();
  const token  = params.get("token") ?? "";

  const [state, setState]   = useState<State>("checking");
  const [error, setError]   = useState<string | null>(null);
  const [pw, setPw]         = useState("");
  const [pw2, setPw2]       = useState("");

  // Pre-validate the token on mount so the user sees "expired" before
  // typing a password, not after.
  useEffect(() => {
    if (!token) { setState("invalid"); setError("Missing token in URL."); return; }
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/auth/reset?token=${encodeURIComponent(token)}`);
      if (cancelled) return;
      if (res.ok) { setState("ready"); return; }
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Invalid or expired link.");
      setState("invalid");
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (pw !== pw2)    { setError("Passwords don't match."); return; }
    setState("submitting");
    setError(null);

    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: pw }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Could not reset password.");
      setState("ready");
      return;
    }
    setState("done");
    setTimeout(() => router.push("/login"), 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={brandLogoUrl ?? "/logo.svg"}
          alt={brandName ?? "launchtic"}
          className="h-8 w-auto max-w-[180px] object-contain mb-6"
        />

        {state === "checking" && (
          <p className="text-sm text-gray-500">Verifying link…</p>
        )}

        {state === "invalid" && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Link not valid</h1>
            <p className="text-gray-500 text-sm mb-6">{error}</p>
            <Link
              href="/forgot-password"
              className="block w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors text-center"
            >
              Request a new link
            </Link>
            <Link href="/login" className="block text-center mt-4 text-sm text-gray-500 hover:text-gray-700">
              ← Back to login
            </Link>
          </>
        )}

        {state === "done" && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Password updated</h1>
            <p className="text-gray-500 text-sm">Redirecting you to login…</p>
          </>
        )}

        {(state === "ready" || state === "submitting") && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Set a new password</h1>
            <p className="text-gray-500 text-sm mb-6">
              Pick something at least 6 characters. You'll be signed out of any other sessions.
            </p>
            {error && (
              <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                <input
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  required
                  autoFocus
                  minLength={6}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm</label>
                <input
                  type="password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={state === "submitting"}
                className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {state === "submitting" ? "Updating…" : "Set password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
