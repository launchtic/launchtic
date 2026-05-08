import React from "react";
import { Label, SettingsGroup, Select, ResetIcon } from "../common/SettingsUI";
import { HelpTooltip } from "../common/settings/HelpTooltip";

type ContentWidthSettingsProps = {
  contentWidth?: string;
  setContentWidth: (value?: string) => void;
};

export const ContentWidthSettings: React.FC<ContentWidthSettingsProps> = ({
  contentWidth,
  setContentWidth,
}) => {

  // Reset contentWidth to `undefined`
  const handleReset = () => {
    if (!contentWidth) return;
    setContentWidth(undefined);
  };

  return (
    <SettingsGroup>
      <Label>
        Content Width
        <HelpTooltip text="This determines the width of the content inside the selected section." />
        <ResetIcon onClick={handleReset} title="Remove Content Width">
          <i className="fas fa-ban"></i>
        </ResetIcon>
      </Label>
      <Select
        value={contentWidth || "100%"}
        onChange={(e) => setContentWidth(e.target.value)}
      >
        <option value="100%">Full Page</option>
        <option value="1120px">Wide</option>
        <option value="960px">Medium</option>
        <option value="720px">Small</option>
        <option value="550px">Extra Small</option>
      </Select>
    </SettingsGroup>
  );
};
