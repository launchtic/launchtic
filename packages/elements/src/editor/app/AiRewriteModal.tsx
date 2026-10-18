import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styled, { keyframes } from "styled-components";
import { useEditor } from "@launchtic/editor-core";
import { useEditorContext } from "./EditorContext";
import {
  ModalOverlay,
  ModalContainer,
  CloseButton,
  ErrorContainer,
  ActionButton,
} from "../common/ImageUploadModal.styles";

type Change = { id: string; kind: string; before: string; after: string };
type Preview = {
  pageJson: unknown;
  changes: Change[];
  total: number;
  unchanged: number;
  failed: number;
  mode?: "rewrite" | "edit";  // how the server read the request
};

export const BLUE = "#2196F3";

export async function post<T>(url: string, body: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || json?.message || `Request failed (${res.status})`);
  return json?.data as T;
}

// ─── Suggestions ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
`;

export const Chip = styled.button<{ $active: boolean }>`
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

export const LinkButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  border: none;
  background: none;
  padding: 0;
  font-family: inherit;
  font-size: 12px;
  color: ${BLUE};
  cursor: pointer;
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

// The first one fills a brief outline — the [brackets] are for the user to replace.
const SUGGESTIONS: { label: string; icon: string; text: string }[] = [
  { label: "New offer brief", icon: "fa-solid fa-rocket",
    text: "Offer: [what you sell]\nWho it's for: [audience]\nKey benefits: [2-3 benefits]\nPrice / promo: [e.g. 30% off the first month]\nTone: friendly\nLanguage: English" },
  { label: "Translate…", icon: "fa-solid fa-language", text: "Translate the whole page to " },
  { label: "More persuasive", icon: "fa-solid fa-fire", text: "Make the copy more persuasive and benefit-driven. Keep the same offer." },
  { label: "Shorter", icon: "fa-solid fa-scissors", text: "Make the copy shorter and punchier." },
  { label: "Premium tone", icon: "fa-solid fa-gem", text: "Rewrite in a more premium, high-end tone." },
  { label: "Friendlier", icon: "fa-regular fa-face-smile", text: "Use a warmer, friendlier, more conversational tone." },
  { label: "Fix grammar", icon: "fa-solid fa-spell-check", text: "Fix grammar, spelling and awkward phrasing only. Don't change the meaning." },
];

// ─── Progress while the AI writes ────────────────────────────────────────────

const spin = keyframes`to { transform: rotate(360deg); }`;
const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
`;

export const Spinner = styled.span<{ $size?: number; $light?: boolean }>`
  display: inline-block;
  flex-shrink: 0;
  width: ${({ $size = 14 }) => $size}px;
  height: ${({ $size = 14 }) => $size}px;
  border-radius: 50%;
  border: 2px solid ${({ $light }) => ($light ? "rgba(255,255,255,0.4)" : "rgba(33,150,243,0.25)")};
  border-top-color: ${({ $light }) => ($light ? "#fff" : BLUE)};
  animation: ${spin} 0.8s linear infinite;
`;

const ProgressBox = styled.div`
  border: 1px solid #e3eefb;
  background: #f8fbff;
  border-radius: 12px;
  padding: 16px 18px;
  margin-top: 14px;
