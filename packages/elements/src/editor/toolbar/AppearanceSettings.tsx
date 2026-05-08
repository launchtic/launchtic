import React from "react";
import { Label, SettingsGroup, CheckboxWrapper, CheckboxInput } from "../common/SettingsUI";

type AppearanceSettingsProps = {
  appearance: { mobile: boolean; desktop: boolean };
  setAppearance: (updatedAppearance: { mobile: boolean; desktop: boolean }) => void;
};

export const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({
  appearance,
  setAppearance,
}) => {
  const handleToggle = (device: "mobile" | "desktop") => {
    if (device === "mobile") {
      const newMobileState = !appearance.mobile; // Toggle mobile state
      setAppearance({
        mobile: newMobileState,
        desktop: newMobileState === false && appearance.desktop === false ? true : appearance.desktop, // If both end up false, re-enable desktop
      });
    } else {
      const newDesktopState = !appearance.desktop; // Toggle desktop state
      setAppearance({
        desktop: newDesktopState,
        mobile: newDesktopState === false && appearance.mobile === false ? true : appearance.mobile, // If both end up false, re-enable mobile
      });
    }
  };

  return (
    <SettingsGroup>
      <Label>Item visible on:</Label>
      <CheckboxWrapper>
        <Label>Desktop</Label>
        <CheckboxInput
          type="checkbox"
          checked={appearance.desktop}
          onChange={() => handleToggle("desktop")}
        />
      </CheckboxWrapper>
      <CheckboxWrapper>
        <Label>Mobile</Label>
        <CheckboxInput
          type="checkbox"
          checked={appearance.mobile}
          onChange={() => handleToggle("mobile")}
        />
      </CheckboxWrapper>
    </SettingsGroup>
  );
};
