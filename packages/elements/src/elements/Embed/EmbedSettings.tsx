import React from "react";
import { useNode } from "@launchtic/editor-core";
import { AppearanceSettings } from "../../editor/toolbar/AppearanceSettings";
import { MarginSettings } from "../../editor/toolbar/MarginSettings";
import { DelaySettings } from "../../editor/toolbar/DelaySettings";
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings";
import { Label, SettingsGroup, Textarea } from "../../editor/common/SettingsUI";
import { HelpTooltip } from "../../editor/common/settings/HelpTooltip";
import { EmbedProps } from "../ElementProps";

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

  return (
    <>
      <SettingsGroup>
        <Label>
          HTML / Embed code
          <HelpTooltip text="Paste any HTML, CSS or JavaScript (e.g. a cal.com embed). The code runs on the published page only — not inside the editor." />
        </Label>
        <Textarea
          spellCheck={false}
          style={{ minHeight: 220, fontFamily: "monospace", fontSize: 12.5 }}
          placeholder={'<!-- Paste your embed code here -->\n<script src="https://app.cal.com/embed/embed.js"></script>'}
          value={html ?? ""}
          onChange={(e) => updateProp("html")(e.target.value)}
        />
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
