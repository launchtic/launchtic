import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";
import { useEditor } from "@launchtic/editor-core";
import { useEditorContext } from "./EditorContext";
import { ModalOverlay, ModalContainer, CloseButton, ErrorContainer, ActionButton } from "../common/ImageUploadModal.styles";
import { AiProgress, BLUE, SectionLabel, Spinner, Stat, post, useStageIndex } from "./AiRewriteModal";

type Change = { id: string; kind: string; before: string; after: string };
type Preview = { updates: Record<string, any>; changes: Change[]; total: number; unchanged: number; failed: number };

// Opened from the ✨ button on a Section/Row/element toolbar (see Indicator).
export const AI_EDIT_EVENT = "launchtic:ai-edit";
export type AiEditTarget = { nodeId: string; name: string };

const QUICK_ACTIONS: { label: string; icon: string; instruction: string }[] = [
  { label: "More compelling", icon: "fa-solid fa-fire", instruction: "Make this copy more compelling and persuasive." },
  { label: "Shorter", icon: "fa-solid fa-scissors", instruction: "Make the text shorter and punchier." },
  { label: "More formal", icon: "fa-solid fa-user-tie", instruction: "Use a more formal, professional tone." },
  { label: "Friendlier", icon: "fa-regular fa-face-smile", instruction: "Use a warmer, friendlier tone." },
  // Ends open so the user types the target language.
  { label: "Translate…", icon: "fa-solid fa-language", instruction: "Translate to " },
];

const Chip = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid ${({ $active }) => ($active ? BLUE : "#ddd")};
  background: ${({ $active }) => ($active ? "#f0f7ff" : "#fff")};
  color: ${({ $active }) => ($active ? BLUE : "#444")};
  &:hover:not(:disabled) { border-color: ${BLUE}; color: ${BLUE}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

export const AiEditModal: React.FC<{ target: AiEditTarget; onClose: () => void }> = ({ target, onClose }) => {
  const { query, actions } = useEditor();
  const { pageData } = useEditorContext();
  const stepId = pageData.code;
  const label = target.name.toLowerCase();

  const [total, setTotal] = useState<number | null>(null);
  const [instruction, setInstruction] = useState("");
  const instructionRef = useRef<HTMLTextAreaElement>(null);

  const pickQuickAction = (text: string) => {
    setInstruction(text);
    // Caret at the end so an open-ended action ("Translate to ") can be finished.
    requestAnimationFrame(() => {
      const el = instructionRef.current;
      if (el) { el.focus(); el.setSelectionRange(text.length, text.length); }
    });
  };
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

  const generate = async () => {
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      setPreview(await post<Preview>(`/api/funnel-steps/${stepId}/ai-rewrite`, {
        mode: "edit",
        pageJson: query.serialize(),
        scopeNodeId: target.nodeId,
        instruction,
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

  return createPortal(
    <ModalOverlay style={{ zIndex: 100000 }}>
      <ModalContainer style={{ color: "#222", fontSize: 14, width: 640 }}>
        <CloseButton onClick={onClose}>✖</CloseButton>
        <h3 style={{ margin: "0 0 4px", fontSize: 18 }}>
          <i className="fa-solid fa-wand-magic-sparkles" style={{ color: BLUE, marginRight: 8 }} />
          Edit this {label} with AI
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#888" }}>
          {total === null
            ? "Scanning…"
            : total === 0
              ? `This ${label} has no text to edit.`
              : `${total} text field${total !== 1 ? "s" : ""} in this ${label}. Only the text changes — layout and styles stay the same.`}
        </p>

        <div style={{ overflowY: "auto", flex: 1, paddingRight: 2 }}>
          <SectionLabel>Quick actions</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {QUICK_ACTIONS.map((a) => (
              <Chip key={a.label} type="button" $active={instruction === a.instruction} disabled={loading} onClick={() => pickQuickAction(a.instruction)}>
                <i className={a.icon} /> {a.label}
              </Chip>
            ))}
          </div>

          <SectionLabel>What should change?</SectionLabel>
          <textarea
            ref={instructionRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={3}
            maxLength={2000}
            disabled={loading}
            placeholder={`E.g. "Make the headline about saving time", "Change the price to $49", "Translate to French"`}
            style={{ width: "100%", boxSizing: "border-box", padding: 10, border: "1px solid #ddd", borderRadius: 8, fontSize: 13, fontFamily: "inherit", resize: "vertical", color: "#222", background: "#fff", marginBottom: 14 }}
          />

          {error && <ErrorContainer>{error}</ErrorContainer>}
          {loading && <AiProgress stages={stages} index={index} />}

          {preview && (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <Stat label="Text fields" value={preview.total} />
                <Stat label="Will change" value={count} color={BLUE} />
                <Stat label="Unchanged" value={preview.unchanged} color="#888" />
                <Stat label="Failed" value={preview.failed} color={preview.failed ? "#f44336" : "#888"} />
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
            </>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <ActionButton
            onClick={generate}
            disabled={loading || !instruction.trim() || !total}
            style={{ background: "#fff", color: "#333", border: "1px solid #ddd", display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            {loading && <Spinner $size={13} />}
            {loading ? `${stages[index]}…` : preview ? "Regenerate" : "Generate preview"}
          </ActionButton>
          {preview && count > 0 && (
            <ActionButton onClick={apply} disabled={loading}>
              Apply {count} change{count !== 1 ? "s" : ""}
            </ActionButton>
          )}
        </div>
      </ModalContainer>
    </ModalOverlay>,
    document.body,
  );
};

export default AiEditModal;
