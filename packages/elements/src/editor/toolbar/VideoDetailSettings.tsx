import React from "react";
import {
  Label,
  SettingsGroup,
  InputWrapper,
  Input,
  UploadIcon,
  Select,
  Divider
} from "../common/SettingsUI";
import { VideoDetailProps } from "../../elements/ElementProps";

type VideoDetailSettingsProps = {
  videoDetail?: VideoDetailProps;
  setVideoDetail: (updatedVideo: any) => void;
};

export const VideoDetailSettings: React.FC<VideoDetailSettingsProps> = ({
  videoDetail = {},
  setVideoDetail,
}) => {
  // Set default values if properties are undefined
  const videoUrl = videoDetail?.url || "";
  const videoType = videoDetail?.videoType || "direct";
  const autoPlay = videoDetail?.autoPlay || false;
  const controls = videoDetail?.controls || false;
  const aspectRatio = videoDetail?.aspectRatio || "16:9";

  // Update video properties
  const updateVideoProperty = (property: string, value: any) => {
    setVideoDetail({
      ...videoDetail,
      [property]: value,
    });
  };

  // Reset video url
  const handleResetVideo = () => {
    updateVideoProperty("url", "");
  };

  return (
    <SettingsGroup>
      <Label>Video type</Label>
      <Select
        value={videoType}
        onChange={(e) => updateVideoProperty("videoType", e.target.value)}
      >
        <option value="direct">Direct link</option>
      </Select>

      <Divider />

      <Label>URL</Label>
      <InputWrapper>
        <Input
          type="text"
          placeholder="YouTube, Vimeo, Facebook, Twitch, Dailymotion, Wistia, MP4…"
          value={videoUrl}
          onChange={(e) => updateVideoProperty("url", e.target.value)}
        />
        {videoUrl && (
          <UploadIcon onClick={handleResetVideo} title="Clear URL">
            <i className="fas fa-times"></i>
          </UploadIcon>
        )}
      </InputWrapper>

      <Divider />

      <Label>Aspect ratio</Label>
      <Select
        value={aspectRatio}
        onChange={(e) => updateVideoProperty("aspectRatio", e.target.value)}
      >
        <option value="16:9">16:9</option>
        <option value="4:3">4:3</option>
        <option value="1:1">1:1</option>
        <option value="9:16">9:16</option>
      </Select>

      <Divider />

      <Label>Auto play</Label>
      <Select
        value={autoPlay ? "on" : "off"}
        onChange={(e) => updateVideoProperty("autoPlay", e.target.value === "on")}
      >
        <option value="off">Off</option>
        <option value="on">On</option>
      </Select>

      <Divider />

      <Label>Controls</Label>
      <Select
        value={controls ? "on" : "off"}
        onChange={(e) => updateVideoProperty("controls", e.target.value === "on")}
      >
        <option value="off">Off</option>
        <option value="on">On</option>
      </Select>
    </SettingsGroup>
  );
};