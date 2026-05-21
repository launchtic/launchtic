"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotForm() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = form.get("email") as string;

    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Something went wrong. Try again.");
        return;
      }
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <img src="/logo.svg" alt="launchtic" className="h-8 w-auto mb-6" />

        {submitted ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Check your email</h1>
            <p className="text-gray-500 text-sm mb-6 leading-relaxed">
              If we found an account for that email, we sent a password reset link. It expires in 1 hour.
            </p>
            <p className="text-xs text-gray-400 mb-6">
              Didn't get it? Check your spam folder, or{" "}
              <button
                onClick={() => setSubmitted(false)}
                className="text-blue-600 hover:text-blue-700 underline"
              >
                request another
              </button>.
            </p>
            <Link href="/login" className="block text-sm text-blue-600 hover:text-blue-700">
              ← Back to login
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Forgot your password?</h1>
            <p className="text-gray-500 text-sm mb-6">
              Enter your email and we'll send you a reset link.
            </p>
            {error && (
              <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  required
                  autoFocus
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
            <Link href="/login" className="block text-center mt-4 text-sm text-gray-500 hover:text-gray-700">
              ← Back to login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
