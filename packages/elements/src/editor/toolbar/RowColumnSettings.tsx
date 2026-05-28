import React from "react";
import { Label, SettingsGroup, CheckboxWrapper, CheckboxInput } from "../common/SettingsUI";
import { HelpTooltip } from "../common/settings/HelpTooltip";

type RowColumnSettingsProps = {
  disableStacking?: boolean;
  reverseColumns?: boolean;
  setSettings: (updatedSettings: { disableStacking?: boolean; reverseColumns?: boolean }) => void;
};

export const RowColumnSettings: React.FC<RowColumnSettingsProps> = ({
  disableStacking,
  reverseColumns,
  setSettings,
}) => {
  const handleToggle = (setting: "disableStacking" | "reverseColumns") => {
    if (setting === "disableStacking") {
      setSettings({ 
        disableStacking: !disableStacking, 
        reverseColumns 
      });
    } else {
      setSettings({ 
        disableStacking, 
        reverseColumns: !reverseColumns 
      });
    }
  };

  return (
    <SettingsGroup>
      <Label>Row Layout on Mobile:</Label>
      <CheckboxWrapper>
        <Label>
            Disable stacking on mobile
            <HelpTooltip text="Prevents rows from stacking vertically on smaller screens." />
        </Label>
        <CheckboxInput
          type="checkbox"
          checked={disableStacking}
          onChange={() => handleToggle("disableStacking")}
        />
      </CheckboxWrapper>
      <CheckboxWrapper>
        <Label>Reverse columns on mobile
            <HelpTooltip text="Reverses the order of columns inside the row when viewed on mobile devices." />
        </Label>
        <CheckboxInput
          type="checkbox"
          checked={reverseColumns}
          onChange={() => handleToggle("reverseColumns")}
        />
      </CheckboxWrapper>
    </SettingsGroup>
  );
};
