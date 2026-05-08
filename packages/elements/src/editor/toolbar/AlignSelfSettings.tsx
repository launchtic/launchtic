import React from "react";
import { useAppContext } from "../../contexts/AppContext";
import { SettingsGroup, Label, IconButtonAlign, IconButtonGroup } from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon";

type AlignSelfSettingsProps = {
  alignSelf: { mobile?: string; desktop?: string };
  setAlignSelf: (value: { mobile?: string; desktop?: string }) => void;
};

export const AlignSelfSettings: React.FC<AlignSelfSettingsProps> = ({ alignSelf, setAlignSelf }) => {
  const { viewMode } = useAppContext();
  const currentAlignSelf = alignSelf[viewMode] ?? "center";

  return (
    <SettingsGroup>
      <Label>
        Alignment <ViewModeIcon />
      </Label>
      <IconButtonGroup>
        <IconButtonAlign
          $active={currentAlignSelf === "flex-start"}
          onClick={() => setAlignSelf({ ...alignSelf, [viewMode]: "flex-start" })}
          title="Align left"
        >
          <i className="fas fa-align-left"></i>
        </IconButtonAlign>
        <IconButtonAlign
          $active={currentAlignSelf === "center"}
          onClick={() => setAlignSelf({ ...alignSelf, [viewMode]: "center" })}
          title="Align center"
        >
          <i className="fas fa-align-center"></i>
        </IconButtonAlign>
        <IconButtonAlign
          $active={currentAlignSelf === "flex-end"}
          onClick={() => setAlignSelf({ ...alignSelf, [viewMode]: "flex-end" })}
          title="Align right"
        >
          <i className="fas fa-align-right"></i>
        </IconButtonAlign>
      </IconButtonGroup>
    </SettingsGroup>
  );
};