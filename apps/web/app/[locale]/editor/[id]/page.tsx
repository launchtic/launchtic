"use client";

import dynamic from "next/dynamic";
import { use } from "react";

const EditorApp = dynamic(() => import("../../../../components/editor/EditorApp"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen text-sm text-gray-400">
      Loading editor...
    </div>
  ),
});

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <EditorApp funnelStepId={id} />;
}
