import React, { useState, useEffect, useRef } from "react";
import styled from "styled-components";

// ✅ Wrapper for each settings section

export const SettingsGroupLarge = styled.div`
  margin-bottom: 20px;
  padding: 10px;
  background-color: #fbfbfb;
  border-radius: 10px;
  border: 1px solid #f0f0f0;
  .SettingsGroup{
    border: none !important;
    padding: 10px 0;
    margin-bottom: 5px;
  }
`;


export const SettingsGroup = styled.div.attrs({
  className: "SettingsGroup",
})`
  margin-bottom: 20px;
  padding: 10px;
  background-color: #fbfbfb;
  border-radius: 10px;
  border: 1px solid #f0f0f0;
`;

export const Label = styled.label<{ $small?: boolean }>`
  display: block;
  font-weight: 500;
  margin-bottom: 5px;
  margin-top: ${(props) => (props.$small ? "10px" : "0")};
  font-size: ${(props) => (props.$small ? "12.5px" : "14px")};
`;

export const IconButtonGroup = styled.div`
  display: flex;
  gap: 8px;
  background: #f1f3f5;
  border-radius: 6px;
  justify-content: space-between;
`;

export const IconButtonAlign = styled.button<{ $active?: boolean }>`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border: none;
  background: ${({ $active }) => ($active ? "#e3e6ea" : "transparent")};
  color: ${({ $active }) => ($active ? "#000" : "#6c757d")};
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;

  &:hover {
    background: #e3e6ea;
    color: #000;
  }

  i {
    font-size: 15px;
  }
`;
// ✅ Styled button with active state
export const IconButton = styled.button<{ $active?: boolean }>`
  background: none;
  border: none;
  cursor: pointer;
  padding: 5px;
  font-size: 16px;
  color: ${({ $active }) => ($active ? "#007bff" : "#444")};
  
  &:hover {
    color: #007bff;
  }
`;

export const ResetIcon = styled(IconButton)`
  font-size: 14px;
  margin-left: 5px;
  color: gray;
  
  &:hover {
    color: black;
  }
`;

// ✅ Styled Range Input Wrapper
const RangeWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

// ✅ Styled Input for Range Slider
const StyledRange = styled.input`
  flex: 1;
  appearance: none;
  height: 5px;
  background: #ddd;
  border-radius: 5px;
  outline: none;
  opacity: 0.9;
  transition: opacity 0.2s;

  &::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    background: #007bff;
    border-radius: 50%;
    cursor: pointer;
  }

  &:hover {
    opacity: 1;
  }
`;

// ✅ Styled Numeric Input
const StyledInput = styled.input`
  width: 60px;
  padding: 5px;
  border: 1px solid #ccc;
  border-radius: 4px;
  text-align: center;
`;

// ✅ Control container for UI grouping
export const ControlContainer = styled.div`
  display: flex;
  align-items: center;
`;

// ✅ Export SliderControl with range & input
export const SliderControl: React.FC<{
  label?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  hideLabel?: boolean;
}> = ({ label, value, min = 8, max = 100, step = 1, onChange, hideLabel = false }) => {
  // The thumb is driven by LOCAL state (updated synchronously) so it tracks the
  // cursor smoothly, while the actual prop commit (which re-renders the node +
  // settings panel) is coalesced to one per animation frame. Without this every
  // pixel of drag fired a setProp → a stutter on heavier elements.
  const [local, setLocal] = useState(value);
  const draggingRef = useRef(false);
  const rafRef = useRef(0);
  const pendRef = useRef<number | null>(null);

  useEffect(() => { if (!draggingRef.current) setLocal(value); }, [value]);
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const commit = (v: number) => {
    setLocal(v);
    pendRef.current = v;
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        if (pendRef.current != null) onChange(pendRef.current);
      });
    }
  };

  return (
    <div>
      {!hideLabel && <Label>{label}</Label>}
      <RangeWrapper>
        <StyledRange
          type="range"
          min={min}
          max={max}
          step={step}
          value={local}
          onPointerDown={() => { draggingRef.current = true; }}
          onPointerUp={() => { draggingRef.current = false; }}
          onPointerCancel={() => { draggingRef.current = false; }}
          onChange={(e) => commit(parseInt(e.target.value))}
        />
        <StyledInput
          type="number"
          min={min}
          max={max}
          value={local}
          onChange={(e) => {
            const newValue = parseInt(e.target.value) || min;
            commit(newValue > max ? max : newValue < min ? min : newValue);
          }}
        />
      </RangeWrapper>
    </div>
  );
};



