import React, { useState, useRef } from "react";
import styled from "styled-components";
import { useAppContext } from "../../contexts/AppContext";
import {
  Label,
  SettingsGroup,
  InputWrapper,
  Input,
  UploadIcon,
  ResetIcon,
  Select,
} from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon";
import { ColorPickerPopup } from "../common/settings/ColorPickerPopup";
import { rgbaToString } from "../../utils/helpers";
import {
  BackgroundImageValue,
  BackgroundImageDisplayMode,
  BackgroundImagePosition,
} from "../../elements/ElementProps";
import ImageUploadModal from "./ImageUploadModal";

type ViewMap = { mobile?: BackgroundImageValue; desktop?: BackgroundImageValue };

type BackgroundImageSettingsProps = {
  backgroundImage: ViewMap;
  setBackgroundImage: (updated: ViewMap) => void;
};

const DISPLAY_MODE_OPTIONS: { value: BackgroundImageDisplayMode; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "fullCenterFixed", label: "Full Center (Fixed)" },
  { value: "repeat", label: "Repeat" },
  { value: "fillWidth", label: "Fill 100% Width" },
  { value: "fillWidthHeight", label: "Fill 100% Width & Height" },
  { value: "contain", label: "Scales without cropping" },
];

const POSITIONS: BackgroundImagePosition[] = [
  "top-left", "top-center", "top-right",
  "center-left", "center-center", "center-right",
  "bottom-left", "bottom-center", "bottom-right",
];

const PositionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  background: #f1f3f5;
  border-radius: 6px;
  padding: 8px;
  width: fit-content;
  margin-bottom: 10px;
`;

const PositionDot = styled.button<{ $active?: boolean }>`
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: ${({ $active }) => ($active ? "#007bff" : "#cfd4da")};
  cursor: pointer;
  padding: 0;
  transition: background 0.15s;

  &:hover {
    background: ${({ $active }) => ($active ? "#007bff" : "#9aa1a8")};
  }
`;

const SubLabel = styled.div`
  font-size: 12px;
  color: #6c757d;
  margin: 8px 0 4px;
`;

type DarkenPreset = { key: string; label: string; value: string | undefined };

const DARKEN_PRESETS: DarkenPreset[] = [
  { key: "none",   label: "None",   value: undefined },
  { key: "light",  label: "Light",  value: "rgba(0, 0, 0, 0.25)" },
  { key: "medium", label: "Medium", value: "rgba(0, 0, 0, 0.5)" },
  { key: "dark",   label: "Dark",   value: "rgba(0, 0, 0, 0.75)" },
];

const PresetRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
`;

