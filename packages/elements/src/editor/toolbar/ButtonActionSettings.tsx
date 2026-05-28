import React from "react";
import {
  Label,
  SettingsGroup,
  InputWrapper,
  Input,
  Select,
  Divider,
  CheckboxWrapper,
  CheckboxInput,
} from "../common/SettingsUI";

type ButtonActionSettingsProps = {
  action?: string;
  linkUrl?: string;
  redirectionType?: string;
  nofollow?: boolean;
  popup?: string;
  doubleOptIn?: boolean;
  updateProperty: (property: string, value: any) => void;
};

export const ButtonActionSettings: React.FC<ButtonActionSettingsProps> = ({
  action = "submit_form",
  linkUrl = "",
  redirectionType = "sameWindow",
  nofollow = false,
  doubleOptIn = false,
  updateProperty,
}) => {
  const showRedirectionOptions = action === "submit_form";
  const showUrlInput = action === "open_url";

  return (
    <SettingsGroup>
      <Label>Action when button clicked</Label>
      <Select
        value={action}
        onChange={(e) => updateProperty("action", e.target.value)}
      >
        <option value="submit_form">Submit form</option>
        <option value="open_url">Open URL</option>
        <option value="next_step_url">Next step URL</option>
        <option value="none">Do nothing</option>
      </Select>

      {showRedirectionOptions && (
        <>
          <Divider />
          <Label>Do you want to redirect users after contact registration?</Label>
          <Select
            value={redirectionType}
            onChange={(e) => updateProperty("redirectionType", e.target.value)}
          >
            <option value="nextStep">To the next step</option>
            <option value="customUrl">To a custom URL</option>
            <option value="noRedirection">No redirection</option>
          </Select>

          {redirectionType === "customUrl" && (
            <>
              <Divider />
              <Label>Redirection url</Label>
              <InputWrapper>
                <Input
                  type="text"
                  placeholder="Enter URL"
                  value={linkUrl}
                  onChange={(e) => updateProperty("linkUrl", e.target.value)}
                />
              </InputWrapper>
            </>
          )}

          <Divider />
          <CheckboxWrapper>
            <Label>Do you want to enable double opt-in on this form?</Label>
            <CheckboxInput
              type="checkbox"
              checked={doubleOptIn}
              onChange={(e) => updateProperty("doubleOptIn", e.target.checked)}
            />
          </CheckboxWrapper>
        </>
      )}

      {showUrlInput && (
        <>
          <Divider />
          <Label>URL</Label>
          <InputWrapper>
            <Input
              type="text"
              placeholder="https://… or #section-id"
              value={linkUrl}
              onChange={(e) => updateProperty("linkUrl", e.target.value)}
            />
          </InputWrapper>

          <Divider />
          <Label>Open in a new window</Label>
          <Select
            value={redirectionType}
            onChange={(e) => updateProperty("redirectionType", e.target.value)}
          >
            <option value="sameWindow">Open in same window</option>
            <option value="newWindow">Open in new window</option>
          </Select>

          <Divider />
          <CheckboxWrapper>
            <Label>Nofollow?</Label>
            <CheckboxInput
              type="checkbox"
              checked={nofollow}
              onChange={(e) => updateProperty("nofollow", e.target.checked)}
            />
          </CheckboxWrapper>
        </>
      )}
    </SettingsGroup>
  );
};