import React, { useCallback, useEffect, useState, useRef } from "react";
import { createPortal } from 'react-dom';
import Sketch from "@uiw/react-color-sketch";
import { rgbaToHex } from "../../../utils/helpers";

type ColorPickerPopupProps = {
  color: string;
  onChange: (color: any) => void;
  onClose: () => void;
  anchorEl?: HTMLElement | null;
};

// Sketch picker accepts hex (incl. 8-char #RRGGBBAA) but NOT CSS "rgba(...)".
// Normalize so alpha survives a reopen.
const normalizeForPicker = (input: string): string => {
  if (!input) return "#000000";
  if (input.startsWith("#")) return input;
  if (input.startsWith("rgb")) return rgbaToHex(input);
  return input;
};

const toHex2 = (n: number) => Math.round(n).toString(16).padStart(2, "0").toUpperCase();
const rgbaObjectToHex = (rgba: { r: number; g: number; b: number; a?: number }) => {
  const a = rgba.a ?? 1;
  const alphaHex = a < 1 ? toHex2(a * 255) : "";
  return `#${toHex2(rgba.r)}${toHex2(rgba.g)}${toHex2(rgba.b)}${alphaHex}`;
};

// Simple debounce utility (avoids lodash dependency)
function debounce<T extends (...args: any[]) => any>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout>;
  const debounced = (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

export const ColorPickerPopup: React.FC<ColorPickerPopupProps> = ({
  color,
  onChange,
  onClose,
  anchorEl
}) => {
  const [currentColor, setCurrentColor] = useState(() => normalizeForPicker(color));
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isPositioned, setIsPositioned] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const pickerWidth = 200;
      const pickerHeight = 300;

      let top = rect.bottom + window.scrollY + 5;
      let left = rect.left + window.scrollX;

      if (left + pickerWidth > window.innerWidth) {
        left = window.innerWidth - pickerWidth - 10;
      }

      if (top + pickerHeight > window.innerHeight + window.scrollY) {
        top = rect.top + window.scrollY - pickerHeight - 5;
      }

      setPosition({ top, left });
      setIsPositioned(true);
    }
  }, [anchorEl]);

  const debouncedOnChange = useCallback(
    debounce((newColor: any) => {
      onChange(newColor);
    }, 300),
    [onChange]
  );

  const handleColorChange = (newColor: any) => {
    // Use 8-char hex (#RRGGBBAA) so alpha survives controlled re-renders.
    // newColor.hex from @uiw/react-color is 6-char (no alpha).
    const hexWithAlpha = newColor.rgba ? rgbaObjectToHex(newColor.rgba) : newColor.hex;
    setCurrentColor(hexWithAlpha);
    debouncedOnChange(newColor);
  };

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    return () => {
      debouncedOnChange.cancel();
    };
  }, [debouncedOnChange]);

  useEffect(() => {
    setCurrentColor(normalizeForPicker(color));
  }, [color]);

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        pointerEvents: "none"
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "all",
          backgroundColor: "transparent"
        }}
        onClick={handleBackgroundClick}
      />

      <div
        ref={pickerRef}
        style={{
          position: "absolute",
          top: position.top,
          left: position.left,
          pointerEvents: "all",
          opacity: isPositioned ? 1 : 0,
          transition: "opacity 0.15s ease",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
          borderRadius: "8px",
          overflow: "hidden"
        }}
      >
        <Sketch
          color={currentColor}
          disableAlpha={false}
          onChange={handleColorChange}
          style={{
            boxShadow: "none"
          }}
        />
      </div>
    </div>,
    document.body
  );
};
