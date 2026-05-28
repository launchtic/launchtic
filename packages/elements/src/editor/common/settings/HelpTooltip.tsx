import React, { useState } from "react";
import { HelpIcon, Tooltip } from "../SettingsUI";

type HelpTooltipProps = {
  text: string;
};

export const HelpTooltip: React.FC<HelpTooltipProps> = ({ text }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <HelpIcon
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <i className="fas fa-question-circle"></i>
      </HelpIcon>
      <Tooltip $show={showTooltip}>{text}</Tooltip>
    </div>
  );
};
