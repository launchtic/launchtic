import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { Toolbar, ToolbarButton, ButtonGroup, LinkInput, ColorPickerContainer } from "../../editor/common/ElementToolBarUI";
import { ColorPickerPopup } from "../../editor/common/settings/ColorPickerPopup";
import { rgbaToString } from "../../utils/helpers";

const SYSTEM_FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

type Props = {
  initialHtml: string;
  onUpdate: (html: string) => void;
  onBlur: () => void;
  // pass-through styling so the inline editor visually matches the rendered FAQ answer
  style?: React.CSSProperties;
  className?: string;
};

/**
 * Lightweight inline rich-text editor for a single FAQ answer.
 * Activated when the user clicks an answer in editor mode; floats a small
 * toolbar (bold / italic / underline / link) above the element being typed.
 *
 * Uses the same floating-toolbar pattern as BaseEditor (portal to body,
 * recompute position on scroll/resize) so it never overlaps page content.
 */
export const FAQAnswerEditor: React.FC<Props> = ({
  initialHtml,
  onUpdate,
  onBlur,
  style,
  className,
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const colorButtonRef = useRef<HTMLButtonElement>(null);
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ bulletList: false, orderedList: false }),
      Underline,
      Link.configure({
        openOnClick: false,
        linkOnPaste: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      TextStyle,
      Color,
    ],
    content: initialHtml || "<p></p>",
    immediatelyRender: false,
    editorProps: {
      handlePaste(view, event) {
        // Strict plain-text paste — same policy as BaseEditor.
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!text) return false;
        event.preventDefault();
        view.dispatch(view.state.tr.insertText(text));
        return true;
      },
    },
    autofocus: "end",
    onUpdate: ({ editor }) => {
      onUpdate(editor.getHTML());
    },
  });

  // Track current link's href so the input pre-fills with it on toggle.
  useEffect(() => {
    if (!editor) return;
    const sync = () => {
      if (editor.isActive("link")) {
        setLinkUrl(editor.getAttributes("link").href ?? "");
      }
    };
    editor.on("selectionUpdate", sync);
    return () => { editor.off("selectionUpdate", sync); };
  }, [editor]);

  // Position toolbar above the editor element (flip below if not enough room).
  useEffect(() => {
    if (!editor) return;

    const recalc = () => {
      const el = editor.view?.dom as HTMLElement | undefined;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const h = toolbarRef.current?.offsetHeight ?? 44;
      const gap = 8;
      const wantsTop = rect.top - h - gap;
      const top = wantsTop >= 8 ? wantsTop : rect.bottom + gap;
      setToolbarPos({ top: Math.round(top), left: Math.round(rect.left + rect.width / 2) });
    };

    recalc();
    window.addEventListener("scroll", recalc, true);
    window.addEventListener("resize", recalc);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(recalc) : null;
    if (ro && editor.view?.dom) ro.observe(editor.view.dom);

    return () => {
      window.removeEventListener("scroll", recalc, true);
      window.removeEventListener("resize", recalc);
      ro?.disconnect();
    };
  }, [editor, showLinkInput]);

  // Defer onBlur — clicking a toolbar button triggers blur on the editor
  // before the click handler runs. We give the click a tick to register
  // before committing the blur.
  const handleEditorBlur = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => {
      // Skip blur while the user is interacting with floating UI:
      // - toolbar (its own portal)
      // - color picker popup (separate portal)
      // - link input still open
      if (showLinkInput || showColorPicker) return;
      const active = document.activeElement;
      if (toolbarRef.current?.contains(active)) return;
      onBlur();
    }, 150);
  };

  const handleToolbarMouseDown = (e: React.MouseEvent) => {
    // Prevent editor blur when clicking toolbar buttons
    e.preventDefault();
  };

  const applyLink = () => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const href = url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setShowLinkInput(false);
    setLinkUrl("");
  };

  const portalTarget = typeof document !== "undefined" ? document.body : null;

  if (!editor) {
    return (
      <div
        className={className}
        style={style}
        dangerouslySetInnerHTML={{ __html: initialHtml || "" }}
      />
    );
  }

  const toolbarNode = (
    <Toolbar
      ref={toolbarRef}
      onMouseDown={handleToolbarMouseDown}
      style={
        toolbarPos
          ? {
              top: `${toolbarPos.top}px`,
              left: `${toolbarPos.left}px`,
              transform: "translateX(-50%)",
              fontFamily: SYSTEM_FONT,
            }
          : undefined
      }
    >
      {!showLinkInput && (
        <>
          <ButtonGroup>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              $active={editor.isActive("bold")}
              title="Bold"
            >
              <i className="fas fa-bold" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              $active={editor.isActive("italic")}
              title="Italic"
            >
              <i className="fas fa-italic" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              $active={editor.isActive("underline")}
              title="Underline"
            >
              <i className="fas fa-underline" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleStrike().run()}
              $active={editor.isActive("strike")}
              title="Strikethrough"
            >
              <i className="fas fa-strikethrough" />
            </ToolbarButton>
          </ButtonGroup>
          <ButtonGroup>
            <ToolbarButton
              onClick={() => {
                if (editor.isActive("link")) {
                  setLinkUrl(editor.getAttributes("link").href ?? "");
                } else {
                  setLinkUrl("");
                }
                setShowLinkInput(true);
              }}
              $active={editor.isActive("link")}
              title="Link"
            >
              <i className="fa-solid fa-link" />
            </ToolbarButton>
          </ButtonGroup>

          <ColorPickerContainer>
            <button
              ref={colorButtonRef}
              type="button"
              onClick={() => setShowColorPicker(true)}
              title="Text color"
              style={{
                width: 30,
                height: 20,
                borderRadius: 4,
                border: "1px solid #ccc",
                background: editor.getAttributes("textStyle").color || "#000000",
                cursor: "pointer",
                margin: "0 4px",
                padding: 0,
              }}
            />
            {showColorPicker && (
              <ColorPickerPopup
                color={editor.getAttributes("textStyle").color || "rgba(0, 0, 0, 1)"}
                onChange={(c: any) => {
                  const rgba = rgbaToString(c.rgba) || "rgba(0, 0, 0, 1)";
                  editor.chain().focus().setColor(rgba).run();
                }}
                onClose={() => setShowColorPicker(false)}
                anchorEl={colorButtonRef.current}
              />
            )}
            <ToolbarButton
              onClick={() => editor.chain().focus().unsetColor().run()}
              title="Clear color"
            >
              <i className="fas fa-tint-slash" />
            </ToolbarButton>
          </ColorPickerContainer>
        </>
      )}
      {showLinkInput && (
        <ButtonGroup style={{ alignItems: "center", display: "flex", gap: 4 }}>
          <LinkInput
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              } else if (e.key === "Escape") {
                setShowLinkInput(false);
              }
            }}
            style={{ minWidth: 220 }}
          />
          <ToolbarButton onClick={applyLink} title="Apply link">
            <i className="fas fa-check" />
          </ToolbarButton>
          {editor.isActive("link") && (
            <ToolbarButton
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                setShowLinkInput(false);
                setLinkUrl("");
              }}
              title="Remove link"
            >
              <i className="fas fa-unlink" />
            </ToolbarButton>
          )}
          <ToolbarButton onClick={() => setShowLinkInput(false)} title="Cancel">
            <i className="fas fa-times" />
          </ToolbarButton>
        </ButtonGroup>
      )}
    </Toolbar>
  );

  return (
    <>
      {portalTarget && createPortal(toolbarNode, portalTarget)}
      <EditorContent
        editor={editor}
        className={className}
        style={style}
        onBlur={handleEditorBlur}
      />
    </>
  );
};
