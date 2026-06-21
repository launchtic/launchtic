"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { downloadFromApi } from "../../lib/api-client";

// Icon button that downloads a .ltbundle (or any file) from an API endpoint and
// shows a spinner while the request is in flight, so the user knows it's working
// (bundles can take a few seconds to build + transfer).
export default function ExportButton({
  url,
  filename,
  title = "Export as .ltbundle",
  size = 14,
  className = "p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50",
}: {
  url: string;
  filename: string;
  title?: string;
  size?: number;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      type="button"
      title={title}
      disabled={loading}
      onClick={async () => {
        if (loading) return;
        setLoading(true);
        try {
          await downloadFromApi(url, filename);
        } catch (e) {
          alert(e instanceof Error ? e.message : "Export failed");
        } finally {
          setLoading(false);
        }
      }}
      className={className}
    >
      {loading ? <Loader2 size={size} className="animate-spin" /> : <Download size={size} />}
    </button>
  );
}
