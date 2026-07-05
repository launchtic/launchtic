import { UserComponent } from "@launchtic/editor-core";
import styled from "styled-components";
import { useEffect, useRef } from "react";
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

// Editor-only placeholder. We deliberately do NOT render the user's markup in
// the builder — arbitrary CSS/JS could break the editor. Matches systeme.io:
// "Raw HTML does not appear in Preview mode. It will only be visible on the
// live page."
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

export const Embed: UserComponent<EmbedProps> = ({ ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("embed", "htmlAttrId");
  const { isActive, isHover, enabled } = useNodeState();

  const resolvedProps = {
    delay: props.delay,
    appearance: getAppearanceByViewMode(viewMode, props.appearance),
    margin: getValueByViewMode(viewMode, props.margin, props.mobileMargin),
    mobileMargin: props.mobileMargin,
    html: props.html,
  };

  const containerRef = useRef<HTMLDivElement>(null);

  // Published page only. We inject the markup on the CLIENT, after mount —
  // never during SSR. If the code were server-rendered, its inline <script>s
  // would run while the browser parses the initial HTML (BEFORE React
  // hydrates); any global DOM change they make (e.g. a library adding a class
  // to <html>) then desyncs hydration. Rendering an empty div on the server
  // keeps hydration clean, and we fill it here in real page context.
  //
  // React/innerHTML never EXECUTES injected <script>s, so we swap each inert
  // one for a freshly-created element — that is what actually runs cal.com /
  // AI-generated JS. In the editor (`enabled`) we run nothing.
  useEffect(() => {
    if (enabled) return;
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = resolvedProps.html || "";

    const scripts = Array.from(container.querySelectorAll("script"));
    scripts.forEach((oldScript) => {
      const fresh = document.createElement("script");
      for (const attr of Array.from(oldScript.attributes)) {
        fresh.setAttribute(attr.name, attr.value);
      }
      fresh.textContent = oldScript.textContent;
      oldScript.parentNode?.replaceChild(fresh, oldScript);
    });
  }, [enabled, resolvedProps.html]);

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
          {enabled ? (
            <Placeholder>
              <i className="fas fa-code" />
              <div>{resolvedProps.html ? "Custom HTML / Embed" : "Empty HTML block — paste your code in the panel"}</div>
              <small style={{ fontSize: 11 }}>Visible on the live page only</small>
            </Placeholder>
          ) : (
            <div
              id={props.htmlAttrId || elementId}
              ref={containerRef}
              suppressHydrationWarning
            />
          )}
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
