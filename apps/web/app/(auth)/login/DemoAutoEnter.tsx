"use client";

import { useEffect, useRef } from "react";

// Renders on the login page only in DEMO_MODE. Immediately submits the demo
// sign-in server action so visitors land straight in the dashboard.
export default function DemoAutoEnter({ action }: { action: () => void }) {
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    ref.current?.requestSubmit();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form ref={ref} action={action} className="flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="launchtic" className="h-8 w-auto" />
        <p className="text-sm text-gray-500">Entering the demo…</p>
        <noscript>
          <button type="submit" className="text-sm text-blue-600 underline">
            Enter demo
          </button>
        </noscript>
      </form>
    </div>
  );
}
