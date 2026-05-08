import React, { useState } from "react";
import { Label, SettingsGroup, IconButton } from "../common/SettingsUI";
import { HelpTooltip } from "../common/settings/HelpTooltip";
import { useNode } from "@craftjs/core";

export const IDAttributeSettings: React.FC = () => {
  const { htmlAttrId } = useNode((node) => ({
    htmlAttrId: node.data.props.htmlAttrId,
  }));

  const [copied, setCopied] = useState(false); // Tracks whether the value has just been copied

  const copyToClipboard = () => {
    if (htmlAttrId) {
      navigator.clipboard.writeText(htmlAttrId);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <SettingsGroup>
      <Label>
        ID attribute
        <HelpTooltip text="The ID attribute assigns a unique identifier to an HTML element, used for styling (CSS) and JavaScript manipulation via the DOM." />
      </Label>
      <div>
        <small>{htmlAttrId || "No ID assigned"}</small>
        {htmlAttrId && (
          <IconButton onClick={copyToClipboard} title="Copy ID">
            <i
              className={`fas ${copied ? "fa-check" : "fa-copy"}`} // Swap icon after copy
              style={{ color: copied ? "#28a745" : "#6c757d", transition: "color 0.3s ease" }}
            ></i>
          </IconButton>
        )}
      </div>
    </SettingsGroup>
  );
};
