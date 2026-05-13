"use client";

import { useMemo, useState } from "react";

function extractFg(inner: string): string {
  const re =
    /fill\s*=\s*["']?(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|[a-zA-Z]+)["']?/g;
  for (const m of inner.matchAll(re)) {
    const v = m[1].toLowerCase();
    if (v === "none" || v === "transparent") continue;
    return m[1];
  }
  return "";
}

function extract(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return { error: "" as string };

  const urlMatch =
    trimmed.match(/url\(\s*"([^"]+)"\s*\)/i) ??
    trimmed.match(/url\(\s*'([^']+)'\s*\)/i) ??
    trimmed.match(/url\(\s*([^)]+?)\s*\)/i);
  const candidate = urlMatch
    ? urlMatch[1].trim()
    : trimmed.startsWith("data:image/svg+xml")
      ? trimmed
      : null;
  const dataUrl = candidate?.startsWith("data:image/svg+xml")
    ? candidate
    : null;
  if (!dataUrl) return { error: "Không tìm thấy data:image/svg+xml URL" };

  const comma = dataUrl.indexOf(",");
  const encoded = dataUrl.slice(comma + 1);
  let decoded: string;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    return { error: "URL encoding không hợp lệ" };
  }

  const doc = new DOMParser().parseFromString(decoded, "image/svg+xml");
  const root = doc.documentElement;
  if (root.tagName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) {
    return { error: "Decoded content không phải SVG hợp lệ" };
  }

  const width = root.getAttribute("width") ?? "100";
  const height = root.getAttribute("height") ?? "100";
  const inner = root.innerHTML;

  const bgMatch = trimmed.match(/background-color:\s*([^;}\n]+)/i);
  const bgColor = bgMatch ? bgMatch[1].trim() : "";
  const fgColor = extractFg(inner);

  return { width, height, inner, bgColor, fgColor, error: "" };
}

function applyFg(inner: string, originalFg: string, newFg: string): string {
  if (!originalFg || !newFg) return inner;
  if (originalFg.toLowerCase() === newFg.toLowerCase()) return inner;
  const escaped = originalFg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return inner.replace(
    new RegExp(`(fill\\s*=\\s*["']?)${escaped}(["']?)`, "gi"),
    `$1${newFg}$2`,
  );
}

