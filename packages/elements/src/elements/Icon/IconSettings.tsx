import React from "react";
import { useNode } from "@launchtic/editor-core";
import { IconElementProps } from "../ElementProps";
import {
  SettingsGroup,
  Label,
  Divider,
  CheckboxWrapper,
  CheckboxInput,
  Select,
  Input,
  InputWrapper,
  SettingsGroupLarge,
} from "../../editor/common/SettingsUI";
import { AppearanceSettings } from "../../editor/toolbar/AppearanceSettings";
import { MarginSettings } from "../../editor/toolbar/MarginSettings";
import { PaddingSettings } from "../../editor/toolbar/PaddingSettings";
import { AlignSelfSettings } from "../../editor/toolbar/AlignSelfSettings";
import { DelaySettings } from "../../editor/toolbar/DelaySettings";
import { IconSelectorSettings } from "../../editor/toolbar/IconSelectorSettings";
import { IconColorSettings } from "../../editor/toolbar/IconColorSettings";
import { IconSizeSettings } from "../../editor/toolbar/IconSizeSettings";
import { TextColorSettings } from "../../editor/toolbar/TextColorSettings";
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings";

const POPULAR_ICONS = [
  "fas fa-circle-check",
  "fas fa-star",
  "fas fa-heart",
  "fas fa-bolt",
  "fas fa-rocket",
  "fas fa-shield-alt",
  "fas fa-thumbs-up",
  "fas fa-fire",
  "fas fa-gift",
  "fas fa-crown",
  "fas fa-bell",
  "fas fa-envelope",
];

export const IconSettings: React.FC = () => {
  const {
    actions: { setProp },
    iconClass,
    size,
    mobileSize,
    color,
    mobileColor,
    hoverColor,
    alignSelf,
    mobileAlignSelf,
    margin,
    mobileMargin,
    padding,
    mobilePadding,
    appearance,
    delay,
    action,
    link,
    openNewTab,
  } = useNode<IconElementProps>((node) => ({
    iconClass: node.data.props.iconClass,
    size: node.data.props.size,
    mobileSize: node.data.props.mobileSize,
    color: node.data.props.color,
    mobileColor: node.data.props.mobileColor,
    hoverColor: node.data.props.hoverColor,
    alignSelf: node.data.props.alignSelf,
    mobileAlignSelf: node.data.props.mobileAlignSelf,
    margin: node.data.props.margin,
    mobileMargin: node.data.props.mobileMargin,
    padding: node.data.props.padding,
    mobilePadding: node.data.props.mobilePadding,
    appearance: node.data.props.appearance,
    delay: node.data.props.delay,
    action: node.data.props.action,
    link: node.data.props.link,
    openNewTab: node.data.props.openNewTab,
  }));

  const updateProp =
    <K extends keyof IconElementProps>(key: K) =>
    (value: IconElementProps[K]) => {
      setProp((p: IconElementProps) => {
        p[key] = value;
      });
    };

  return (
    <>
      <SettingsGroupLarge>
        <IconSelectorSettings
          iconClass={iconClass}
          setIconClass={updateProp("iconClass")}
          label="Icon"
          popularIcons={POPULAR_ICONS}
        />

        <IconSizeSettings
          iconSize={{ desktop: size, mobile: mobileSize }}
          setIconSize={(value) => {
            updateProp("size")(value.desktop);
            updateProp("mobileSize")(value.mobile);
          }}
        />

        <IconColorSettings
          iconColor={{ desktop: color, mobile: mobileColor }}
          setIconColor={(value) => {
            updateProp("color")(value.desktop);
            updateProp("mobileColor")(value.mobile);
          }}
        />

        <TextColorSettings
          color={{ desktop: hoverColor, mobile: hoverColor }}
          setColor={(value) => updateProp("hoverColor")(value.desktop)}
          label="Hover color (optional)"
        />

        <Divider />
        <Label>Action when icon clicked</Label>
        <Select
          value={action ?? "none"}
          onChange={(e) =>
            updateProp("action")(e.target.value as IconElementProps["action"])
          }
        >
          <option value="none">None</option>
          <option value="link">Open URL</option>
        </Select>

        {action === "link" && (
          <>
            <Divider />
            <Label>Link</Label>
            <InputWrapper>
              <Input
                type="text"
                value={link ?? ""}
                placeholder="https://..."
                onChange={(e) => updateProp("link")(e.target.value)}
              />
            </InputWrapper>
            <CheckboxWrapper>
              <Label>Open in a new window</Label>
              <CheckboxInput
                type="checkbox"
                checked={!!openNewTab}
                onChange={(e) => updateProp("openNewTab")(e.target.checked)}
              />
            </CheckboxWrapper>
          </>
        )}
      </SettingsGroupLarge>

      <AlignSelfSettings
        alignSelf={{ desktop: alignSelf, mobile: mobileAlignSelf }}
        setAlignSelf={(value) => {
          updateProp("alignSelf")(value.desktop);
          updateProp("mobileAlignSelf")(value.mobile);
        }}
      />

      <PaddingSettings
        padding={padding}
        mobilePadding={mobilePadding}
        setPadding={updateProp("padding")}
        setMobilePadding={updateProp("mobilePadding")}
      />

      <MarginSettings
        margin={margin}
        mobileMargin={mobileMargin}
        setMargin={updateProp("margin")}
        setMobileMargin={updateProp("mobileMargin")}
      />

      <DelaySettings delay={delay} setDelay={updateProp("delay")} />

      <AppearanceSettings
        appearance={appearance}
        setAppearance={updateProp("appearance")}
      />

      <IDAttributeSettings />
    </>
  );
};
