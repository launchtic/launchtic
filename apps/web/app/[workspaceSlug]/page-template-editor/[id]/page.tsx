"use client";

import dynamic from "next/dynamic";
import { use } from "react";

const PageTemplateEditorApp = dynamic(
  () => import("@launchtic/elements").then((m) => ({ default: m.PageTemplateEditorApp })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen text-sm text-gray-400">
        Loading editor...
      </div>
    ),
  }
);

export default function PageTemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <PageTemplateEditorApp templateId={id} />;
}
