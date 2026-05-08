import React, { useEffect, useState } from "react";
import { SettingsGroup, Label, SliderControl, ControlContainer, IconButton } from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon";
import { useAppContext } from "../../contexts/AppContext";
import { PaddingProps } from "../../elements/ElementProps";

const isUniformPadding = (padding: PaddingProps["padding"]) => {
  const { paddingTop, paddingBottom, paddingLeft, paddingRight } = padding;
  return paddingTop === paddingBottom && paddingTop === paddingLeft && paddingTop === paddingRight;
};

export const PaddingSettings: React.FC<{ 
  padding: PaddingProps["padding"]; 
  mobilePadding: PaddingProps["mobilePadding"];
  setPadding: (value: PaddingProps["padding"]) => void;
  setMobilePadding: (value: PaddingProps["mobilePadding"]) => void;
}> = ({ padding, mobilePadding, setPadding, setMobilePadding }) => {
  const { viewMode } = useAppContext();
  
  const currentPadding = viewMode === "mobile" ? mobilePadding : padding;
  const setCurrentPadding = viewMode === "mobile" ? setMobilePadding : setPadding;

  const [isExpanded, setIsExpanded] = useState(false);

  // ✅ Auto-detect isExpanded when the component mounts
  useEffect(() => {
    setIsExpanded(!isUniformPadding(currentPadding));
  }, [currentPadding]);

  return (
    <SettingsGroup>
      <Label>
        Padding <ViewModeIcon />
      </Label>
      <ControlContainer>
        <IconButton 
          $active={!isExpanded} 
          onClick={() => {
            setIsExpanded(false);
            setCurrentPadding({
              paddingTop: currentPadding.paddingTop,
              paddingBottom: currentPadding.paddingTop,
              paddingLeft: currentPadding.paddingTop,
              paddingRight: currentPadding.paddingTop,
            }); // ✅ Collapse and unify padding
          }}>
          <i className="fas fa-square"></i>
        </IconButton>
        <IconButton 
          $active={isExpanded} 
          onClick={() => setIsExpanded(true)}>
          <i className="far fa-square"></i>
        </IconButton>
      </ControlContainer>

      {!isExpanded ? (
        <SliderControl
          label=""
          value={currentPadding.paddingTop}
          min={0}
          step={2}
          max={200}
          onChange={(value) =>
            setCurrentPadding({
              paddingTop: value,
              paddingBottom: value,
              paddingLeft: value,
              paddingRight: value,
            })
          }
        />
      ) : (
        <>
          {["paddingTop", "paddingBottom", "paddingLeft", "paddingRight"].map((side) => (
            <SliderControl
              key={side}
              label={side.replace("padding", "")}
              value={currentPadding[side as keyof PaddingProps["padding"]]}
              min={0}
              step={2}
              max={200}
              onChange={(value) =>
                setCurrentPadding({ 
                  ...currentPadding, 
                  [side]: value 
                })
              }
            />
          ))}
        </>
      )}
    </SettingsGroup>
  );
};