function buildSvg(
  width: string,
  height: string,
  inner: string,
  bgColor: string,
  spacing: number,
) {
  const w = parseFloat(width) || 0;
  const h = parseFloat(height) || 0;
  const tileW = w + spacing;
  const tileH = h + spacing;
  const offset = spacing / 2;
  const innerContent =
    spacing > 0
      ? `<g transform="translate(${offset}, ${offset})">${inner.trim()}</g>`
      : inner.trim();
  const bgRect =
    bgColor && bgColor !== "transparent"
      ? `<rect width="100%" height="100%" fill="${bgColor}"/>\n  `
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
  ${bgRect}<defs>
    <pattern id="p" x="0" y="0" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse">
      ${innerContent}
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#p)"/>
</svg>`;
}

function toHex(c: string): string {
  if (!c) return "";
  const v = c.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return (
      "#" +
      v
        .slice(1)
        .split("")
        .map((ch) => ch + ch)
        .join("")
        .toLowerCase()
    );
  }
  return "";
}

export default function PatternToSvgPage() {
  const [input, setInput] = useState("");
  const [bgOverride, setBgOverride] = useState("");
  const [fgOverride, setFgOverride] = useState("");
  const [spacing, setSpacing] = useState(0);
  const [filename, setFilename] = useState("pattern.svg");

  const parsed = useMemo(() => extract(input), [input]);

  const svg = useMemo(() => {
    if (parsed.error || !parsed.inner) return "";
    const bg = bgOverride.trim() || parsed.bgColor || "";
    const fg = fgOverride.trim();
    const inner = applyFg(parsed.inner, parsed.fgColor || "", fg);
    return buildSvg(parsed.width!, parsed.height!, inner, bg, spacing);
  }, [parsed, bgOverride, fgOverride, spacing]);

  const previewUrl = useMemo(() => {
    if (!svg) return "";
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }, [svg]);

  const download = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".svg") ? filename : `${filename}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = () => {
    if (svg) navigator.clipboard.writeText(svg);
  };

  const bgPickerValue =
    toHex(bgOverride) || toHex(parsed.bgColor || "") || "#ffffff";
  const fgPickerValue =
    toHex(fgOverride) || toHex(parsed.fgColor || "") || "#000000";

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-bold mb-1">Hero Patterns → SVG</h1>
      <p className="text-sm text-gray-500 mb-6">
        Paste CSS từ Hero Patterns (cả block <code>background-color</code> +{" "}
        <code>background-image: url(...)</code>) → preview tile + tải SVG
        self-tiling.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="block text-sm font-medium">CSS snippet</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`background-color: #f4f8f7;\nbackground-image: url("data:image/svg+xml,...");`}
            className="w-full h-64 rounded-lg border border-gray-300 p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                Background color
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={bgPickerValue}
                  onChange={(e) => setBgOverride(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-gray-300"
                />
                <input
                  type="text"
                  value={bgOverride}
                  onChange={(e) => setBgOverride(e.target.value)}
                  placeholder={parsed.bgColor || "transparent"}
                  className="flex-1 rounded-lg border border-gray-300 p-2 text-sm font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Foreground color
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={fgPickerValue}
                  onChange={(e) => setFgOverride(e.target.value)}
                  disabled={!parsed.fgColor}
                  className="h-9 w-12 cursor-pointer rounded border border-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <input
                  type="text"
                  value={fgOverride}
                  onChange={(e) => setFgOverride(e.target.value)}
                  placeholder={parsed.fgColor || "(không phát hiện)"}
                  disabled={!parsed.fgColor}
                  className="flex-1 rounded-lg border border-gray-300 p-2 text-sm font-mono disabled:bg-gray-100"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Spacing: <span className="font-mono">{spacing}px</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={200}
                step={1}
                value={spacing}
                onChange={(e) => setSpacing(Number(e.target.value))}
                className="flex-1"
              />
              <input
                type="number"
                min={0}
                value={spacing}
                onChange={(e) =>
                  setSpacing(Math.max(0, Number(e.target.value) || 0))
                }
                className="w-20 rounded-lg border border-gray-300 p-2 text-sm font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Filename</label>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-2 text-sm"
            />
          </div>

          <p className="text-xs text-gray-400">
            Để trống ô màu = giữ giá trị auto-detect.
          </p>

          {parsed.error && (
            <p className="text-sm text-red-600">{parsed.error}</p>
          )}
          {!parsed.error && parsed.inner && (
            <p className="text-xs text-gray-500">
              Tile: {parsed.width}×{parsed.height}
              {spacing > 0
                ? ` → ${parseFloat(parsed.width!) + spacing}×${parseFloat(parsed.height!) + spacing}`
                : ""}
              {parsed.bgColor ? ` · bg: ${parsed.bgColor}` : ""}
              {parsed.fgColor ? ` · fg: ${parsed.fgColor}` : ""}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={download}
              disabled={!svg}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
            >
              Download SVG
            </button>
            <button
              type="button"
              onClick={copy}
              disabled={!svg}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
            >
              Copy SVG
            </button>
            <button
              type="button"
              onClick={() => {
                setBgOverride("");
                setFgOverride("");
              }}
              disabled={!bgOverride && !fgOverride}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
            >
              Reset colors
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium">Preview</label>
          <div className="aspect-video w-full overflow-hidden rounded-lg border border-gray-300">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="pattern preview"
                className="w-full h-full"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                Paste CSS để xem preview
              </div>
            )}
          </div>

          {svg && (
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
                Xem SVG output
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 font-mono">
                {svg}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
