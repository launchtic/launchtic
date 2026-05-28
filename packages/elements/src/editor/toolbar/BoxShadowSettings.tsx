import React from "react";
import { useAppContext } from "../../contexts/AppContext";
import { Label, SettingsGroup, Select, ResetIcon } from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon"; // ✅ Import ViewModeIcon

type BoxShadowSettingsProps = {
  boxShadow: { mobile?: string; desktop?: string };
  setBoxShadow: (updatedShadow: { mobile?: string; desktop?: string }) => void;
};

export const BoxShadowSettings: React.FC<BoxShadowSettingsProps> = ({
  boxShadow,
  setBoxShadow,
}) => {
  const { viewMode } = useAppContext();

  // Reset boxShadow to `undefined`
  const handleReset = () => {
    if (!boxShadow[viewMode]) return;
    setBoxShadow({ ...boxShadow, [viewMode]: undefined });
  };

  return (
    <SettingsGroup>
      <Label>
        Shadow
        <ViewModeIcon /> {/* Show the currently active view mode */}
        <ResetIcon onClick={handleReset} title="Remove Shadow">
          <i className="fas fa-ban"></i>
        </ResetIcon>
      </Label>
      <Select
        value={boxShadow[viewMode] || "none"}
        onChange={(e) =>
          setBoxShadow({ ...boxShadow, [viewMode]: e.target.value })
        }
      >
        <option value="noShadow">No shadow</option>
        <option value="softShadow">Soft shadow</option>
        <option value="midShadow">Mid shadow</option>
        <option value="hardShadow">Hard shadow</option>
        <option value="farShadow">Far shadow</option>
        <option value="blurryShadow">Blurry shadow</option>
        <option value="darkWithHighlight">Dark with highlight</option>
        <option value="softShadowInset">Soft inner shadow</option>
        <option value="midShadowInset">Mid inner shadow</option>
        <option value="hardShadowInset">Hard inner shadow</option>
      </Select>
    </SettingsGroup>
  );
};
