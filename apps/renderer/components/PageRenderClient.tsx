"use client";

import dynamic from "next/dynamic";
import DevTestFill from "./DevTestFill";
import type { PageRenderAppPageData } from "@launchtic/elements";

// Dynamic + ssr:false mirrors EditorAppDynamic in apps/web. The render tree
// uses @launchtic/editor-core which relies on browser-only APIs, and isolating the
// import here ensures @launchtic/editor-core is loaded exactly once — from inside
// @launchtic/elements — so useNode and <Editor /> share the same React
// Context instance.
const PageRenderApp = dynamic(
  () => import("@launchtic/elements").then((m) => ({ default: m.PageRenderApp })),
  { ssr: false },
);

export default function PageRenderClient({ pageData }: { pageData: PageRenderAppPageData }) {
  return (
    <>
      <PageRenderApp pageData={pageData} />
      <DevTestFill />
      {/* Honeypot — hidden from humans, bots that auto-fill all inputs will
          populate this and the API will reject the submission. */}
      <input
        type="text"
        id="lt-website"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        defaultValue=""
        style={{
          position: "absolute",
          left: "-9999px",
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
        }}
      />
    </>
  );
}