`;

const ShimmerBar = styled.div`
  height: 4px;
  border-radius: 4px;
  margin-bottom: 14px;
  background: linear-gradient(90deg, #dbeafe 0%, ${BLUE} 50%, #dbeafe 100%);
  background-size: 200% 100%;
  animation: ${shimmer} 1.6s linear infinite;
`;

const StageRow = styled.div<{ $state: "done" | "active" | "pending" }>`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  padding: 4px 0;
  animation: ${fadeIn} 0.3s ease;
  color: ${({ $state }) => ($state === "pending" ? "#bbb" : $state === "active" ? "#111" : "#4a4a4a")};
  font-weight: ${({ $state }) => ($state === "active" ? 600 : 400)};
`;

const STAGE_MS = 1700;

// Index of the stage to show while the AI works: advances on a timer, then
// holds on the last stage until the request returns.
export function useStageIndex(active: boolean, count: number): number {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) { setIndex(0); return; }
    const t = setInterval(() => setIndex((i) => Math.min(i + 1, count - 1)), STAGE_MS);
    return () => clearInterval(t);
  }, [active, count]);
  return index;
}

const pageStages = (total: number | null) => [
  "Reading your page",
  total !== null ? `Collecting ${total} text fields` : "Collecting text fields",
  "Understanding your request",
  "Analyzing customer insights",
  "Drafting headlines & hooks",
  "Writing benefits & calls-to-action",
  "Polishing tone, keeping prices & numbers",
  "Checking formatting stays intact",
];

// Compact: the shimmer bar + only the current stage.
export const AiProgress: React.FC<{ stages: string[]; index: number }> = ({ stages, index }) => (
  <ProgressBox>
    <ShimmerBar />
    <StageRow $state="active">
      <Spinner />
      {stages[index]}…
    </StageRow>
  </ProgressBox>
);

// ─── Modal ───────────────────────────────────────────────────────────────────

// One box for both kinds of request — a brief for a new offer, or an edit
// ("translate", "shorter"…). The server decides which (mode "auto").
// Preview first (nothing saved), then the result replaces this page.
export const AiRewriteModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { query, actions } = useEditor();
  const { pageData, updatePage } = useEditorContext();
  const stepId = pageData.code;

  const [total, setTotal] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stages = pageStages(total);
  const index = useStageIndex(loading, stages.length);

  useEffect(() => {
    post<{ total: number }>(`/api/funnel-steps/${stepId}/ai-rewrite`, { mode: "scan", pageJson: query.serialize() })
      .then((r) => setTotal(r.total))
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  const pickSuggestion = (value: string) => {
    setText(value);
    // Select the first [placeholder] to type over, else put the caret at the end.
    requestAnimationFrame(() => {
      const el = textRef.current;
      if (!el) return;
      el.focus();
      const start = value.indexOf("[");
      const end = start >= 0 ? value.indexOf("]", start) + 1 : value.length;
      el.setSelectionRange(start >= 0 ? start : value.length, end);
    });
  };

  const generate = async () => {
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      setPreview(await post<Preview>(`/api/funnel-steps/${stepId}/ai-rewrite`, {
        mode: "auto",
        request: text,
        pageJson: query.serialize(),
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!preview) return;
    setApplying(true);
    setError(null);
    try {
      const json = JSON.stringify(preview.pageJson);
      actions.deserialize(json);
      await updatePage(json);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setApplying(false);
    }
  };

  const busy = loading || applying;
  const count = preview?.changes.length ?? 0;

  // Portal out of the editor header, which sets a light text colour for its dark bar.
  // zIndex sits above the canvas chrome (text toolbar 1500, element Indicator 9999).
  return createPortal(
    <ModalOverlay style={{ zIndex: 100000 }}>
      <ModalContainer style={{ color: "#222", fontSize: 14 }}>
        <CloseButton onClick={onClose} disabled={applying}>✖</CloseButton>
        <h3 style={{ margin: "0 0 16px", fontSize: 18 }}>
          <i className="fa-solid fa-wand-magic-sparkles" style={{ color: BLUE, marginRight: 8 }} />
          Rewrite copy with AI
        </h3>

        <div style={{ overflowY: "auto", flex: 1, paddingRight: 2 }}>
            <textarea
              ref={textRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              maxLength={2000}
              disabled={busy}
              autoFocus
              placeholder={`Describe a new offer, or say what to change — e.g. "Online yoga course for busy professionals, 30% off", "Translate to Spanish", "Make it more persuasive".`}
              style={{ width: "100%", boxSizing: "border-box", padding: 12, border: "1px solid #ddd", borderRadius: 10, fontSize: 14, fontFamily: "inherit", resize: "vertical", color: "#222", background: "#fff" }}
            />

            <LinkButton type="button" disabled={busy} onClick={() => setShowSuggestions((s) => !s)}>
              <i className="fa-regular fa-lightbulb" />
              {showSuggestions ? "Hide suggestions" : "Suggestions"}
            </LinkButton>
            {showSuggestions && (
              <ChipRow>
                {SUGGESTIONS.map((s) => (
                  <Chip key={s.label} type="button" $active={text === s.text} disabled={busy} onClick={() => pickSuggestion(s.text)}>
                    <i className={s.icon} /> {s.label}
                  </Chip>
                ))}
              </ChipRow>
            )}

            {error && <div style={{ marginTop: 14 }}><ErrorContainer>{error}</ErrorContainer></div>}
            {loading && <AiProgress stages={stages} index={index} />}

            {preview && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>
                  <strong style={{ color: BLUE }}>{count}</strong> of {preview.total} texts will change
                  {preview.mode && <span style={{ color: "#999" }}> · {preview.mode === "rewrite" ? "written for a new offer" : "current copy edited"}</span>}
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

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 16 }}>
            <ActionButton
              onClick={generate}
              disabled={busy || !text.trim() || total === 0}
              style={preview
                ? { background: "#fff", color: "#333", border: "1px solid #ddd", display: "inline-flex", alignItems: "center", gap: 8 }
                : { display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              {loading && <Spinner $size={13} $light={!preview} />}
              {loading ? `${stages[index]}…` : preview ? "Regenerate" : "Generate preview"}
            </ActionButton>
            {preview && count > 0 && (
              <ActionButton onClick={apply} disabled={busy} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {applying && <Spinner $size={13} $light />}
                {applying ? "Applying…" : `Apply ${count} change${count !== 1 ? "s" : ""}`}
              </ActionButton>
            )}
        </div>
      </ModalContainer>
    </ModalOverlay>,
    document.body,
  );
};

export default AiRewriteModal;
