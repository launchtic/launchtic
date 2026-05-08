import React, { useEffect, useState } from "react";
import { SettingsGroup, Label, SliderControl, ControlContainer, IconButton } from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon";
import { useAppContext } from "../../contexts/AppContext";
import { MarginProps } from "../../elements/ElementProps";

const isUniformMargin = (margin: MarginProps["margin"]) => {
  const { marginTop, marginBottom, marginLeft, marginRight } = margin;
  return marginTop === marginBottom && marginTop === marginLeft && marginTop === marginRight;
};

export const MarginSettings: React.FC<{ 
  margin: MarginProps["margin"];  
  mobileMargin: MarginProps["mobileMargin"];
  setMargin: (value: MarginProps["margin"]) => void;
  setMobileMargin: (value: MarginProps["mobileMargin"]) => void;
}> = ({ margin, mobileMargin, setMargin, setMobileMargin }) => {
  const { viewMode } = useAppContext();

  const currentMargin = viewMode === "mobile" ? mobileMargin : margin;
  const setCurrentMargin = viewMode === "mobile" ? setMobileMargin : setMargin;

  const [isExpanded, setIsExpanded] = useState(false);

  // ✅ Auto-detect expanded state based on margin uniformity
  useEffect(() => {
    setIsExpanded(!isUniformMargin(currentMargin));
  }, [currentMargin]);

  return (
    <SettingsGroup>
      <Label>
        Margin <ViewModeIcon />
      </Label>
      <ControlContainer>
        <IconButton 
          $active={!isExpanded} 
          onClick={() => {
            setIsExpanded(false);
            setCurrentMargin({
              marginTop: currentMargin.marginTop,
              marginBottom: currentMargin.marginTop,
              marginLeft: currentMargin.marginTop,
              marginRight: currentMargin.marginTop,
            }); // ✅ Collapse and unify margins
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
          value={currentMargin.marginTop}
          min={0}
          step={2}
          max={200}
          onChange={(value) =>
            setCurrentMargin({
              marginTop: value,
              marginBottom: value,
              marginLeft: value,
              marginRight: value,
            })
          }
        />
      ) : (
        <>
          {["marginTop", "marginBottom", "marginLeft", "marginRight"].map((side) => (
            <SliderControl
              key={side}
              label={side.replace("margin", "")}
              value={currentMargin[side as keyof MarginProps["margin"]]}
              min={0}
              step={2}
              max={200}
              onChange={(value) =>
                setCurrentMargin({ 
                  ...currentMargin, 
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
