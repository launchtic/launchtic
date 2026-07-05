import { UserComponent } from "@launchtic/editor-core";
import styled from "styled-components";
import { useEffect, useMemo, useState } from "react";
import { Indicator } from "../../editor/common/Indicator";
import { EmbedProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { EmbedSettings } from "./EmbedSettings";
import { getValueByViewMode, getAppearanceByViewMode } from "../../utils/helpers";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement";

const Placeholder = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 28px 16px;
  border: 1px dashed #c7ccd1;
  border-radius: 8px;
  background: #f8f9fa;
  color: #8a9099;
  text-align: center;
  font-size: 13px;

  i {
    font-size: 22px;
  }
`;

// Height is applied via CSS so it stays responsive on the LIVE page: `viewMode`
// is an editor-only toggle (always "desktop" on a published page), so a media
// query — not JS — is what makes the mobile height actually take effect on a
// real device. Auto mode uses the measured content height (already responsive).
const Frame = styled.iframe<{
  $mode: "auto" | "fixed";
  $height?: number;
  $mobileHeight?: number;
  $autoHeight: number;
  $enabled: boolean;
}>`
  width: 100%;
  border: 0;
  display: block;
  ${({ $enabled }) => $enabled && "pointer-events: none;"}
  height: ${({ $mode, $autoHeight, $height }) =>
    $mode === "fixed" ? `${$height ?? 300}px` : `${$autoHeight || 60}px`};

  @media (max-width: 801px) {
    ${({ $mode, $mobileHeight, $height }) =>
      $mode === "fixed" ? `height: ${$mobileHeight ?? $height ?? 300}px;` : ""}
  }
`;

// The user's code runs inside the iframe as a REAL document, so a full
// `<!DOCTYPE html>…` works as-is and its CSS/JS can't leak out onto the page.
// We append a small reporter that posts the content height to the parent
// (iframes don't auto-size to content), tagged with this frame's id so multiple
// embeds don't cross-wire.
const buildSrcDoc = (html: string, frameId: string): string => {
  const reporter =
    `<script>(function(){` +
    `function send(){var h=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight);` +
    `parent.postMessage({__embedResize:true,id:${JSON.stringify(frameId)},height:h},'*');}` +
    `window.addEventListener('load',send);` +
    `if(window.ResizeObserver){new ResizeObserver(send).observe(document.body);}else{setInterval(send,500);}` +
    `setTimeout(send,50);` +
    `})();</script>`;

  const isFullDoc = /<html[\s>]/i.test(html);
  if (isFullDoc) {
    if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, reporter + "</body>");
    if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, reporter + "</html>");
    return html + reporter;
  }
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<style>html,body{margin:0;padding:0}</style></head><body>${html}${reporter}</body></html>`
  );
};

export const Embed: UserComponent<EmbedProps> = ({ ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("embed", "htmlAttrId");
  const { isActive, isHover, enabled } = useNodeState();

  const frameId = props.htmlAttrId || elementId;

  const resolvedProps = {
    delay: props.delay,
    appearance: getAppearanceByViewMode(viewMode, props.appearance),
    margin: getValueByViewMode(viewMode, props.margin, props.mobileMargin),
    mobileMargin: props.mobileMargin,
    html: props.html,
    heightMode: props.heightMode ?? "auto",
  };

  // Auto-height: listen for the reporter's height message (matched by frame id).
  // srcDoc is deterministic, so the iframe itself hydrates cleanly — only this
  // listener is client-side, which never affects hydration.
  const [autoHeight, setAutoHeight] = useState(0);
  useEffect(() => {
    if (resolvedProps.heightMode === "fixed") return;
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { __embedResize?: boolean; id?: string; height?: number };
      if (d && d.__embedResize && d.id === frameId && typeof d.height === "number") {
        setAutoHeight(d.height);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frameId, resolvedProps.heightMode]);

  const srcDoc = useMemo(() => buildSrcDoc(resolvedProps.html || "", frameId), [resolvedProps.html, frameId]);

  return (
    <DelayedRender delay={resolvedProps.delay}>
      <ElementDrag elementType="Embed">
        <ElementWrapper
          ref={ref}
          id={enabled ? UUIDWrapper : undefined}
          $enabled={enabled}
          $isHover={isHover}
          $isActive={isActive}
          $margin={resolvedProps.margin}
          $mobileMargin={resolvedProps.mobileMargin}
          $appearance={resolvedProps.appearance}
          $cssDefault=""
        >
          {(enabled && isActive) || (enabled && isHover) ? <Indicator name={"HTML / Embed"} /> : null}
          {resolvedProps.html ? (
            <Frame
              id={frameId}
              title="Embedded content"
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-popups-to-escape-sandbox"
              // Isolated, so it's safe to render live in the editor too — pointer
              // events are disabled there so clicks select the element instead of
              // landing inside the widget.
              $mode={resolvedProps.heightMode}
              $height={props.height}
              $mobileHeight={props.mobileHeight}
              $autoHeight={autoHeight}
              $enabled={enabled}
            />
          ) : enabled ? (
            <Placeholder>
              <i className="fas fa-code" />
              <div>Empty HTML block — paste your code in the panel</div>
              <small style={{ fontSize: 11 }}>Runs sandboxed in an iframe</small>
            </Placeholder>
          ) : null}
        </ElementWrapper>
      </ElementDrag>
    </DelayedRender>
  );
};

Embed.craft = {
  props: { ...DEFAULT_STYLES.embed },
  related: { settings: EmbedSettings },
  displayName: "Embed",
};