const PresetChip = styled.button<{ $active?: boolean; $swatch?: string }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid ${({ $active }) => ($active ? "#007bff" : "#d8dbdf")};
  background: ${({ $active }) => ($active ? "#e7f1ff" : "#fff")};
  color: #333;
  cursor: pointer;
  transition: all 0.15s;

  &:hover { border-color: #007bff; }

  &::before {
    content: '';
    display: ${({ $swatch }) => ($swatch ? "block" : "none")};
    width: 12px;
    height: 12px;
    border-radius: 3px;
    background: ${({ $swatch }) => $swatch ?? "transparent"};
    background-image:
      linear-gradient(45deg, #ddd 25%, transparent 25%),
      linear-gradient(-45deg, #ddd 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #ddd 75%),
      linear-gradient(-45deg, transparent 75%, #ddd 75%);
    background-size: 6px 6px;
    background-position: 0 0, 0 3px, 3px -3px, -3px 0px;
    border: 1px solid #ccc;
    box-shadow: inset 0 0 0 12px ${({ $swatch }) => $swatch ?? "transparent"};
  }
`;

const matchesPreset = (overlay?: string): string => {
  if (!overlay) return "none";
  const found = DARKEN_PRESETS.find((p) => p.value === overlay);
  return found ? found.key : "custom";
};

export const BackgroundImageSettings: React.FC<BackgroundImageSettingsProps> = ({
  backgroundImage,
  setBackgroundImage,
}) => {
  const { viewMode } = useAppContext();
  const [showModal, setShowModal] = useState(false);
  const [showOverlayPicker, setShowOverlayPicker] = useState(false);
  const overlayCircleRef = useRef<HTMLDivElement>(null);

  const current: BackgroundImageValue = backgroundImage[viewMode] ?? {};

  const update = (patch: Partial<BackgroundImageValue>) => {
    const next: BackgroundImageValue = { ...current, ...patch };
    setBackgroundImage({ ...backgroundImage, [viewMode]: next });
  };

  const updateUrl = (url: string, assetId: string | null = null) => {
    if (!url) {
      setBackgroundImage({ ...backgroundImage, [viewMode]: undefined });
      return;
    }
    const next: BackgroundImageValue = {
      displayMode: current.displayMode ?? "fullCenterFixed",
      position: current.position ?? "center-center",
      ...current,
      url,
      // Track Asset id when uploaded via media library. Manual URL paste
      // clears it (assetId omitted from call).
      assetId: assetId ?? undefined,
    };
    setBackgroundImage({ ...backgroundImage, [viewMode]: next });
  };

  const handleReset = () => {
    if (!current.url) return;
    setBackgroundImage({ ...backgroundImage, [viewMode]: undefined });
  };

  const handleOverlayChange = (color: { rgba: { r: number; g: number; b: number; a?: number } }) => {
    update({ overlay: rgbaToString(color.rgba) });
  };

  const displayMode = current.displayMode ?? "default";
  const position = current.position ?? "center-center";
  const overlayColor = current.overlay ?? "rgba(0, 0, 0, 0.5)";
  const activePreset = matchesPreset(current.overlay);
  const showPositionGrid = !!current.url && displayMode !== "fillWidthHeight";

  return (
    <SettingsGroup>
      <Label>
        Background Image
        <ViewModeIcon />
        <ResetIcon onClick={handleReset} title="Remove Image">
          <i className="fas fa-ban"></i>
        </ResetIcon>
      </Label>
      <InputWrapper>
        <Input
          type="text"
          placeholder="Enter image URL"
          value={current.url ?? ""}
          onChange={(e) => updateUrl(e.target.value)}
        />
        <UploadIcon onClick={() => setShowModal(true)} title="Upload Image">
          <i className="fas fa-cloud-upload-alt"></i>
        </UploadIcon>
      </InputWrapper>

      {current.url && (
        <>
          <SubLabel>Display image</SubLabel>
          <Select
            value={displayMode}
            onChange={(e) => update({ displayMode: e.target.value as BackgroundImageDisplayMode })}
          >
            {DISPLAY_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>

          {showPositionGrid && (
            <>
              <SubLabel>Position</SubLabel>
              <PositionGrid>
                {POSITIONS.map((pos) => (
                  <PositionDot
                    key={pos}
                    $active={position === pos}
                    onClick={() => update({ position: pos })}
                    title={pos}
                  />
                ))}
              </PositionGrid>
            </>
          )}

          <SubLabel>Darken background</SubLabel>
          <PresetRow>
            {DARKEN_PRESETS.map((preset) => (
              <PresetChip
                key={preset.key}
                $active={activePreset === preset.key}
                $swatch={preset.value}
                onClick={() => update({ overlay: preset.value })}
                title={preset.label}
              >
                {preset.label}
              </PresetChip>
            ))}
            <div ref={overlayCircleRef} style={{ display: "inline-block" }}>
              <PresetChip
                $active={activePreset === "custom"}
                $swatch={activePreset === "custom" ? overlayColor : undefined}
                onClick={() => setShowOverlayPicker(true)}
                title="Custom color"
              >
                <i className="fas fa-palette" style={{ fontSize: 11 }}></i>
                Custom
              </PresetChip>
            </div>
            {showOverlayPicker && (
              <ColorPickerPopup
                color={activePreset === "custom" ? overlayColor : "rgba(0, 0, 0, 0.5)"}
                onChange={handleOverlayChange}
                onClose={() => setShowOverlayPicker(false)}
                anchorEl={overlayCircleRef.current}
              />
            )}
          </PresetRow>
        </>
      )}

      {showModal && (
        <ImageUploadModal
          onClose={() => setShowModal(false)}
          onSelect={(url, assetId) => updateUrl(url, assetId)}
        />
      )}
    </SettingsGroup>
  );
};
