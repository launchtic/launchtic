import { Play } from "lucide-react";
import { isDemoMode } from "../lib/demo";

// Thin bar shown only in the public demo so visitors know it's a shared,
// resetting sandbox where some actions are disabled. Self-gates: renders
// nothing on real installs.
export default function DemoBanner() {
  if (!isDemoMode()) return null;

  return (
    <div className="shrink-0 bg-blue-600 text-white text-xs sm:text-sm px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
      <span className="inline-flex items-center gap-1.5">
        <Play size={14} className="shrink-0" />
        <span>You&apos;re in the <strong>Launchtic demo</strong> — shared sandbox, resets daily. Some actions are disabled.</span>
      </span>
      <a
        href="https://launchtic.com/docs/installation"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold underline underline-offset-2 hover:no-underline whitespace-nowrap"
      >
        Self-host it free →
      </a>
    </div>
  );
}
