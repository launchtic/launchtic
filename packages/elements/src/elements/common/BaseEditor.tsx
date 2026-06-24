import React, { useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent, Editor, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Color from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';
import { rgbaToString } from "../../utils/helpers";
import { useNode, useEditor as useCraftEditor } from "@launchtic/editor-core";

import {
  EditorContainer,
  Toolbar,
  ToolbarButton,
  ButtonGroup,
  LinkInput,
  ColorPickerContainer,
} from '../../editor/common/ElementToolBarUI';
import { ColorPickerPopup } from '../../editor/common/settings/ColorPickerPopup';

export const htmlToJson = (html: string): { html: string } => {
  return { html };
};

export const jsonToHtml = (json: { html?: string } | null): string => {
  return json?.html || '';
};


export interface BaseEditorProps {
  rawContentState?: string;
  defaultContent: string;
  displayName: string;
  additionalExtensions?: Extension[];
  renderToolbarCustomButtons?: (editor: Editor | null, setProp: any) => ReactNode;
  onCreate?: (editor: Editor, setProp: any) => void;
  onUpdate?: (editor: Editor, setProp: any) => void;
}

// Thin wrapper. A rich-text element is interactive ONLY while it's the selected
// node; the rest of the time it's static HTML. So we mount the heavy TipTap
// editor (LiveEditor) ONLY for the selected element and render plain HTML for
// every other one. Previously every element created a TipTap instance on mount,
// so a page with N text blocks span up N ProseMirror editors → slow load + high
// memory. Now it's 0–1.
const BaseEditor: React.FC<BaseEditorProps> = (props) => {
  const { rawContentState, defaultContent } = props;
  const { actions: { setProp }, id } = useNode((node) => ({ id: node.id }));

  // Subscribe ONLY to whether this node is selected (+ enabled) — not to the
  // global selection — so selecting another element doesn't re-render this one.
  const { craftIsActive, enabled } = useCraftEditor((state, query) => ({
    craftIsActive: query.getEvent("selected").first() === id,
    enabled: state.options.enabled,
  }));

  const initialContent = rawContentState
    ? jsonToHtml(JSON.parse(rawContentState))
    : defaultContent;

  if (!craftIsActive || !enabled) {
    return <div dangerouslySetInnerHTML={{ __html: initialContent }} />;
  }

  return <LiveEditor {...props} setProp={setProp} initialContent={initialContent} />;
};

// The actual TipTap editor + floating toolbar. Mounted only for the selected
// element, so all the per-editor cost (ProseMirror view, plugins, listeners)
// exists for at most one element at a time.
const LiveEditor: React.FC<BaseEditorProps & { setProp: (cb: (props: any) => void) => void; initialContent: string }> = ({
  additionalExtensions = [],
  renderToolbarCustomButtons,
  onCreate,
  setProp,
  initialContent,
}) => {
  const [showLinkSettings, setShowLinkSettings] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [openInNewTab, setOpenInNewTab] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorButtonRef = useRef<HTMLButtonElement>(null);

  // Toolbar floats above (or below if no room) the element being edited.
  const [toolbarPos, setToolbarPos] = useState<{
    top: number;
    left: number;
    placement: "top" | "bottom";
  } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: null,
        },
      }),
      TextStyle,
      Color,
      ...additionalExtensions,
    ],
    content: initialContent,
    immediatelyRender: false,
    // Mounted on select → focus immediately so a single click lets you type
    // (the click landed on the static HTML that this editor just replaced).
    autofocus: 'end',
    editorProps: {
      // Strict plain-text paste: discard ALL formatting from external
      // sources (Google Docs, Word, websites) so page design wins.
      handlePaste(view, event) {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!text) return false; // let TipTap handle non-text (images, files)
        event.preventDefault();
        view.dispatch(view.state.tr.insertText(text));
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const json = JSON.stringify(htmlToJson(html));
      setProp((props: any) => {
        props.rawContentState = json;
      });
    },
    onCreate: ({ editor }) => {
      if (onCreate) {
        onCreate(editor, setProp);
      }
    },
  });

  const checkIsActive = useCallback((type: string, options = {}) => {
    if (!editor) return false;
    return editor.isActive(type, options);
  }, [editor]);

  // Track the element's position so the floating toolbar follows it. We measure
  // the editor's root DOM (`editor.view.dom`) — TipTap mounts its own
  // contenteditable inside.
  useEffect(() => {
    if (!editor) {
      setToolbarPos(null);
      return;
    }

    const recalc = () => {
      const el = editor.view?.dom as HTMLElement | undefined;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const toolbarHeight = toolbarRef.current?.offsetHeight ?? 44;
      const toolbarWidth  = toolbarRef.current?.offsetWidth  ?? 360;
      const gap = 8;
      const safeMargin = 8;
      const indicatorClearance = 32;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const spaceAbove = rect.top - safeMargin;
      const spaceBelow = vh - rect.bottom - safeMargin;
      const neededAbove = toolbarHeight + gap + indicatorClearance;
      const neededBelow = toolbarHeight + gap;

      let placement: "top" | "bottom";
      if (spaceAbove >= neededAbove) {
        placement = "top";
      } else if (spaceBelow >= neededBelow) {
        placement = "bottom";
      } else {
        placement = spaceAbove >= spaceBelow ? "top" : "bottom";
      }

      let top = placement === "top"
        ? rect.top - toolbarHeight - gap - indicatorClearance
        : rect.bottom + gap;
      top = Math.max(safeMargin, Math.min(top, vh - toolbarHeight - safeMargin));

      const halfW = toolbarWidth / 2;
      const minLeft = safeMargin + halfW;
      const maxLeft = vw - safeMargin - halfW;
      const elementCenter = rect.left + rect.width / 2;
      const left = Math.max(minLeft, Math.min(elementCenter, maxLeft));

      setToolbarPos({
        top: Math.round(top),
        left: Math.round(left),
        placement,
      });
    };

    recalc();

    window.addEventListener("scroll", recalc, true);
    window.addEventListener("resize", recalc);

    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(recalc)
      : null;
    if (ro && editor.view?.dom) ro.observe(editor.view.dom);

    return () => {
      window.removeEventListener("scroll", recalc, true);
      window.removeEventListener("resize", recalc);
      ro?.disconnect();
    };
  }, [editor, showLinkSettings]);

  useEffect(() => {
    if (!editor) return;

    const handleSelectionUpdate = () => {
      if (editor.isActive('link')) {
        const linkAttrs = editor.getAttributes('link');
        const currentLinkUrl = linkAttrs.href || '';
        const currentOpenInNewTab = linkAttrs.target === '_blank';

        if (!showLinkSettings || linkUrl !== currentLinkUrl) {
          setLinkUrl(currentLinkUrl);
          setOpenInNewTab(currentOpenInNewTab);

          if (!showLinkSettings) {
            setShowLinkSettings(true);
          }
        }
      } else if (showLinkSettings) {
        setShowLinkSettings(false);
        setLinkUrl('');
      }
    };

    editor.on('selectionUpdate', handleSelectionUpdate);

    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor, showLinkSettings, linkUrl]);

  useEffect(() => {
    if (showLinkSettings && editor) {
      const linkAttrs = editor.getAttributes('link');
      const originalUrl = linkAttrs.href || '';
      const originalOpenInNewTab = linkAttrs.target === '_blank';

      const urlChanged = linkUrl !== originalUrl;
      const openInNewTabChanged = openInNewTab !== originalOpenInNewTab;

      setHasUnsavedChanges(urlChanged || openInNewTabChanged);
    } else {
      setHasUnsavedChanges(false);
    }
  }, [linkUrl, openInNewTab, showLinkSettings, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;

    if (linkUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setShowLinkSettings(false);
      return;
    }

    const url = linkUrl.trim();
    const urlWithProtocol = url.startsWith('http://') || url.startsWith('https://')
      ? url
      : `https://${url}`;

    editor.chain().focus().extendMarkRange('link').setLink({
      href: urlWithProtocol,
      target: openInNewTab ? '_blank' : null,
    }).run();

    setShowLinkSettings(false);
    setLinkUrl('');
  }, [editor, linkUrl, openInNewTab]);

  const removeLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setShowLinkSettings(false);
    setLinkUrl('');
  }, [editor]);

  const toggleLinkSettings = useCallback(() => {
    setShowLinkSettings(!showLinkSettings);

    if (!showLinkSettings && editor && editor.isActive('link')) {
      const linkAttrs = editor.getAttributes('link');
      setLinkUrl(linkAttrs.href || '');
      setOpenInNewTab(linkAttrs.target === '_blank');
    } else if (!showLinkSettings) {
      setLinkUrl('');
      setOpenInNewTab(false);
    }
  }, [showLinkSettings, editor]);

  const handleColorChange = (colorObj: any) => {
    const rgba = rgbaToString(colorObj.rgba) || "rgba(0, 0, 0, 1)";
    editor?.chain().focus().setColor(rgba).run();
  };

  // While TipTap initializes (immediatelyRender:false), keep showing the static
  // HTML so there's no flash of empty content.
  if (!editor) {
    return <div dangerouslySetInnerHTML={{ __html: initialContent }} />;
  }

  let colorValue = editor.getAttributes('textStyle').color;

  // Render the toolbar via portal to <body> so it never overlaps neighbouring
  // content and stays pinned in the viewport.
  const toolbarPortalTarget = typeof document !== "undefined" ? document.body : null;

  const toolbarNode = (
    <Toolbar
      ref={toolbarRef}
      style={
        toolbarPos
          ? {
              top: `${toolbarPos.top}px`,
              left: `${toolbarPos.left}px`,
              transform: "translateX(-50%)",
            }
          : undefined
      }
    >
      {!showLinkSettings && (
          <>
            {renderToolbarCustomButtons && renderToolbarCustomButtons(editor, setProp)}

            <ButtonGroup>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                $active={checkIsActive('bold')}
                title="Bold"
              >
                <i className="fas fa-bold"></i>
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                $active={checkIsActive('italic')}
                title="Italic"
              >
                <i className="fas fa-italic"></i>
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                $active={checkIsActive('underline')}
                title="Underline"
              >
                <i className="fas fa-underline"></i>
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleStrike().run()}
                $active={checkIsActive('strike')}
                title="Strikethrough"
              >
                <i className="fas fa-strikethrough"></i>
              </ToolbarButton>
            </ButtonGroup>

            <ButtonGroup>
              <ToolbarButton
                onClick={toggleLinkSettings}
                $active={checkIsActive('link')}
              >
                <i className="fa-solid fa-link"></i>
              </ToolbarButton>
            </ButtonGroup>

            <ColorPickerContainer>
              <button
                ref={colorButtonRef}
                style={{
                  width: 30,
                  height: 20,
                  borderRadius: 4,
                  border: '1px solid #ccc',
                  background: colorValue,
                  cursor: 'pointer',
                  margin: '0 4px',
                }}
                onClick={() => setShowColorPicker(true)}
                type="button"
              />
              {showColorPicker && (
                <ColorPickerPopup
                  color={colorValue}
                  onChange={handleColorChange}
                  onClose={() => setShowColorPicker(false)}
                  anchorEl={colorButtonRef.current}
                />
              )}
              <ToolbarButton
                onClick={() => editor.chain().focus().unsetColor().run()}
                title="Clear color"
              >
                <i className="fas fa-tint-slash"></i>
              </ToolbarButton>
            </ColorPickerContainer>
          </>
        )}

        {showLinkSettings && (
          <ButtonGroup style={{
              alignItems: 'center',
              width: '100%',
              flexWrap: 'wrap',
              justifyContent: 'flex-start'
            }}>
            <div style={{
              display: 'flex',
              minWidth: '180px',
              maxWidth: '100%',
              width: '50%',
              marginRight: '8px',
              marginBottom: '4px'
            }}>
              <LinkInput
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="Enter URL"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setLink();
                  } else if (e.key === 'Escape') {
                    setShowLinkSettings(false);
                    setLinkUrl('');
                  }
                }}
                style={{
                  width: '100%',
                  minWidth: '100px',
                  maxWidth: '100%'
                }}
              />
              <ToolbarButton
                onClick={setLink}
                title="Save link"
                style={{ position: 'relative' }}
              >
                <i className="fas fa-save"></i>
                {hasUnsavedChanges && (
                  <span style={{
                    position: 'absolute',
                    top: '2px',
                    right: '2px',
                    width: '8px',
                    height: '8px',
                    backgroundColor: 'red',
                    borderRadius: '50%',
                  }}></span>
                )}
              </ToolbarButton>
              {editor.isActive('link') && (
                <ToolbarButton onClick={removeLink} title="Remove link" style={{ marginRight: '4px' }}>
                  <i className="fas fa-unlink"></i>
                </ToolbarButton>
              )}
              <ToolbarButton
                onClick={() => setOpenInNewTab(!openInNewTab)}
                $active={openInNewTab}
                title="Open in new tab"
                style={{ marginRight: '4px' }}
              >
                <i className="fas fa-external-link-alt"></i>
              </ToolbarButton>

              <ToolbarButton
                onClick={() => {
                  setShowLinkSettings(false);
                  setLinkUrl('');
                }}
                title="Cancel"
              >
                <i className="fas fa-times"></i>
              </ToolbarButton>
            </div>
          </ButtonGroup>
        )}
    </Toolbar>
  );

  return (
    <EditorContainer>
      {toolbarPortalTarget && createPortal(toolbarNode, toolbarPortalTarget)}
      <EditorContent
        editor={editor}
        onClick={(e) => {
          if (e.target instanceof HTMLAnchorElement) {
            e.preventDefault();
          }
        }}
      />
    </EditorContainer>
  );
};

export default BaseEditor;
