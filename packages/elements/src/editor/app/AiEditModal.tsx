import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor } from "@launchtic/editor-core";
import { useEditorContext } from "./EditorContext";
import { ModalOverlay, ModalContainer, CloseButton, ErrorContainer, ActionButton } from "../common/ImageUploadModal.styles";
import { AiProgress, BLUE, Chip, ChipRow, LinkButton, Spinner, post, useStageIndex } from "./AiRewriteModal";

type Change = { id: string; kind: string; before: string; after: string };
type Preview = { updates: Record<string, any>; changes: Change[]; total: number; unchanged: number; failed: number };

// Opened from the ✨ button on a Section/Row/element toolbar (see Indicator).
export const AI_EDIT_EVENT = "launchtic:ai-edit";
export type AiEditTarget = { nodeId: string; name: string };

const SUGGESTIONS: { label: string; icon: string; text: string }[] = [
  { label: "More compelling", icon: "fa-solid fa-fire", text: "Make this copy more compelling and persuasive." },
  { label: "Shorter", icon: "fa-solid fa-scissors", text: "Make the text shorter and punchier." },
  { label: "More formal", icon: "fa-solid fa-user-tie", text: "Use a more formal, professional tone." },
  { label: "Friendlier", icon: "fa-regular fa-face-smile", text: "Use a warmer, friendlier tone." },
  // Ends open so the user types the target language.
  { label: "Translate…", icon: "fa-solid fa-language", text: "Translate to " },
];

export const AiEditModal: React.FC<{ target: AiEditTarget; onClose: () => void }> = ({ target, onClose }) => {
  const { query, actions } = useEditor();
  const { pageData } = useEditorContext();
  const stepId = pageData.code;
  const label = target.name.toLowerCase();

  const [total, setTotal] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stages = [
    `Reading this ${label}`,
    "Understanding your request",
    total !== null ? `Editing ${total} text field${total !== 1 ? "s" : ""}` : "Editing text",
    "Keeping layout & formatting",
    "Checking numbers & prices",
  ];
  const index = useStageIndex(loading, stages.length);

  useEffect(() => {
    post<{ total: number }>(`/api/funnel-steps/${stepId}/ai-rewrite`, {
      mode: "scan",
      pageJson: query.serialize(),
      scopeNodeId: target.nodeId,
    })
      .then((r) => setTotal(r.total))
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId, target.nodeId]);

  const pickSuggestion = (value: string) => {
    setText(value);
    // Caret at the end so an open-ended suggestion ("Translate to ") can be finished.
    requestAnimationFrame(() => {
      const el = textRef.current;
      if (el) { el.focus(); el.setSelectionRange(value.length, value.length); }
    });
  };

  const generate = async () => {
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      setPreview(await post<Preview>(`/api/funnel-steps/${stepId}/ai-rewrite`, {
        mode: "edit",
        pageJson: query.serialize(),
        scopeNodeId: target.nodeId,
        instruction: text,
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Text-only prop updates per node, applied in place — undoable with Ctrl+Z.
  const apply = () => {
    if (!preview) return;
    for (const [nodeId, props] of Object.entries(preview.updates)) {
      actions.setProp(nodeId, (p: any) => { Object.assign(p, props); });
    }
    onClose();
  };

  const count = preview?.changes.length ?? 0;
  const empty = total === 0;

  return createPortal(
    <ModalOverlay style={{ zIndex: 100000 }}>
      <ModalContainer style={{ color: "#222", fontSize: 14, width: 640 }}>
        <CloseButton onClick={onClose}>✖</CloseButton>
        <h3 style={{ margin: "0 0 16px", fontSize: 18 }}>
          <i className="fa-solid fa-wand-magic-sparkles" style={{ color: BLUE, marginRight: 8 }} />
          Edit this {label} with AI
        </h3>

        <div style={{ overflowY: "auto", flex: 1, paddingRight: 2 }}>
          {empty ? (
            <p style={{ margin: 0, fontSize: 13, color: "#888" }}>This {label} has no text to edit.</p>
          ) : (
            <>
              <textarea
                ref={textRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                maxLength={2000}
                disabled={loading}
                autoFocus
                placeholder={`What should change? E.g. "Make the headline about saving time", "Shorter", "Translate to French".`}
                style={{ width: "100%", boxSizing: "border-box", padding: 12, border: "1px solid #ddd", borderRadius: 10, fontSize: 14, fontFamily: "inherit", resize: "vertical", color: "#222", background: "#fff" }}
              />
              <LinkButton type="button" disabled={loading} onClick={() => setShowSuggestions((s) => !s)}>
                <i className="fa-regular fa-lightbulb" />
                {showSuggestions ? "Hide suggestions" : "Suggestions"}
              </LinkButton>
              {showSuggestions && (
                <ChipRow>
                  {SUGGESTIONS.map((s) => (
                    <Chip key={s.label} type="button" $active={text === s.text} disabled={loading} onClick={() => pickSuggestion(s.text)}>
                      <i className={s.icon} /> {s.label}
                    </Chip>
                  ))}
                </ChipRow>
              )}
            </>
          )}

          {error && <div style={{ marginTop: 14 }}><ErrorContainer>{error}</ErrorContainer></div>}
          {loading && <AiProgress stages={stages} index={index} />}

          {preview && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>
                <strong style={{ color: BLUE }}>{count}</strong> of {preview.total} texts will change
                {preview.failed > 0 && <span style={{ color: "#f44336" }}> · {preview.failed} failed</span>}
              </div>
              <div style={{ border: "1px solid #eee", borderRadius: 10 }}>
                {preview.changes.map((c) => (
                  <div key={c.id} style={{ padding: "10px 14px", borderBottom: "1px solid #f3f3f3", fontSize: 13 }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#aaa", marginBottom: 2 }}>{c.kind}</div>
                    <div style={{ color: "#aaa", textDecoration: "line-through" }}>{c.before}</div>
                    <div style={{ color: "#111" }}>{c.after}</div>
                  </div>
                ))}
                {count === 0 && <div style={{ padding: 20, textAlign: "center", color: "#888", fontSize: 13 }}>No text was changed.</div>}
              </div>
            </div>
          )}
        </div>

        {!empty && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
            <ActionButton
              onClick={generate}
              disabled={loading || !text.trim() || !total}
              style={preview
                ? { background: "#fff", color: "#333", border: "1px solid #ddd", display: "inline-flex", alignItems: "center", gap: 8 }
                : { display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              {loading && <Spinner $size={13} $light={!preview} />}
              {loading ? `${stages[index]}…` : preview ? "Regenerate" : "Generate preview"}
            </ActionButton>
            {preview && count > 0 && (
              <ActionButton onClick={apply} disabled={loading}>
                Apply {count} change{count !== 1 ? "s" : ""}
              </ActionButton>
            )}
          </div>
        )}
      </ModalContainer>
    </ModalOverlay>,
    document.body,
  );
};

export default AiEditModal;
