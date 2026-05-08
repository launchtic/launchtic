import React from "react";
import { useAppContext } from "../../contexts/AppContext";
import { SettingsGroupLarge, Label, SliderControl } from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon";

type SpacingMenuSettingsProps = {
  spaceBetweenItems: { mobile?: number; desktop?: number };
  setSpaceBetweenItems: (value: { mobile?: number; desktop?: number }) => void;
  spaceBetweenSubmenuItems: { mobile?: number; desktop?: number };
  setSpaceBetweenSubmenuItems: (value: { mobile?: number; desktop?: number }) => void;
};

export const SpacingMenuSettings: React.FC<SpacingMenuSettingsProps> = ({
  spaceBetweenItems,
  setSpaceBetweenItems,
  spaceBetweenSubmenuItems,
  setSpaceBetweenSubmenuItems,
}) => {
  const { viewMode } = useAppContext();
  
  const currentSpaceBetweenItems = spaceBetweenItems[viewMode] ?? 23;
  const currentSpaceBetweenSubmenuItems = spaceBetweenSubmenuItems[viewMode] ?? 23;

  return (
    <SettingsGroupLarge>
      <Label>Margin  <ViewModeIcon /></Label>
      
      <div>
        <Label>
          Spacing between menu items
        </Label>
        <SliderControl
          value={currentSpaceBetweenItems}
          min={0}
          max={100}
          onChange={(value) => setSpaceBetweenItems({ ...spaceBetweenItems, [viewMode]: value })}
        />
      </div>
      
      <div>
        <Label>
          Spacing between submenu items
        </Label>
        <SliderControl
          value={currentSpaceBetweenSubmenuItems}
          min={0}
          max={100}
          onChange={(value) => setSpaceBetweenSubmenuItems({ ...spaceBetweenSubmenuItems, [viewMode]: value })}
        />
      </div>
    </SettingsGroupLarge>
  );
};