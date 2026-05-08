import React, { useState, useEffect } from "react";
import {
  Label,
  SettingsGroup,
  InputWrapper,
  Input,
  CheckboxWrapper,
  CheckboxInput,
  UploadIcon,
  SliderControl,
  Select,
  Divider
} from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon";
import ImageUploadModal from "./ImageUploadModal";
import { ImageDetailProps } from "../../elements/ElementProps";
import { useAppContext } from "../../contexts/AppContext";

type ImageDetailSettingsProps = {
  imageDetail?: ImageDetailProps;
  setImageDetail: (updatedImage: any) => void;
};

export const ImageDetailSettings: React.FC<ImageDetailSettingsProps> = ({
  imageDetail = {},
  setImageDetail,
}) => {
  const { viewMode } = useAppContext();
  const [showModal, setShowModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [actualImageSize, setActualImageSize] = useState({ width: 0, height: 0 });
  const [isImageLoading, setIsImageLoading] = useState(false);

  // Set default values if properties are undefined
  const imageUrl = imageDetail?.url || "";
  const imageAction = imageDetail?.action || "none";
  const imageLink = imageDetail?.link || "";
  const openNewTab = imageDetail?.openNewTab || false;
  const altText = imageDetail?.alt || "";
  const imageWidth = imageDetail?.width;
  const imageMobileWidth = imageDetail?.mobileWidth;

  // Per-viewport fill-width semantics:
  // - desktop:  width === undefined  → fills 100%
  // - mobile:   mobileWidth === 0    → explicit fill (override desktop)
  //             mobileWidth === undef AND width === undef → inherits desktop fill
  //             else fixed mobile width OR inherit desktop fixed width
  const isFullWidth = viewMode === "desktop"
    ? imageWidth === undefined
    : imageMobileWidth === 0 || (imageMobileWidth === undefined && imageWidth === undefined);

  // Slider current value — viewport-aware. Mobile falls back to desktop
  // value for display when mobileWidth is unset (matches what renders).
  const currentWidth = viewMode === "desktop"
    ? imageWidth
    : (imageMobileWidth ?? imageWidth);

  // Load and get actual image dimensions when URL changes
  useEffect(() => {
    if (imageUrl) {
      setIsImageLoading(true);
      const img = new Image();
      img.onload = () => {
        const newWidth = img.naturalWidth;
        const newHeight = img.naturalHeight;
        
        setActualImageSize({
          width: newWidth,
          height: newHeight
        });
        
        // Auto-clamp desktop width down to natural size when image loads
        // (legacy preventing-upscale behavior). Scoped to desktop only —
        // mobileWidth is treated as designer's deliberate override.
        if (imageWidth !== undefined && imageWidth > newWidth) {
          updateImageProperty("width", newWidth);
        }
        
        setIsImageLoading(false);
      };
      img.onerror = () => {
        setActualImageSize({ width: 800, height: 600 }); // Default fallback
        setIsImageLoading(false);
      };
      img.src = imageUrl;
    } else {
      setActualImageSize({ width: 0, height: 0 });
    }
  }, [imageUrl]);

  // Update image properties
  const updateImageProperty = (property: string, value: any) => {
    setImageDetail({
      ...imageDetail,
      [property]: value,
    });
  };

  // Handle image file selection
  const handleImageSelect = (url: string) => {
    updateImageProperty("url", url);
  };

  // Handle link file selection
  const handleLinkSelect = (url: string) => {
    updateImageProperty("link", url);
  };

  // Reset image url
  const handleResetImage = () => {
    updateImageProperty("url", undefined);
  };

  // Reset link
  const handleResetLink = () => {
    updateImageProperty("link", "");
  };

  // Compute a sane initial width when leaving fill-mode for a viewport.
  // Same heuristic regardless of which viewport — the slider is bounded
  // by maxSliderValue anyway and the result feels reasonable for both.
  const computeDefaultWidth = (): number => {
    const actualWidth = actualImageSize.width > 0 ? actualImageSize.width : 800;
    if (actualWidth < 100)   return Math.max(actualWidth, 100);
    if (actualWidth > 2000)  return Math.min(800, Math.round(actualWidth * 0.3));
    if (actualWidth > 1200)  return Math.min(600, Math.round(actualWidth * 0.4));
    if (actualWidth > 800)   return Math.round(actualWidth * 0.5);
    return Math.max(300, Math.round(actualWidth * 0.7));
  };

  // Handle full-width toggle — viewport-aware:
  // Desktop: tick → width=undefined; untick → width=computed
  // Mobile:  tick → mobileWidth=0 (explicit fill, overrides desktop fixed)
  //          untick → mobileWidth=computed
  const handleFullWidthToggle = (isChecked: boolean) => {
    if (viewMode === "desktop") {
      if (isChecked) {
        const { width, ...rest } = imageDetail;
        setImageDetail(rest);
      } else {
        updateImageProperty("width", computeDefaultWidth());
      }
    } else {
      if (isChecked) {
        // If desktop is also fill (no width), clearing mobileWidth keeps
        // it inheriting → still fills. If desktop has a fixed width, set
        // sentinel 0 to explicitly override.
        if (imageWidth === undefined) {
          const { mobileWidth, ...rest } = imageDetail;
          setImageDetail(rest);
        } else {
          updateImageProperty("mobileWidth", 0);
        }
      } else {
        updateImageProperty("mobileWidth", computeDefaultWidth());
      }
    }
  };


  // Determine max value for the slider.
  // SVG is vector — natural width is just authoring metadata, not a real
  // upper bound. Cap at 500 so drag precision stays usable for the common
  // icon/logo/illustration use cases.
  const isSvg = /\.svg(\?|#|$)/i.test(imageUrl);
  const maxSliderValue = isSvg
    ? 500
    : actualImageSize.width > 0 ? actualImageSize.width : 2000;

  return (
    <SettingsGroup>
      <Label>Image file</Label>
      <InputWrapper>
        <Input
          type="text"
          placeholder="Enter image URL"
          value={imageUrl}
          onChange={(e) => updateImageProperty("url", e.target.value)}
        />
        <UploadIcon onClick={() => setShowModal(true)} title="Upload Image">
          <i className="fas fa-cloud-upload-alt"></i>
        </UploadIcon>
        {imageUrl && (
          <UploadIcon onClick={handleResetImage} title="Remove Image">
            <i className="fas fa-times"></i>
          </UploadIcon>
        )}
      </InputWrapper>
      <Divider/>
      <Label>Action when image clicked</Label>
      <Select
        value={imageAction}
        onChange={(e) => updateImageProperty("action", e.target.value)}
      >
        <option value="none">None</option>
        <option value="link">Open URL</option>
      </Select>
      <Divider/>
      {imageAction === "link" && (
        <>
          <Label>Link</Label>
          <InputWrapper>
            <Input
              type="text"
              placeholder="Select file or paste URL"
              value={imageLink}
              onChange={(e) => updateImageProperty("link", e.target.value)}
            />
            <UploadIcon onClick={() => setShowLinkModal(true)} title="Browse Files">
              <i className="fas fa-folder-open"></i>
            </UploadIcon>
            {imageLink && (
              <UploadIcon onClick={handleResetLink} title="Clear Link">
                <i className="fas fa-times"></i>
              </UploadIcon>
            )}
          </InputWrapper>
          <Divider/>
          <CheckboxWrapper>
            <Label>Open in a new window</Label>
            <CheckboxInput
              type="checkbox"
              checked={openNewTab}
              onChange={(e) => updateImageProperty("openNewTab", e.target.checked)}
            />
          </CheckboxWrapper>
          <Divider/>
        </>
      )}

      <Label>Alt text</Label>
      <InputWrapper>
        <Input
          type="text"
          placeholder=""
          value={altText}
          onChange={(e) => updateImageProperty("alt", e.target.value)}
        />
      </InputWrapper>

      <Divider/>
      
      <CheckboxWrapper>
        <Label>Fill 100% width <ViewModeIcon /></Label>
        <CheckboxInput
          type="checkbox"
          checked={isFullWidth}
          onChange={(e) => handleFullWidthToggle(e.target.checked)}
        />
      </CheckboxWrapper>
      
      {!isFullWidth && (
        <>
          <Divider/>
          <Label>
            Image size <ViewModeIcon />
            <small style={{ fontWeight: 'normal', color: '#777' }}>
              {isImageLoading
                ? " (loading...)"
                : actualImageSize.width > 0
                  ? ` (${actualImageSize.width}px × ${actualImageSize.height}px)`
                  : ""}
              {viewMode === "mobile" && imageMobileWidth === undefined && imageWidth !== undefined
                ? " — inheriting desktop"
                : ""}
            </small>
          </Label>
          <SliderControl
            value={currentWidth || (actualImageSize.width > 0 ? actualImageSize.width : 800)}
            min={8}
            max={maxSliderValue}
            step={1}
            onChange={(value) => {
              if (viewMode === "desktop") updateImageProperty("width", value);
              else updateImageProperty("mobileWidth", value);
            }}
          />
        </>
      )}

      {showModal && (
        <ImageUploadModal
          onClose={() => setShowModal(false)}
          onSelect={handleImageSelect}
        />
      )}

      {showLinkModal && (
        <ImageUploadModal
          onClose={() => setShowLinkModal(false)}
          onSelect={handleLinkSelect}
        />
      )}
    </SettingsGroup>
  );
};