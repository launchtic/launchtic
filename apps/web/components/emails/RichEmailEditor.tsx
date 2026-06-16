"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@maily-to/core/style.css";
import { Editor } from "@maily-to/core";
import { ImageUploadExtension } from "@maily-to/core/extensions";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { apiFetch } from "../../lib/api-client";
import { Image as ImageIcon } from "lucide-react";
import MediaLibraryPicker from "../media/MediaLibraryPicker";

// `value` and `onChange` are JSON-stringified TipTap docs (maily.to format).
// Empty/invalid input falls back to an empty doc — strict JSON only.

type Props = {
  value: string;                              // JSON-stringified maily doc
  onChange: (value: string) => void;          // emits JSON-stringified maily doc
  onEditorReady?: (editor: TiptapEditor) => void;
  onFocus?: () => void;
  /**
   * Pixel min-height. Pass `undefined` (default) to let the wrapper fill its
   * parent — useful inside a flex column where you want the editor to grow.
   */
  minHeight?: number;
  /**
   * If true, render the maily top toolbar (B/I/U etc). Off by default since
   * maily already provides an inline floating bubble menu on selection +
   * slash-command for blocks.
   */
  showMenuBar?: boolean;
  /** CSS font-family stack for the email's chosen font (see emailFontCss).
   *  Applied as the `--email-font` var so the editor previews the real font. */
  fontCss?: string;
};

const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

function parseValue(value: string): JSONContent {
  const trimmed = (value ?? "").trim();
  if (!trimmed.startsWith("{")) return EMPTY_DOC;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && parsed.type === "doc") {
      return parsed as JSONContent;
    }
  } catch {
    // fall through to empty
  }
  return EMPTY_DOC;
}

export default function RichEmailEditor({
  value, onChange, onEditorReady, onFocus, minHeight, showMenuBar = false, fontCss,
}: Props) {
  const [editor, setEditor] = useState<TiptapEditor>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const lastEmittedRef = useRef<string>(value);

  // Stable refs for callbacks — keeps the maily Editor's `onCreate`/`onUpdate`
  // identity stable across renders so it doesn't re-init.
  const onChangeRef = useRef(onChange);
  const onEditorReadyRef = useRef(onEditorReady);
  const onFocusRef = useRef(onFocus);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onEditorReadyRef.current = onEditorReady; }, [onEditorReady]);
  useEffect(() => { onFocusRef.current = onFocus; }, [onFocus]);

  // Initial content — computed once. Subsequent value changes are synced via
  // editor.commands.setContent in the effect below.
  const [initial] = useState(() => parseValue(value));

  const handleCreate = useCallback((ed: TiptapEditor) => {
    setEditor(ed);
    onEditorReadyRef.current?.(ed);
    if (onFocusRef.current) ed.on("focus", onFocusRef.current);
  }, []);

  // Synchronous emit — no useTransition. Earlier we wrapped the parent
  // setState in startTransition to keep typing snappy under heavy parent
  // re-renders, but that introduced a timing bug: pending transitions
  // commit on different React lanes than the urgent setState from the
  // Preview-tab click handler, so previewed content could land before
  // (or after) the latest keystroke arrived in parent state. With direct
  // setState, parent always reflects the editor exactly. If typing perf
  // becomes an issue again, revisit with proper deferred-value patterns.
  const handleUpdate = useCallback((ed: TiptapEditor) => {
    const json = ed.getJSON();
    const str = JSON.stringify(json);
    if (str === lastEmittedRef.current) return;
    lastEmittedRef.current = str;
    onChangeRef.current(str);
  }, []);

  // External value sync (e.g. "Load from template" replaces the doc).
  // Guarded by lastEmittedRef so the round-trip from our own emission
  // never triggers setContent (which would lose cursor position and feel
  // janky).
  //
  // Deferred to a microtask: maily/tiptap's `setContent` may internally call
  // `flushSync`, and React 18 forbids flushSync inside lifecycle methods
  // (useEffect runs at the tail of a render cycle). queueMicrotask pushes
  // the sync work outside the render so React doesn't error.
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmittedRef.current) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || !editor) return;
      editor.commands.setContent(parseValue(value), false);
      const newStr = JSON.stringify(editor.getJSON());
      lastEmittedRef.current = newStr;
      if (newStr !== value) onChangeRef.current(newStr);
    });
    return () => { cancelled = true; };
  }, [value, editor]);

  // Image upload handler — wires maily's drag/paste/picker plugin to our
  // workspace storage endpoint. Stable identity to avoid re-instantiating
  // the extension on every render.
  const handleImageUpload = useCallback(async (file: Blob): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file as File);
    const res = await apiFetch("/api/media/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? "Upload failed");
    return json.data.url as string;
  }, []);

  // Memoize extensions array — passing a new array reference to maily
  // Editor on every render risks tripping internal useEditor deps and
  // re-initialising the editor (which is the worst-case typing lag).
  const extensions = useMemo(
    () => [ImageUploadExtension.configure({ onImageUpload: handleImageUpload })],
    [handleImageUpload],
  );

  // Memoize config — same reasoning as extensions.
  const config = useMemo(
    () => ({
      hasMenuBar: showMenuBar === true,
      spellCheck: false,            // ← disable per-keystroke browser dictionary work
      immediatelyRender: false,
      wrapClassName: "flex flex-col flex-1 min-h-0",
      bodyClassName: "flex-1 min-h-0 flex flex-col",
      // No `tiptap-content` class here — maily.to owns content typography via
      // its own `.mly:prose` system. Adding our legacy rules would conflict
      // with @maily-to/render's email output and the editor would visually
      // diverge from the Preview tab.
      //
      // pt-12: maily's inline bubble toolbar renders ABOVE the selected block
      // (placement: top-start) and is appended INSIDE this scroll container,
      // so the top-most block's toolbar gets clipped by the container edge
      // without enough headroom. The extra top padding gives it room.
      // pb-12: clears the floating "Library" button + last-line breathing room.
      contentClassName: "focus:outline-none flex-1 overflow-y-auto px-4 pt-12 pb-12",
    }),
    [showMenuBar],
  );

  return (
    // Important: NO `overflow-hidden` on this wrapper — maily.to renders
    // floating "+ / drag-handle" affordances at a negative left offset
    // from each block. overflow-hidden clips those.
    // `relative` anchors any maily portals that compute positions from the
    // nearest positioned ancestor.
    // `h-full` lets the editor grow inside a flex parent; the optional
    // minHeight prop is only applied when no flex parent constrains height.
    <div
      className="relative h-full flex flex-col"
      style={{ ...(minHeight ? { minHeight } : {}), ...(fontCss ? ({ ["--email-font" as any]: fontCss }) : {}) }}
    >
      <Editor
        contentJson={initial}
        placeholderUrl={process.env.APP_URL ?? "https://launchtic.com/"}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        extensions={extensions}
        config={config}
      />

      {/* Unobtrusive floating action — pick an existing image (no re-upload).
          Maily's native upload (slash "/Image", drag, paste) is untouched. */}
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        disabled={!editor}
        title="Insert image from Media Library"
        className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 shadow-sm text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 transition-colors"
      >
        <ImageIcon size={14} /> Library
      </button>

      {pickerOpen && (
        <MediaLibraryPicker
          onSelect={(url) => {
            if (!editor) return;
            // maily registers a TipTap image node; `setImage` isn't in the typed
            // chain (see @maily-to/core image block), so cast to call it.
            (editor.chain().focus() as any).setImage({ src: url }).run();
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
