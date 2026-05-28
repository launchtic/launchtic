import React from "react";
import { useAppContext } from "../../contexts/AppContext";
import { SettingsGroup, Label, IconButtonAlign, IconButtonGroup } from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon";



type TextAlignSettingsProps = {
  textAlign: { mobile?: string; desktop?: string };
  setTextAlign: (value: { mobile?: string; desktop?: string }) => void;
};

export const TextAlignSettings: React.FC<TextAlignSettingsProps> = ({ textAlign, setTextAlign }) => {
  const { viewMode } = useAppContext();
  const currentAlign = textAlign[viewMode] ?? "left";

  return (
    <SettingsGroup>
      <Label>
        Alignment <ViewModeIcon />
      </Label>
      <IconButtonGroup >
        <IconButtonAlign
          $active={currentAlign === "left"}
          onClick={() => setTextAlign({ ...textAlign, [viewMode]: "left" })}
        >
          <i className="fas fa-align-left"></i>
        </IconButtonAlign>
        <IconButtonAlign
          $active={currentAlign === "center"}
          onClick={() => setTextAlign({ ...textAlign, [viewMode]: "center" })}
        >
          <i className="fas fa-align-center"></i>
        </IconButtonAlign>
        <IconButtonAlign
          $active={currentAlign === "right"}
          onClick={() => setTextAlign({ ...textAlign, [viewMode]: "right" })}
        >
          <i className="fas fa-align-right"></i>
        </IconButtonAlign>
      </IconButtonGroup >
    </SettingsGroup>
  );
};
