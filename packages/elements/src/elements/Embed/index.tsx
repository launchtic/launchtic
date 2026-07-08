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

// Height uses BOTH mechanisms, like ElementWrapper's margin:
//  - `$baseHeight` is resolved in JS from the editor's `viewMode`, so switching
//    the editor's mobile/desktop preview reflects immediately (the editor's
//    browser viewport stays wide, so a media query alone never fires there).
//  - the `@media (max-width: 801px)` override is what makes the mobile value
//    take effect on a REAL device (where `viewMode` is always "desktop").
// Mode is per-device too, so desktop can auto-fit while mobile is fixed (or vice
// versa). Auto uses the measured content height (already responsive).
const Frame = styled.iframe<{
  $baseHeight: number;
  $mobileMode: "auto" | "fixed";
  $height?: number;
  $mobileHeight?: number;
  $autoHeight: number;
  $enabled: boolean;
}>`
  width: 100%;
  border: 0;
  display: block;
  ${({ $enabled }) => $enabled && "pointer-events: none;"}
  height: ${({ $baseHeight }) => `${$baseHeight}px`};

  @media (max-width: 801px) {
    height: ${({ $mobileMode, $autoHeight, $mobileHeight, $height }) =>
      $mobileMode === "fixed" ? `${$mobileHeight ?? $height ?? 300}px` : `${$autoHeight || 60}px`};
  }
`;

// The user's code runs inside the iframe as a REAL document, so a full
// `<!DOCTYPE html>…` works as-is and its CSS/JS can't leak out onto the page.
// We inject: (1) a per-device overflow rule — auto hides the iframe's own
// scrollbar (it's sized to content), fixed keeps it so taller content stays
// reachable; a media query does this responsively, since a static `scrolling`
// attribute can't differ per device. (2) a reporter that posts the content
// height to the parent, tagged with this frame's id so embeds don't cross-wire.
const buildSrcDoc = (
  html: string,
  frameId: string,
  desktopMode: "auto" | "fixed",
  mobileMode: "auto" | "fixed",
): string => {
  const overflow =
    `<style>` +
    `html{overflow-y:${desktopMode === "auto" ? "hidden" : "auto"};}` +
    `@media(max-width:801px){html{overflow-y:${mobileMode === "auto" ? "hidden" : "auto"};}}` +
    `</style>`;
  // Measure body.scrollHeight (content height) — NOT documentElement.scrollHeight,
  // which is floored to the iframe's viewport. When a fixed mode forces the frame
  // taller than its content, documentElement would report that inflated height and
  // auto mode would then get stuck at it (never shrinking back to fit content).
  const reporter =
    `<script>(function(){` +
    `function send(){var h=document.body.scrollHeight;` +
    `parent.postMessage({__embedResize:true,id:${JSON.stringify(frameId)},height:h},'*');}` +
    `window.addEventListener('load',send);` +
    `if(window.ResizeObserver){new ResizeObserver(send).observe(document.body);}else{setInterval(send,500);}` +
    `setTimeout(send,50);` +
    `})();</script>`;
  const inject = overflow + reporter;

  const isFullDoc = /<html[\s>]/i.test(html);
  if (isFullDoc) {
    if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, inject + "</body>");
    if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, inject + "</html>");
    return html + inject;
  }
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<style>html,body{margin:0;padding:0}</style></head><body>${html}${inject}</body></html>`
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
  };

  const desktopMode = props.heightMode ?? "auto";
  const mobileMode = props.mobileHeightMode ?? "auto";

  // Auto-height: listen for the reporter's height message (matched by frame id).
  // Needed whenever EITHER device uses auto. srcDoc is deterministic, so the
  // iframe hydrates cleanly — only this listener is client-side.
  const [autoHeight, setAutoHeight] = useState(0);
  useEffect(() => {
    if (desktopMode === "fixed" && mobileMode === "fixed") return;
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { __embedResize?: boolean; id?: string; height?: number };
      if (d && d.__embedResize && d.id === frameId && typeof d.height === "number") {
        setAutoHeight(d.height);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frameId, desktopMode, mobileMode]);

  const srcDoc = useMemo(
    () => buildSrcDoc(resolvedProps.html || "", frameId, desktopMode, mobileMode),
    [resolvedProps.html, frameId, desktopMode, mobileMode],
  );

  // Base height resolved for the editor's current preview (JS), so switching
  // desktop/mobile in the editor updates instantly. The media query in <Frame>
  // handles the real device.
  const currentMode = viewMode === "mobile" ? mobileMode : desktopMode;
  const currentFixedHeight = viewMode === "mobile" ? props.mobileHeight : props.height;
  const baseHeight = currentMode === "fixed" ? currentFixedHeight ?? 300 : autoHeight || 60;

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
              // landing inside the widget. (Scrollbar is handled inside srcDoc.)
              $baseHeight={baseHeight}
              $mobileMode={mobileMode}
              $height={props.height}
              $mobileHeight={props.mobileHeight}
              $autoHeight={autoHeight}
              $enabled={enabled}
            />
          ) : enabled ? (
            <Placeholder>
              <i className="fas fa-code" />
              <div>Empty HTML block — paste your code in the panel</div>
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
