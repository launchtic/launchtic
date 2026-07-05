import React, { useState, useEffect } from "react";
import { useNode } from "@launchtic/editor-core";
import { AppearanceSettings } from "../../editor/toolbar/AppearanceSettings";
import { MarginSettings } from "../../editor/toolbar/MarginSettings";
import { DelaySettings } from "../../editor/toolbar/DelaySettings";
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings";
import { Label, SettingsGroup, Textarea, LightButton } from "../../editor/common/SettingsUI";
import { EmbedProps } from "../ElementProps";

// Document-level tags aren't valid inside an embed fragment: the browser drops
// the wrappers when the markup is injected, and any CSS in <head> leaks to the
// whole page. Mirrors systeme.io, which rejects these outright.
const FORBIDDEN_TAGS: { label: string; test: RegExp }[] = [
  { label: "<!DOCTYPE>", test: /<!doctype/i },
  { label: "<html>", test: /<html[\s/>]/i },
  { label: "<head>", test: /<head[\s/>]/i },
  { label: "<body>", test: /<body[\s/>]/i },
];

const findForbiddenTags = (code: string): string[] =>
  FORBIDDEN_TAGS.filter((t) => t.test.test(code)).map((t) => t.label);

// Strip ONLY the wrapper tags — keep everything inside (styles, links, scripts,
// body content). Turns an AI-generated full document into a valid fragment
// without losing any content.
const cleanEmbedHtml = (code: string): string =>
  code
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<\/?html[^>]*>/gi, "")
    .replace(/<\/?head[^>]*>/gi, "")
    .replace(/<\/?body[^>]*>/gi, "")
    .trim();

export const EmbedSettings: React.FC = () => {
  const {
    actions: { setProp },
    html,
    appearance,
    delay,
    margin,
    mobileMargin,
  } = useNode<EmbedProps>((node) => ({
    html: node.data.props.html,
    appearance: node.data.props.appearance,
    delay: node.data.props.delay,
    margin: node.data.props.margin,
    mobileMargin: node.data.props.mobileMargin,
  }));

  const updateProp = <K extends keyof EmbedProps>(key: K) => (value: EmbedProps[K]) => {
    setProp((props: EmbedProps) => {
      props[key] = value;
    });
  };

  // Local draft. Invalid code is NEVER committed to the craft prop, so it can't
  // be saved or rendered — the block is on commit, not on typing. Re-syncs from
  // the prop when a different Embed node is selected.
  const [draft, setDraft] = useState(html ?? "");
  useEffect(() => {
    setDraft(html ?? "");
  }, [html]);

  const forbidden = findForbiddenTags(draft);
  const isValid = forbidden.length === 0;

  const handleChange = (value: string) => {
    setDraft(value);
    if (findForbiddenTags(value).length === 0) {
      updateProp("html")(value); // commit only when valid
    }
  };

  const handleAutoClean = () => {
    const cleaned = cleanEmbedHtml(draft);
    setDraft(cleaned);
    updateProp("html")(cleaned);
  };

  return (
    <>
      <SettingsGroup>
        <Label>HTML / Embed code</Label>
        <Textarea
          spellCheck={false}
          style={{
            minHeight: 220,
            fontFamily: "monospace",
            fontSize: 12.5,
            borderColor: isValid ? undefined : "#dc2626",
          }}
          placeholder={'<h2>HTML code</h2>'}
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
        />
        {!isValid && (
          <div style={{ marginTop: 8 }}>
            <div style={{ color: "#dc2626", fontSize: 12.5, marginBottom: 6 }}>
              The code is not valid — remove: {forbidden.join(", ")}
            </div>
            <LightButton type="button" onClick={handleAutoClean}>
              <i className="fas fa-wand-magic-sparkles" style={{ marginRight: 6 }} />
              Auto-clean tags
            </LightButton>
          </div>
        )}
      </SettingsGroup>

      <MarginSettings
        margin={margin}
        mobileMargin={mobileMargin}
        setMargin={updateProp("margin")}
        setMobileMargin={updateProp("mobileMargin")}
      />

      <DelaySettings delay={delay} setDelay={updateProp("delay")} />

      <AppearanceSettings appearance={appearance} setAppearance={updateProp("appearance")} />

      <IDAttributeSettings />
    </>
  );
};