// ✅ Styled Select dropdown
export const Select = styled.select`
  width: 100%;
  padding: 6px 8px;
  margin-bottom: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  outline: none;
  transition: all 0.2s ease-in-out;
  &:hover {
    border-color: #007bff;
  }

  &:focus {
    border-color: #007bff;
    box-shadow: 0 0 5px rgba(0, 123, 255, 0.5);
  }
`;

export const ColorPickerWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px; 
`;

export const ColorCircle = styled.div<{ color: string }>`
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background-color: ${({ color }) => color};
  border: 2px solid #ccc;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;

  &:hover {
    border-color: black;
  }
`;

export const ResetIconLarge = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 28px;
  color: gray;
  display: flex;
  align-items: center;
  padding: 5px;

  &:hover {
    color: black;
  }
`;

export const LightButton = styled.button`
  background-color: #ffffff;
  color: #333;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 10px 20px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background-color: #f8f9fa;
    border-color: #adb5bd;
  }

  &:active {
    background-color: #e9ecef;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

export const ColorInput = styled.input`
  visibility: hidden;
  width: 0;
  height: 0;
  position: relative;
  left: -70px;
`;


export const InputWrapper = styled.div`
  display: flex;
  align-items: center;
  border: 1px solid #ddd;
  border-radius: 5px;
  background: #fff;
  overflow: hidden;

  input{
    border: none !important;
    border-radius: 0 !important;
  }
`;


export const InputGroup = styled.div`
  margin-bottom: 15px;
`;

export const Input = styled.input`
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 5px;
  font-size: 14px;
  &:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }
  &::placeholder {
    color: #bbb;
  }
`;

export const Textarea = styled.textarea`
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 5px;
  font-size: 14px;
  resize: vertical;
  min-height: 72px;
  font-family: inherit;
  line-height: 1.5;
  &:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }
  &::placeholder {
    color: #bbb;
  }
`;

export const UploadIcon = styled.button`
  background: #f1f1f1;
  border: none;
  padding: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #666;
  &:hover {
    background: #ddd;
  }
`;

export const HelpIcon = styled.span`
  margin-left: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #888;

  &:hover {
    color: #2196F3;
  }
`;


interface TooltipProps {
  $show: boolean;
}

export const Tooltip = styled.div<TooltipProps>`
  position: absolute;
  background: #fff;
  color: #666;
  padding: 8px 12px;
  border-radius: 5px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  font-size: 12px;
  width: 180px;
  bottom: 150%;
  left: 20%;
  transform: translateX(-50%);
  margin-bottom: 6px;
  z-index: 11;
  white-space: normal;
  word-wrap: break-word;
  opacity: ${({ $show }) => ($show ? 1 : 0)};
  visibility: ${({ $show }) => ($show ? "visible" : "hidden")};
  transition: opacity 0.2s ease-in-out, visibility 0.2s ease-in-out;

  &::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border-width: 6px;
    border-style: solid;
    border-color: #fff transparent transparent transparent;
  }
`;

// Wrapper that lays out the checkbox and its label
export const CheckboxWrapper = styled.div`
    display: flex;
    position: relative;
    padding: 2px 0px;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    label {
        flex-basis: 250px;
        margin-bottom: 7px;
        font-size: 13px;
        display: block;
    }
    input{
      width: 50px;
      position: relative;
      float: right;
    }
`;

// Custom checkbox input
export const CheckboxInput = styled.input.attrs({ type: "checkbox" })`
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: #007bff;
`;

interface DividerProps {
  thickness?: string;  // Divider thickness (default: 1px)
  color?: string;      // Color (default: #ccc)
  margin?: string;     // Top/bottom spacing (default: 16px)
  type?: "solid" | "dashed" | "dotted"; // Line style (default: solid)
}

export const Divider = styled.div<DividerProps>`
  width: 100%;
  height: ${({ thickness }) => thickness || "1px"};
  background-color: ${({ color }) => color || "transparent"};
  margin: ${({ margin }) => margin || "5px 0"};
`;

export const TwoColumnGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 15px;
`;

export const CompactInputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

export const TextArea = styled.textarea`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-height: 80px;
  resize: vertical;
  
  &:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }
`;