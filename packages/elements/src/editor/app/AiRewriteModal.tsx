import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styled, { css, keyframes } from "styled-components";
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
type Preview = { pageJson: unknown; changes: Change[]; total: number; unchanged: number; failed: number };
type Target = "replace" | "new";

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

// ─── Target option cards ─────────────────────────────────────────────────────

const OptionGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
`;

const OptionCard = styled.button<{ $selected: boolean }>`
  position: relative;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  text-align: left;
  padding: 14px;
  border-radius: 12px;
  font-family: inherit;
  color: #222;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
  border: 2px solid ${({ $selected }) => ($selected ? BLUE : "#e6e6e6")};
  background: ${({ $selected }) => ($selected ? "#f0f7ff" : "#fff")};
  ${({ $selected }) => $selected && css`box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.12);`}

  &:hover:not(:disabled) { border-color: ${BLUE}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const OptionIcon = styled.div<{ $selected: boolean }>`
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  color: ${({ $selected }) => ($selected ? "#fff" : "#666")};
  background: ${({ $selected }) => ($selected ? BLUE : "#f2f2f2")};
`;

const OptionCheck = styled.div<{ $selected: boolean }>`
  position: absolute;
  top: 10px;
  right: 10px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid ${({ $selected }) => ($selected ? BLUE : "#ccc")};
  background: ${({ $selected }) => ($selected ? BLUE : "#fff")};
  color: #fff;
  font-size: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Badge = styled.span`
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  color: ${BLUE};
  background: rgba(33, 150, 243, 0.12);
`;

const TargetOption: React.FC<{
  selected: boolean;
  disabled: boolean;
  icon: string;
  title: string;
  description: string;
  badge?: string;
  onSelect: () => void;
}> = ({ selected, disabled, icon, title, description, badge, onSelect }) => (
  <OptionCard type="button" role="radio" aria-checked={selected} $selected={selected} disabled={disabled} onClick={onSelect}>
    <OptionIcon $selected={selected}><i className={icon} /></OptionIcon>
    <div style={{ paddingRight: 18 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>
        {title}
        {badge && <Badge>{badge}</Badge>}
      </div>
      <div style={{ fontSize: 12, color: "#777", lineHeight: 1.45 }}>{description}</div>
    </div>
    <OptionCheck $selected={selected}>{selected && <i className="fa-solid fa-check" />}</OptionCheck>
  </OptionCard>
);

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
  margin-bottom: 14px;
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
  "Understanding your brief",
  "Analyzing customer insights",
  "Drafting headlines & hooks",
  "Writing benefits & calls-to-action",
  "Polishing tone, keeping prices & numbers",
  "Checking formatting stays intact",
];

export const AiProgress: React.FC<{ stages: string[]; index: number }> = ({ stages, index }) => (
  <ProgressBox>
    <ShimmerBar />
    {stages.slice(0, index + 1).map((label, i) => {
      const state = i < index ? "done" : "active";
      return (
        <StageRow key={label} $state={state}>
          {state === "done"
            ? <i className="fa-solid fa-circle-check" style={{ color: "#22a06b", width: 14 }} />
            : <Spinner />}
          {label}{state === "active" && "…"}
        </StageRow>
      );
    })}
  </ProgressBox>
);

// ─── Modal ───────────────────────────────────────────────────────────────────

export const Stat: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color = "#111" }) => (
  <div style={{ flex: 1, padding: "10px 12px", border: "1px solid #eee", borderRadius: 10 }}>
    <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    <div style={{ fontSize: 12, color: "#888" }}>{label}</div>
  </div>
);

export const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{children}</label>
);

// Brief → preview (nothing saved) → new step (default) or replace this page.
// Only text changes; layout and styles are untouched (see ai-rewrite.ts).
export const AiRewriteModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { query, actions } = useEditor();
  const { pageData, updatePage } = useEditorContext();
  const stepId = pageData.code;

  const [total, setTotal] = useState<number | null>(null);
  const [brief, setBrief] = useState("");
  const [target, setTarget] = useState<Target>("new");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newStepUrl, setNewStepUrl] = useState<string | null>(null);
  const stages = pageStages(total);
  const index = useStageIndex(loading, stages.length);

  useEffect(() => {
    post<{ total: number }>(`/api/funnel-steps/${stepId}/ai-rewrite`, { mode: "scan", pageJson: query.serialize() })
      .then((r) => setTotal(r.total))
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      setPreview(await post<Preview>(`/api/funnel-steps/${stepId}/ai-rewrite`, {
        mode: "rewrite",
        brief,
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
      if (target === "replace") {
        actions.deserialize(json);
        await updatePage(json);
        onClose();
        return;
      }
      const created = await post<{ id: string; name: string }>(`/api/funnel-steps/${stepId}/clone`, {});
      await post(`/api/funnel-steps/${created.id}`, { pageJson: json }, "PATCH");
      setNewStepUrl(window.location.pathname.replace(/\/editor\/[^/]+$/, `/editor/${created.id}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
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
        <h3 style={{ margin: "0 0 4px", fontSize: 18 }}>
          <i className="fa-solid fa-wand-magic-sparkles" style={{ color: BLUE, marginRight: 8 }} />
          Rewrite copy with AI
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#888" }}>
          {total === null
            ? "Scanning page…"
            : `${total} text field${total !== 1 ? "s" : ""} found on this page. Only the text changes — layout, styles and images stay the same.`}
        </p>

        {newStepUrl ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <i className="fa-solid fa-circle-check" style={{ fontSize: 36, color: "#22a06b", marginBottom: 12 }} />
            <p style={{ fontSize: 15, margin: "0 0 16px" }}>New step created with the rewritten copy.</p>
            <ActionButton onClick={() => { window.location.href = newStepUrl; }}>Open new step</ActionButton>
            <button onClick={onClose} style={{ marginLeft: 10, background: "none", border: "none", color: "#666", cursor: "pointer" }}>
              Stay here
            </button>
          </div>
        ) : (
          <div style={{ overflowY: "auto", flex: 1, paddingRight: 2 }}>
            <SectionLabel>Brief</SectionLabel>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={4}
              maxLength={2000}
              disabled={busy}
              placeholder="What you sell, who it's for, the offer, tone and language. E.g. Online yoga course for busy professionals, 30% off the first month, friendly tone, English."
              style={{ width: "100%", boxSizing: "border-box", padding: 10, border: "1px solid #ddd", borderRadius: 8, fontSize: 13, fontFamily: "inherit", resize: "vertical", color: "#222", background: "#fff" }}
            />
            <p style={{ margin: "4px 0 16px", fontSize: 12, color: "#999" }}>
              Prices and numbers are kept unless your brief gives new ones.
            </p>

            <SectionLabel>Where should the new copy go?</SectionLabel>
            <OptionGrid role="radiogroup">
              <TargetOption
                selected={target === "new"}
                disabled={busy}
                icon="fa-regular fa-copy"
                title="Create a new step"
                badge="Recommended"
                description="Copies this step (prices, order bumps, settings) with the new text. The current page stays untouched."
                onSelect={() => setTarget("new")}
              />
              <TargetOption
                selected={target === "replace"}
                disabled={busy}
                icon="fa-solid fa-arrows-rotate"
                title="Replace this step"
                description="Overwrites the text on this page and saves it right away."
                onSelect={() => setTarget("replace")}
              />
            </OptionGrid>

            {error && <ErrorContainer>{error}</ErrorContainer>}

            {loading && <AiProgress stages={stages} index={index} />}

            {preview && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <Stat label="Text fields found" value={preview.total} />
                  <Stat label="Will be replaced" value={count} color={BLUE} />
                  <Stat label="Kept unchanged" value={preview.unchanged} color="#888" />
                  <Stat label="Failed" value={preview.failed} color={preview.failed ? "#f44336" : "#888"} />
                </div>
                <div style={{ border: "1px solid #eee", borderRadius: 10, marginBottom: 4 }}>
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
        )}

        {!newStepUrl && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
            <ActionButton
              onClick={generate}
              disabled={busy || !brief.trim() || total === 0}
              style={{ background: "#fff", color: "#333", border: "1px solid #ddd", display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              {loading && <Spinner $size={13} />}
              {loading ? `${stages[index]}…` : preview ? "Regenerate" : "Generate preview"}
            </ActionButton>
            {preview && count > 0 && (
              <ActionButton onClick={apply} disabled={busy} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {applying && <Spinner $size={13} $light />}
                {applying
                  ? target === "replace" ? "Replacing…" : "Creating step…"
                  : target === "replace"
                    ? `Replace ${count} text${count !== 1 ? "s" : ""}`
                    : `Create step with ${count} new text${count !== 1 ? "s" : ""}`}
              </ActionButton>
            )}
          </div>
        )}
      </ModalContainer>
    </ModalOverlay>,
    document.body,
  );
};

export default AiRewriteModal;
