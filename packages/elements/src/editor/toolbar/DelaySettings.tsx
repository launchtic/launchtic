import React from "react";
import { Label, SettingsGroup, InputWrapper, Input } from "../common/SettingsUI";

type DelaySettingsProps = {
  delay?: number;
  setDelay: (updatedDelay?: number) => void;
};

export const DelaySettings: React.FC<DelaySettingsProps> = ({ delay, setDelay }) => {
  return (
    <SettingsGroup>
      <Label>Delay before displaying item:</Label>
      <InputWrapper>
        <Input
          min="1"
          step="1"
          placeholder="Enter delay in seconds..."
          value={delay ?? ""} 
          onChange={(e) => {
            const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
            if (value === undefined || (value >= 1 && !isNaN(value))) {
              setDelay(value);
            }
          }}
        />
      </InputWrapper>
    </SettingsGroup>
  );
};
