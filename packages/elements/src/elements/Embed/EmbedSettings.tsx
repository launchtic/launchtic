import React from "react";
import { useNode } from "@launchtic/editor-core";
import { AppearanceSettings } from "../../editor/toolbar/AppearanceSettings";
import { MarginSettings } from "../../editor/toolbar/MarginSettings";
import { DelaySettings } from "../../editor/toolbar/DelaySettings";
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings";
import { Label, SettingsGroup, Textarea, Select, Input } from "../../editor/common/SettingsUI";
import { ViewModeIcon } from "../../editor/common/settings/ViewModeIcon";
import { useAppContext } from "../../contexts/AppContext";
import { EmbedProps } from "../ElementProps";

export const EmbedSettings: React.FC = () => {
  const {
    actions: { setProp },
    html,
    heightMode,
    height,
    mobileHeight,
    appearance,
    delay,
    margin,
    mobileMargin,
  } = useNode<EmbedProps>((node) => ({
    html: node.data.props.html,
    heightMode: node.data.props.heightMode,
    height: node.data.props.height,
    mobileHeight: node.data.props.mobileHeight,
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

  const mode = heightMode ?? "auto";

  // Edit the height for whichever device is previewed in the editor — same
  // view-mode pattern as MarginSettings.
  const { viewMode } = useAppContext();
  const currentHeight = viewMode === "mobile" ? mobileHeight : height;
  const setCurrentHeight = viewMode === "mobile" ? updateProp("mobileHeight") : updateProp("height");

  const parsePx = (v: string): number | undefined => (v ? parseInt(v, 10) : undefined);

  return (
    <>
      <SettingsGroup>
        {/* No validation needed — an iframe is a real document, so a full
            `<!DOCTYPE html>…` is valid and stays isolated from the page. */}
        <Label>HTML / Embed code</Label>
        <Textarea
          spellCheck={false}
          style={{ minHeight: 220, fontFamily: "monospace", fontSize: 12.5 }}
          placeholder={'Paste any HTML, CSS or JS code here.'}
          value={html ?? ""}
          onChange={(e) => updateProp("html")(e.target.value)}
        />
      </SettingsGroup>

      <SettingsGroup>
        <Label>Height</Label>
        <Select value={mode} onChange={(e) => updateProp("heightMode")(e.target.value as EmbedProps["heightMode"])}>
          <option value="auto">Auto (fit content)</option>
          <option value="fixed">Fixed</option>
        </Select>

        {mode === "fixed" && (
          <>
            <Label $small>
              Height (px) <ViewModeIcon />
            </Label>
            <Input
              type="number"
              min="0"
              value={currentHeight ?? ""}
              onChange={(e) => setCurrentHeight(parsePx(e.target.value))}
            />
          </>
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
