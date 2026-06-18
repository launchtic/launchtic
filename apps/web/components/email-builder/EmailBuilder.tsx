"use client";

// Craft.js email build surface (toolbox + canvas + settings). Page → Section →
// Column → content. value/onChange = Craft serialized JSON (stored in the email
// body); rendered to responsive HTML via MJML at preview/send time.

import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Editor, Frame, Element, useEditor, useNode } from "@craftjs/core";
import { Heading1, Type, MousePointerClick, Image as ImageIcon, Minus, MoveVertical, Square, Columns2, Columns3, ImagePlus, Copy, Trash2, Move, ArrowUp, ArrowLeft, Menu, Bold, Italic, Underline, Strikethrough, Monitor, Smartphone, X, Link2, Palette, Undo2, Redo2, Bookmark, BookmarkPlus, Share2, ChevronUp, ChevronDown } from "lucide-react";
import { STANDARD_VARIABLES, EMAIL_FONTS } from "@launchtic/email";
import MediaLibraryPicker from "../media/MediaLibraryPicker";
import { ColorSwatchButton, ColorPickerPopup } from "./ColorPicker";
import { SavedBlocksProvider, useSavedBlocks, extractSubtree, insertSavedBlock } from "./SavedBlocks";
import {
  EMAIL_RESOLVER, Page, Section, Column, EmailHeading, EmailText, EmailButton, EmailImage, EmailDivider, EmailSpacer, EmailNavbar, EmailSocial, DeviceContext,
} from "./blocks";

// Duplicate a node + its subtree (fresh ids), inserted right after it.
function duplicateNode(query: any, actions: any, id: string) {
  const tree: Record<string, any> = JSON.parse(query.serialize());
  const parent = tree[id]?.parent;
  if (!parent) return;
  const gid = () => "n" + Math.random().toString(36).slice(2, 10);
  const clone = (nid: string, newParent: string): string => {
    const orig = tree[nid];
    const nid2 = gid();
    const copy = JSON.parse(JSON.stringify(orig));
    copy.parent = newParent;
    copy.nodes = (orig.nodes ?? []).map((c: string) => clone(c, nid2));
    copy.linkedNodes = {};
    for (const [k, v] of Object.entries(orig.linkedNodes ?? {})) copy.linkedNodes[k] = clone(v as string, nid2);
    tree[nid2] = copy;
    return nid2;
  };
  const newRoot = clone(id, parent);
  const arr: string[] = tree[parent].nodes;
  arr.splice(arr.indexOf(id) + 1, 0, newRoot);
  actions.deserialize(JSON.stringify(tree));
}

// Per-node overlay: border on hover/select + floating toolbar (move / select
// parent / duplicate / delete). Wired via <Editor onRender>.
function RenderNode({ render }: { render: React.ReactElement }) {
  const { id } = useNode();
  const { actions, query, isActive } = useEditor((_, q) => ({ isActive: q.getEvent("selected").contains(id) }));
  const { isHover, dom, name, deletable, parent, connectors: { drag } } = useNode((node) => ({
    isHover: node.events.hovered,
    dom: node.dom,
    name: node.data.displayName as string,
    deletable: query.node(node.id).isDeletable(),
    parent: node.data.parent,
  }));
  const sb = useSavedBlocks();
  const [saveOpen, setSaveOpen] = useState(false);
  const [blockName, setBlockName] = useState("");
  const saveBlock = async () => {
    const nm = blockName.trim();
    if (!nm || !sb) return;
    const okSaved = await sb.save(nm, extractSubtree(JSON.parse(query.serialize()), id));
    if (okSaved) { setSaveOpen(false); setBlockName(""); }
  };
  const [, force] = useState(0);
  useEffect(() => {
    const h = () => force((n) => n + 1);
    window.addEventListener("scroll", h, true);
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("scroll", h, true); window.removeEventListener("resize", h); };
  }, []);
  useEffect(() => {
    if (!dom) return;
    dom.style.outline = isActive ? "2px solid #3b82f6" : isHover ? "1px solid #93c5fd" : "";
    dom.style.outlineOffset = (isActive || isHover) ? "-1px" : "";
    return () => { if (dom) { dom.style.outline = ""; dom.style.outlineOffset = ""; } };
  }, [dom, isActive, isHover]);

  if (id === "ROOT") return render;
  const rect = (isActive || isHover) ? dom?.getBoundingClientRect() : null;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <>
      {rect && createPortal(
        isActive ? (
          // Selected — full toolbar with actions.
          <div style={{ position: "fixed", top: Math.max(rect.top - 23, 2), left: rect.left, zIndex: 41 }}
            className="flex items-center gap-0.5 h-[22px] px-1 bg-blue-500 text-white text-[11px] rounded-t-md shadow-md">
            <span ref={(r) => { if (r) drag(r); }} title="Drag to move" className="px-0.5 cursor-grab"><Move size={12} /></span>
            <span className="px-1 font-medium">{name}</span>
            {parent && <button title="Select parent" onMouseDown={stop} onClick={() => (actions as any).selectNode(parent)} className="p-0.5 hover:bg-blue-600 rounded"><ArrowUp size={12} /></button>}
            <button title="Duplicate" onMouseDown={stop} onClick={() => duplicateNode(query, actions, id)} className="p-0.5 hover:bg-blue-600 rounded"><Copy size={12} /></button>
            {name === "Section" && sb?.available && <button title="Save as block" onMouseDown={stop} onClick={() => { setBlockName(""); setSaveOpen(true); }} className="p-0.5 hover:bg-blue-600 rounded"><BookmarkPlus size={12} /></button>}
            {deletable && <button title="Delete" onMouseDown={stop} onClick={() => actions.delete(id)} className="p-0.5 hover:bg-blue-600 rounded"><Trash2 size={12} /></button>}
          </div>
        ) : (
          // Hover only — just the name label (lighter).
          <div style={{ position: "fixed", top: Math.max(rect.top - 19, 2), left: rect.left, zIndex: 40 }}
            className="h-[18px] px-1.5 bg-blue-400 text-white text-[10px] font-medium rounded-t-md leading-[18px]">
            {name}
          </div>
        ),
        document.body,
      )}
      {saveOpen && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setSaveOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Bookmark size={16} className="text-blue-600" />
              <h2 className="text-sm font-semibold text-gray-900">Save section as block</h2>
            </div>
            <input
              autoFocus
              value={blockName}
              onChange={(e) => setBlockName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveBlock(); if (e.key === "Escape") setSaveOpen(false); }}
              placeholder="Block name (e.g. Hero, Footer)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setSaveOpen(false)} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="button" onClick={saveBlock} disabled={!blockName.trim()} className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-40">Save block</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {render}
    </>
  );
}

// Floating rich-text bubble toolbar for inline editing (Text/Heading). Appears
// on a non-collapsed selection inside a [data-rt] contentEditable. Link + color
// popovers steal focus, so the selection range is saved and restored before
// each execCommand.
function InlineToolbar() {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkVal, setLinkVal] = useState("");
  const [colorOpen, setColorOpen] = useState(false);
  const rangeRef = useRef<Range | null>(null);
  const interactingRef = useRef(false);          // keep toolbar visible while a popover is open
  const colorBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onSel = () => {
      if (interactingRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setPos(null); return; }
      const range = sel.getRangeAt(0);
      let node: any = range.commonAncestorContainer;
      node = node?.nodeType === 3 ? node.parentElement : node;
      if (!node?.closest?.("[data-rt]")) { setPos(null); return; }
      const r = range.getBoundingClientRect();
      if (!r || (r.top === 0 && r.left === 0 && r.width === 0)) { setPos(null); return; }
      rangeRef.current = range.cloneRange();
      setPos({ top: r.top - 38, left: r.left });
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  if (!pos) return null;

  // Restore the saved selection (popovers blur it) then run a command.
  const withRange = (fn: () => void) => {
    const r = rangeRef.current; if (!r) return;
    const c: any = r.commonAncestorContainer;
    const host = (c.nodeType === 3 ? c.parentElement : c)?.closest?.("[data-rt]") as HTMLElement | null;
    host?.focus();
    const sel = window.getSelection(); if (!sel) return;
    sel.removeAllRanges(); sel.addRange(r);
    fn();
    if (sel.rangeCount) rangeRef.current = sel.getRangeAt(0).cloneRange();
  };

  const cmd = (c: string) => (e: React.MouseEvent) => { e.preventDefault(); withRange(() => document.execCommand(c, false)); };
  const btn = "p-1 hover:bg-gray-700 rounded";

  const currentHref = () => {
    const r = rangeRef.current; if (!r) return "";
    let n: any = r.startContainer; n = n?.nodeType === 3 ? n.parentElement : n;
    return n?.closest?.("a")?.getAttribute("href") ?? "";
  };
  const openLink = () => { interactingRef.current = true; setColorOpen(false); setLinkVal(currentHref()); setLinkOpen(true); };
  const applyLink = () => { const url = linkVal.trim(); withRange(() => { if (url) document.execCommand("createLink", false, url); else document.execCommand("unlink"); }); setLinkOpen(false); interactingRef.current = false; };
  const removeLink = () => { withRange(() => document.execCommand("unlink")); setLinkOpen(false); interactingRef.current = false; };
  const openColor = () => { interactingRef.current = true; setLinkOpen(false); setColorOpen(true); };
  const closeColor = () => { setColorOpen(false); interactingRef.current = false; };

  return createPortal(
    <>
      <div onMouseDown={(e) => e.preventDefault()} style={{ position: "fixed", top: Math.max(pos.top, 2), left: pos.left, zIndex: 45 }}
        className="flex items-center gap-0.5 bg-gray-900 text-white rounded-md shadow-lg px-1.5 py-1">
        <button onMouseDown={cmd("bold")} className={btn} title="Bold"><Bold size={13} /></button>
        <button onMouseDown={cmd("italic")} className={btn} title="Italic"><Italic size={13} /></button>
        <button onMouseDown={cmd("underline")} className={btn} title="Underline"><Underline size={13} /></button>
        <button onMouseDown={cmd("strikeThrough")} className={btn} title="Strikethrough"><Strikethrough size={13} /></button>
        <span className="w-px h-4 bg-gray-600 mx-0.5" />
        <button onMouseDown={(e) => e.preventDefault()} onClick={openLink} className={btn} title="Link"><Link2 size={13} /></button>
        <button ref={colorBtnRef} onMouseDown={(e) => e.preventDefault()} onClick={openColor} className={btn} title="Text color"><Palette size={13} /></button>
        {linkOpen && (
          <span className="flex items-center gap-1 ml-1">
            <input
              autoFocus
              value={linkVal}
              onChange={(e) => setLinkVal(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } if (e.key === "Escape") { setLinkOpen(false); interactingRef.current = false; } }}
              placeholder="https://…"
              className="w-40 px-1.5 py-0.5 text-[11px] text-gray-900 rounded border border-gray-600 bg-white focus:outline-none"
            />
            <button onMouseDown={(e) => e.preventDefault()} onClick={applyLink} className="text-[11px] px-1.5 py-0.5 bg-blue-600 rounded">OK</button>
            <button onMouseDown={(e) => e.preventDefault()} onClick={removeLink} className={btn} title="Remove link"><X size={12} /></button>
          </span>
        )}
      </div>
      {colorOpen && <ColorPickerPopup color="#111827" anchorEl={colorBtnRef.current} onChange={(hex) => withRange(() => document.execCommand("foreColor", false, hex))} onClose={closeColor} />}
    </>,
    document.body,
  );
}

function Toolbox() {
  const { connectors: { create } } = useEditor();
  const sb = useSavedBlocks();
  const [tab, setTab] = useState<"elements" | "saved">("elements");
  const ref = (el: React.ReactElement) => (r: HTMLElement | null) => { if (r) create(r, el); };
  const cell = "flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-lg border border-gray-200 bg-white text-[13px] text-gray-700 hover:border-blue-300 hover:bg-blue-50 cursor-grab active:cursor-grabbing select-none";
  const sectionPreset = (n: number) => (
    <Element canvas is={Section}>
      {Array.from({ length: n }).map((_, i) => <Element key={i} canvas is={Column} />)}
    </Element>
  );
  const showTabs = !!sb?.available;
  const active = showTabs ? tab : "elements";
  return (
    <div>
      {showTabs && (
        <div className="flex items-center gap-1 p-2 border-b border-gray-200 bg-gray-50/60">
          {([["elements", "Elements"], ["saved", "Saved blocks"]] as const).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${active === k ? "bg-white text-gray-900 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-700"}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {active === "elements" ? (
        <div className="p-4 space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Sections</p>
            <div className="grid grid-cols-3 gap-2">
              <div ref={ref(sectionPreset(1))} className={cell}><Square size={20} />1 col</div>
              <div ref={ref(sectionPreset(2))} className={cell}><Columns2 size={20} />2 col</div>
              <div ref={ref(sectionPreset(3))} className={cell}><Columns3 size={20} />3 col</div>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Content</p>
            <div className="grid grid-cols-2 gap-2">
              <div ref={ref(<EmailHeading />)} className={cell}><Heading1 size={20} />Heading</div>
              <div ref={ref(<EmailText />)} className={cell}><Type size={20} />Text</div>
              <div ref={ref(<EmailButton />)} className={cell}><MousePointerClick size={20} />Button</div>
              <div ref={ref(<EmailImage />)} className={cell}><ImageIcon size={20} />Image</div>
              <div ref={ref(<EmailDivider />)} className={cell}><Minus size={20} />Divider</div>
              <div ref={ref(<EmailSpacer />)} className={cell}><MoveVertical size={20} />Spacer</div>
              <div ref={ref(<EmailNavbar />)} className={cell}><Menu size={20} />Navbar</div>
              <div ref={ref(<EmailSocial />)} className={cell}><Share2 size={20} />Social</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4">
          <SavedBlocksList />
        </div>
      )}
    </div>
  );
}

// Saved blocks — click to append the section to the page (fresh ids).
function SavedBlocksList() {
  const sb = useSavedBlocks();
  const { query, actions } = useEditor();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (!sb || !sb.available) return null;
  return (
    <div>
      {sb.blocks.length === 0 ? (
        <p className="text-xs text-gray-400 leading-relaxed">Select a section, then <span className="font-medium text-gray-500">“Save as block”</span> to reuse it here.</p>
      ) : (
      <div className="space-y-1.5">
        {sb.blocks.map((b) => (
          confirmId === b.id ? (
            <div key={b.id} className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-red-200 bg-red-50">
              <span className="flex-1 min-w-0 text-xs text-red-700 truncate">Delete “{b.name}”?</span>
              <button type="button" onClick={() => { sb.remove(b.id); setConfirmId(null); }} className="text-[11px] font-medium px-2 py-1 bg-red-600 text-white rounded-md shrink-0">Delete</button>
              <button type="button" onClick={() => setConfirmId(null)} className="text-[11px] px-2 py-1 text-gray-600 hover:bg-gray-100 rounded-md shrink-0">Cancel</button>
            </div>
          ) : (
            <div key={b.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => insertSavedBlock(query, actions, b.contentJson)}
                className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-[13px] text-gray-700 hover:border-blue-300 hover:bg-blue-50 text-left"
              >
                <Bookmark size={14} className="text-gray-400 shrink-0" />
                <span className="truncate">{b.name}</span>
              </button>
              <button type="button" onClick={() => setConfirmId(b.id)} title="Delete block" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md shrink-0">
                <Trash2 size={13} />
              </button>
            </div>
          )
        ))}
      </div>
      )}
    </div>
  );
}

const inputCls = "w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const LABEL: Record<string, string> = {
  text: "Text", href: "Link URL", src: "Image URL", alt: "Alt text", fontSize: "Font size", color: "Color", bg: "Button color",
  align: "Align", width: "Width (px)", height: "Height (px)", radius: "Corner radius", bgColor: "Background", contentBg: "Content background",
  textColor: "Text color", breakpoint: "Mobile breakpoint", paddingY: "Padding Y", paddingX: "Padding X", verticalAlign: "Vertical align", fontFamily: "Font",
  borderRadius: "Corner radius", thickness: "Thickness", style: "Style", itemPadding: "Item padding", lineHeight: "Line height", letterSpacing: "Letter spacing",
  marginY: "Margin Y", marginX: "Margin X", fontWeight: "Font weight", iconSize: "Icon size",
};
const FONT_WEIGHTS = [{ v: "400", l: "Normal" }, { v: "500", l: "Medium" }, { v: "600", l: "Semibold" }, { v: "700", l: "Bold" }];
const COLOR_KEYS = ["color", "bg", "bgColor", "contentBg", "textColor"];
const NUM_KEYS = ["fontSize", "height", "radius", "breakpoint", "paddingY", "paddingX", "borderRadius", "thickness", "lineHeight", "letterSpacing", "marginY", "marginX"];
// Keys rendered by dedicated controls, not the generic field loop.
const SKIP_GENERIC = ["bgImage", "bgDisplay", "bgPosition", "items", "src", "paddingY", "paddingX", "marginY", "marginX", "disableStacking", "reverseOnMobile", "itemPadding", "itemPaddingY", "itemPaddingX", "itemGap", "underline", "bold", "italic", "iconSize", "size", "fontFamily"];
const BG_DISPLAY = [{ v: "cover", l: "Cover" }, { v: "contain", l: "Contain (no crop)" }, { v: "repeat", l: "Repeat" }, { v: "actual", l: "Actual size" }];
const BG_POSITION = ["top left", "top center", "top right", "center left", "center center", "center right", "bottom left", "bottom center", "bottom right"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-1">{label}</span>{children}</label>;
}

// Number input with a responsive local value + debounced commit, so typing a
// width/padding doesn't resize the canvas on every keystroke (avoids reflow
// jank). Empty → null (caller decides the fallback).
function NumberInput({ value, onCommit, placeholder, className }: { value: number | null | undefined; onCommit: (v: number | null) => void; placeholder?: string; className?: string }) {
  const [local, setLocal] = useState(value == null ? "" : String(value));
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setLocal(value == null ? "" : String(value)); }, [value]);
  useEffect(() => () => { if (tRef.current) clearTimeout(tRef.current); }, []);
  return (
    <input
      type="number"
      value={local}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value;
        setLocal(raw);
        if (tRef.current) clearTimeout(tRef.current);
        tRef.current = setTimeout(() => onCommit(raw === "" ? null : Number(raw)), 250);
      }}
      className={className ?? inputCls}
    />
  );
}

// Shared image control — preview + Replace/Remove (Library picker) OR a Choose
// button, plus an external-URL input. Used for both Image element src and
// Section background image so they look/behave the same.
function ImagePickerField({ value, onPick, onChange }: { value?: string; onPick: () => void; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      {value ? (
        <>
          <div className="h-20 rounded-lg border border-gray-200 bg-gray-50 bg-center bg-contain bg-no-repeat" style={{ backgroundImage: `url("${value}")` }} />
          <div className="flex gap-1.5">
            <button type="button" onClick={onPick} className="flex-1 text-xs px-2 py-1.5 rounded border border-gray-200 hover:bg-gray-50">Replace</button>
            <button type="button" onClick={() => onChange("")} className="text-xs px-2 py-1.5 rounded border border-gray-200 text-gray-500 hover:text-red-600 hover:bg-red-50">Remove</button>
          </div>
        </>
      ) : (
        <button type="button" onClick={onPick} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-600 hover:border-blue-300 hover:bg-blue-50"><ImagePlus size={14} /> Choose image</button>
      )}
      <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="or paste image URL…" className={`${inputCls} text-xs`} />
    </div>
  );
}

// Two-axis numeric control (Y | X) on one compact row — used for Padding/Margin.
function AxisRow({ label, yKey, xKey, props, set }: { label: string; yKey: string; xKey: string; props: any; set: (k: string, v: any) => void }) {
  const cell = (k: string, ax: string) =>
    k in props ? (
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 pointer-events-none z-10">{ax}</span>
        <NumberInput value={props[k]} onCommit={(n) => set(k, n ?? 0)} className={`${inputCls} pl-6`} />
      </div>
    ) : <div />;
  return (
    <div>
      <span className="block text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-1">{label}</span>
      <div className="grid grid-cols-2 gap-2">{cell(yKey, "Y")}{cell(xKey, "X")}</div>
    </div>
  );
}

function SettingsPanel() {
  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const [socialPickerIndex, setSocialPickerIndex] = useState<number | null>(null);
  const { id, name, props, childCount, actions, query } = useEditor((state) => {
    const sid = Array.from(state.events.selected as Set<string>)[0];
    const node = sid ? state.nodes[sid] : null;
    return { id: sid, name: node?.data.displayName ?? null, props: node?.data.props ?? null, childCount: node ? node.data.nodes.length : 0 };
  });

  if (!id || !props) return null; // LeftPanel shows the Toolbox when nothing is selected
  // Throttle merges rapid edits (e.g. dragging the color picker, fast typing)
  // into a single history entry so one undo reverts the whole change.
  const set = (k: string, v: any) => actions.history.throttle(500).setProp(id, (p: any) => { p[k] = v; });
  const isImage = name === "Image";
  const isPage = name === "Page";
  const isSection = name === "Section";
  const isNavbar = name === "Navbar";
  const isSocial = name === "Social";
  const isButton = name === "Button";
  const isTextual = name === "Heading" || name === "Text";
  // Font lives on the Page (global default) and can be overridden per text-bearing
  // element (Heading/Text/Button/Navbar); empty override = inherit the Page font.
  const hasFont = isPage || isTextual || isButton || isNavbar;
  const itemsSet = (next: any[]) => actions.history.throttle(500).setProp(id, (p: any) => { p.items = next; });
  const moveItem = (i: number, dir: -1 | 1) => {
    const arr = [...(props.items ?? [])];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    itemsSet(arr);
  };
  const reorderBtns = (i: number, n: number) => (
    <div className="flex flex-col shrink-0">
      <button type="button" disabled={i === 0} onClick={() => moveItem(i, -1)} title="Move up" className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-25"><ChevronUp size={12} /></button>
      <button type="button" disabled={i === n - 1} onClick={() => moveItem(i, 1)} title="Move down" className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-25"><ChevronDown size={12} /></button>
    </div>
  );

  const renderField = (k: string) => {
    const v = props[k];
    if (k === "align") return <Field key={k} label={LABEL[k]}><select value={v} onChange={(e) => set(k, e.target.value)} className={inputCls}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></Field>;
    if (k === "verticalAlign") return <Field key={k} label={LABEL[k]}><select value={v} onChange={(e) => set(k, e.target.value)} className={inputCls}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></Field>;
    if (k === "style") return <Field key={k} label={LABEL[k]}><select value={v} onChange={(e) => set(k, e.target.value)} className={inputCls}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></Field>;
    if (k === "fontWeight") return <Field key={k} label={LABEL[k]}><select value={String(v)} onChange={(e) => set(k, e.target.value)} className={inputCls}>{FONT_WEIGHTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></Field>;
    if (COLOR_KEYS.includes(k)) {
      const transparent = v === "transparent";
      return <Field key={k} label={LABEL[k]}>
        <div className="flex items-center gap-2">
          <ColorSwatchButton value={v} onChange={(hex) => set(k, hex)} title={LABEL[k]} />
          {(k === "bgColor") && <button type="button" onClick={() => set(k, "transparent")} className={`text-[11px] px-2 py-1 rounded border ${transparent ? "bg-blue-50 border-blue-300 text-blue-700" : "border-gray-200 text-gray-500"}`}>None</button>}
        </div>
      </Field>;
    }
    if (k === "width" && isImage) return <Field key={k} label={LABEL[k]}><NumberInput value={v} placeholder="auto" onCommit={(n) => set(k, n)} /></Field>;
    if (k === "width") return <Field key={k} label="Email width (px)"><NumberInput value={v} onCommit={(n) => set(k, n ?? 600)} /></Field>;
    if (NUM_KEYS.includes(k)) return <Field key={k} label={LABEL[k] ?? k}><NumberInput value={v} onCommit={(n) => set(k, n ?? 0)} /></Field>;
    if (k === "text") return <Field key={k} label={LABEL[k]}><textarea value={v} onChange={(e) => set(k, e.target.value)} rows={3} className={inputCls} /></Field>;
    return <Field key={k} label={LABEL[k] ?? k}><input value={v ?? ""} onChange={(e) => set(k, e.target.value)} className={inputCls} /></Field>;
  };

  return (
    <div className="p-4 space-y-3">
      <button type="button" onClick={() => actions.clearEvents()} className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900">
        <ArrowLeft size={14} /> Elements
      </button>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">{name}</p>
        {id !== "ROOT" && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => duplicateNode(query, actions, id)} title="Duplicate" className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md">
              <Copy size={15} />
            </button>
            <button type="button" onClick={() => actions.delete(id)} title="Delete" className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md">
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>
      {isImage && (
        <Field label="Image">
          <ImagePickerField value={props.src} onPick={() => setPickerKey("src")} onChange={(v) => set("src", v)} />
        </Field>
      )}

      {isSection && (
        <div className="space-y-2 pb-1">
          <Field label="Background image">
            <ImagePickerField value={props.bgImage} onPick={() => setPickerKey("bgImage")} onChange={(v) => set("bgImage", v)} />
          </Field>
          {props.bgImage && (
            <>
              <Field label="Display image">
                <select value={props.bgDisplay} onChange={(e) => set("bgDisplay", e.target.value)} className={inputCls}>
                  {BG_DISPLAY.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </Field>
              {props.bgDisplay !== "repeat" && (
                <Field label="Position">
                  <select value={props.bgPosition} onChange={(e) => set("bgPosition", e.target.value)} className={inputCls}>
                    {BG_POSITION.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
              )}
            </>
          )}
          {childCount > 1 && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Mobile</p>
              <label className="flex items-center justify-between gap-2 text-xs text-gray-600 cursor-pointer">
                <span>Disable stacking</span>
                <input type="checkbox" checked={!!props.disableStacking} onChange={(e) => { set("disableStacking", e.target.checked); if (e.target.checked) set("reverseOnMobile", false); }} className="h-4 w-4 accent-blue-600" />
              </label>
              {!props.disableStacking && (
                <label className="flex items-center justify-between gap-2 text-xs text-gray-600 cursor-pointer">
                  <span>Reverse order</span>
                  <input type="checkbox" checked={!!props.reverseOnMobile} onChange={(e) => set("reverseOnMobile", e.target.checked)} className="h-4 w-4 accent-blue-600" />
                </label>
              )}
            </div>
          )}
        </div>
      )}

      {isNavbar && (
        <Field label="Menu items">
          <div className="space-y-1.5">
            {(props.items ?? []).map((it: any, i: number) => (
              <div key={i} className="flex items-center gap-1">
                {reorderBtns(i, props.items.length)}
                <input value={it.text} onChange={(e) => itemsSet(props.items.map((x: any, j: number) => j === i ? { ...x, text: e.target.value } : x))} placeholder="Label" className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-xs" />
                <input value={it.href} onChange={(e) => itemsSet(props.items.map((x: any, j: number) => j === i ? { ...x, href: e.target.value } : x))} placeholder="URL" className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-xs" />
                <button type="button" onClick={() => itemsSet(props.items.filter((_: any, j: number) => j !== i))} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={13} /></button>
              </div>
            ))}
            <button type="button" onClick={() => itemsSet([...(props.items ?? []), { text: "Link", href: "#" }])} className="text-xs px-2 py-1 rounded border border-dashed border-gray-300 text-gray-600 hover:bg-gray-50 w-full">+ Add item</button>
          </div>
        </Field>
      )}

      {isNavbar && (
        <>
          <Field label="Item spacing (px)">
            <NumberInput value={props.itemGap ?? props.itemPaddingX ?? props.itemPadding ?? 16} onCommit={(n) => set("itemGap", n ?? 0)} />
          </Field>
          <Field label="Style">
            <div className="flex items-center gap-1">
              {([["bold", Bold], ["italic", Italic], ["underline", Underline]] as const).map(([k, Icon]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => set(k, !props[k])}
                  title={k}
                  className={`p-1.5 rounded-md border transition-colors ${props[k] ? "bg-blue-50 border-blue-300 text-blue-600" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </Field>
        </>
      )}

      {isSocial && (
        <>
          <Field label="Icons">
            <div className="space-y-1.5">
              {(props.items ?? []).map((it: any, i: number) => (
                <div key={i} className="flex items-center gap-1.5">
                  {reorderBtns(i, props.items.length)}
                  <button
                    type="button"
                    onClick={() => setSocialPickerIndex(i)}
                    title="Choose / upload icon"
                    className="w-9 h-9 shrink-0 rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 hover:border-blue-300"
                  >
                    {it.iconSrc
                      ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.iconSrc} alt="" className="w-full h-full object-contain" />
                      : <ImagePlus size={14} className="text-gray-400" />}
                  </button>
                  <input value={it.url ?? ""} onChange={(e) => itemsSet(props.items.map((x: any, j: number) => j === i ? { ...x, url: e.target.value } : x))} placeholder="Link URL" className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1.5 text-xs" />
                  <button type="button" onClick={() => itemsSet(props.items.filter((_: any, j: number) => j !== i))} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={13} /></button>
                </div>
              ))}
              <button type="button" onClick={() => itemsSet([...(props.items ?? []), { iconSrc: "", url: "#" }])} className="text-xs px-2 py-1 rounded border border-dashed border-gray-300 text-gray-600 hover:bg-gray-50 w-full">+ Add icon</button>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Icon size"><NumberInput value={props.iconSize ?? 24} onCommit={(n) => set("iconSize", n ?? 0)} /></Field>
            <Field label="Spacing (px)"><NumberInput value={props.itemGap ?? 12} onCommit={(n) => set("itemGap", n ?? 0)} /></Field>
          </div>
        </>
      )}

      {hasFont && (
        <Field label="Font">
          <select value={props.fontFamily ?? ""} onChange={(e) => set("fontFamily", e.target.value)} className={inputCls}>
            {!isPage && <option value="">Default (page font)</option>}
            {EMAIL_FONTS.map((f) => <option key={f.name} value={f.name} style={{ fontFamily: f.fontFamily }}>{f.name}</option>)}
          </select>
        </Field>
      )}
      {Object.keys(props).filter((k) => !SKIP_GENERIC.includes(k) && !(isTextual && k === "text") && !(isPage && (k === "fontSize" || k === "textColor"))).map(renderField)}
      {("paddingY" in props || "paddingX" in props) && <AxisRow label="Padding" yKey="paddingY" xKey="paddingX" props={props} set={set} />}
      {("marginY" in props || "marginX" in props) && <AxisRow label="Margin" yKey="marginY" xKey="marginX" props={props} set={set} />}
      {isTextual && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">Insert variable (at cursor)</p>
          <div className="flex flex-wrap gap-1">
            {STANDARD_VARIABLES.map((va) => (
              <button key={va.key} type="button" onMouseDown={(e) => { e.preventDefault(); document.execCommand("insertText", false, `{{${va.key}}}`); }} className="text-[10px] font-mono px-1.5 py-0.5 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 text-gray-600 rounded border border-gray-200">{`{{${va.key}}}`}</button>
            ))}
          </div>
        </div>
      )}
      {pickerKey && <MediaLibraryPicker onSelect={(url) => { set(pickerKey, url); setPickerKey(null); }} onClose={() => setPickerKey(null)} />}
      {socialPickerIndex !== null && <MediaLibraryPicker onSelect={(url) => { itemsSet(props.items.map((x: any, j: number) => j === socialPickerIndex ? { ...x, iconSrc: url } : x)); setSocialPickerIndex(null); }} onClose={() => setSocialPickerIndex(null)} />}
    </div>
  );
}

// Auto-wrap any bare content dropped directly onto the Page (ROOT) in a fresh
// Section → Column, so users never get a blocked drop. Runs after each change;
// once every ROOT child is a Section there's nothing to do (no loop).
const SECTION_DEFAULTS = { bgColor: "#ffffff", paddingY: 10, paddingX: 10, bgImage: "", bgDisplay: "cover", bgPosition: "center center", borderRadius: 0 };
const COLUMN_DEFAULTS = { bgColor: "transparent", paddingY: 0, paddingX: 8, verticalAlign: "middle" };
function snode(resolvedName: string, props: any, parent: string, nodes: string[]) {
  return { type: { resolvedName }, isCanvas: true, props, displayName: resolvedName, custom: {}, parent, hidden: false, nodes, linkedNodes: {} };
}
function AutoWrap() {
  const { strays, actions, query } = useEditor((state) => ({
    strays: (state.nodes["ROOT"]?.data?.nodes ?? []).filter((cid) => state.nodes[cid]?.data?.name !== "Section"),
  }));
  const key = strays.join(",");
  useEffect(() => {
    if (!strays.length) return;
    const tree: Record<string, any> = JSON.parse(query.serialize());
    const gid = () => "n" + Math.random().toString(36).slice(2, 10);
    tree.ROOT.nodes = (tree.ROOT.nodes as string[]).map((cid) => {
      if (tree[cid]?.type?.resolvedName === "Section") return cid;
      const secId = gid(), colId = gid();
      tree[secId] = snode("Section", { ...SECTION_DEFAULTS }, "ROOT", [colId]);
      tree[colId] = snode("Column", { ...COLUMN_DEFAULTS }, secId, [cid]);
      tree[cid].parent = colId;
      return secId;
    });
    actions.deserialize(JSON.stringify(tree));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

// Load a new value coming from OUTSIDE the editor (e.g. "apply template")
// into Craft. <Frame data> only reads on mount, so a changed `value` prop is
// otherwise ignored. We compare against the last value WE emitted (cheap string
// compare via the ref) instead of re-serializing the tree — so our own onChange
// round-trips are skipped without the cost of an extra serialize per edit.
function ExternalValueSync({ value, lastEmitted }: { value?: string; lastEmitted: React.MutableRefObject<string | undefined> }) {
  const { actions } = useEditor();
  useEffect(() => {
    if (!value || !value.trim().startsWith("{")) return;
    if (value === lastEmitted.current) return; // our own round-trip
    lastEmitted.current = value;
    try { actions.deserialize(value); } catch { /* ignore bad input */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return null;
}

// One left sidebar: element list (Toolbox) by default; the selected element's
// settings (with a Back button) once something is selected.
function LeftPanel() {
  const { hasSel } = useEditor((s) => ({ hasSel: (s.events.selected as Set<string>).size > 0 }));
  return (
    <div className="w-80 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
      {hasSel ? <SettingsPanel /> : <Toolbox />}
    </div>
  );
}

// Floating bottom-right control: undo/redo + switch the editable canvas between
// desktop and (simulated) mobile width.
function DeviceBar({ device, setDevice }: { device: "desktop" | "mobile"; setDevice: (d: "desktop" | "mobile") => void }) {
  const { canUndo, canRedo, actions } = useEditor((_, query) => ({ canUndo: query.history.canUndo(), canRedo: query.history.canRedo() }));
  // Ctrl/Cmd+Z / Shift+Z / Y — but leave inline text fields to native undo
  // (their input events keep Craft props in sync).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.isContentEditable || ae.closest?.("[data-rt]"))) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); actions.history.undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); actions.history.redo(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [actions]);
  const dbtn = (active: boolean) => `p-1.5 rounded-md transition-colors ${active ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`;
  const hbtn = "p-1.5 rounded-md text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-500 transition-colors";
  return (
    <div className="absolute bottom-4 right-4 z-30 flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-lg p-1 shadow-md">
      <button type="button" onClick={() => actions.history.undo()} disabled={!canUndo} className={hbtn} title="Undo (Ctrl+Z)"><Undo2 size={16} /></button>
      <button type="button" onClick={() => actions.history.redo()} disabled={!canRedo} className={hbtn} title="Redo (Ctrl+Shift+Z)"><Redo2 size={16} /></button>
      <span className="w-px h-5 bg-gray-300 mx-0.5" />
      <button type="button" onClick={() => setDevice("desktop")} className={dbtn(device === "desktop")} title="Desktop width"><Monitor size={16} /></button>
      <button type="button" onClick={() => setDevice("mobile")} className={dbtn(device === "mobile")} title="Mobile width"><Smartphone size={16} /></button>
    </div>
  );
}

// Drag handles at each internal boundary of a multi-column Section — the email
// equivalent of the landing-page Resizer. Adjusts the two adjacent columns'
// `size` weight (MJML normalizes to width %). Handles appear for the Section the
// user is focused on (selected, hovered, or a column/content inside it). Hidden
// in the mobile preview, where columns stack and width has no effect.
function ColumnResizers() {
  const device = useContext(DeviceContext);
  const { nodes, selected, hovered, actions } = useEditor((state) => ({
    nodes: state.nodes,
    selected: Array.from(state.events.selected as Set<string>)[0] as string | undefined,
    hovered: Array.from(state.events.hovered as Set<string>)[0] as string | undefined,
  }));
  const dragRef = useRef<string | null>(null);
  const [, force] = useState(0);
  useEffect(() => {
    const h = () => force((n) => n + 1);
    window.addEventListener("scroll", h, true);
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("scroll", h, true); window.removeEventListener("resize", h); };
  }, []);

  // Walk up from a focused node to the Section that contains it.
  const sectionOf = (nid?: string): string | null => {
    let cur: string | undefined = nid;
    while (cur && nodes[cur]) {
      if (nodes[cur].data.name === "Section") return cur;
      cur = nodes[cur].data.parent ?? undefined;
    }
    return null;
  };

  const sectionId = sectionOf(selected) ?? sectionOf(hovered) ?? dragRef.current;
  if (device === "mobile" || !sectionId || !nodes[sectionId]) return null;
  const colIds = (nodes[sectionId].data.nodes ?? []).filter((c) => nodes[c]?.data.name === "Column");
  if (colIds.length < 2) return null;
  const rects = colIds.map((c) => nodes[c]?.dom?.getBoundingClientRect());
  if (rects.some((r) => !r)) return null;

  const onDown = (e: React.MouseEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation(); // don't change selection when grabbing the handle
    dragRef.current = sectionId;
    const ids = colIds;
    const widths = ids.map((c) => nodes[c]!.dom!.getBoundingClientRect().width);
    const totalPx = widths.reduce((a, b) => a + b, 0) || 1;
    const base = widths.map((w) => (w / totalPx) * 100);
    const pairPct = base[i] + base[i + 1];
    const startX = e.clientX;
    const MIN = 10; // each side keeps ≥10% of the section
    let started = false;

    const onMove = (ev: MouseEvent) => {
      // On the first actual movement, snapshot every column to an explicit %
      // weight so scales stay consistent (a 3-col row keeps the untouched
      // column's width). Deferred to here so a stray click leaves props clean.
      if (!started) {
        started = true;
        ids.forEach((c, k) => actions.history.throttle(1000).setProp(c, (p: any) => { p.size = Math.round(base[k]); }));
      }
      let aPct = base[i] + ((ev.clientX - startX) / totalPx) * 100;
      aPct = Math.max(MIN, Math.min(pairPct - MIN, aPct));
      const a = Math.round(aPct);
      actions.history.throttle(1000).setProp(ids[i], (p: any) => { p.size = a; });
      actions.history.throttle(1000).setProp(ids[i + 1], (p: any) => { p.size = Math.round(pairPct) - a; });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      dragRef.current = null;
      force((n) => n + 1);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return createPortal(
    <>
      {colIds.slice(0, -1).map((cid, i) => {
        const r = rects[i]!, rNext = rects[i + 1]!;
        const x = (r.right + rNext.left) / 2; // midpoint of the inter-column gap
        return (
          <div
            key={cid}
            onMouseDown={(e) => onDown(e, i)}
            title="Drag to resize columns"
            className="group fixed flex items-center justify-center"
            style={{ top: r.top, height: r.height, left: x - 5, width: 10, cursor: "col-resize", zIndex: 39 }}
          >
            <span className="w-[2px] h-full bg-blue-400/40 group-hover:bg-blue-500 transition-colors" />
            <span className="absolute h-6 w-1.5 rounded-full bg-blue-500 opacity-60 group-hover:opacity-100 shadow-sm" />
          </div>
        );
      })}
    </>,
    document.body,
  );
}

export default function EmailBuilder({ value, onChange }: { value?: string; onChange: (json: string) => void }) {
  const hasData = !!value && value.trim().startsWith("{") && value.includes("ROOT");
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const lastEmitted = useRef<string | undefined>(value);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  return (
    <SavedBlocksProvider>
    <Editor resolver={EMAIL_RESOLVER} onRender={RenderNode} onNodesChange={(q) => { const s = q.serialize(); lastEmitted.current = s; onChangeRef.current(s); }}>
      <AutoWrap />
      <ExternalValueSync value={value} lastEmitted={lastEmitted} />
      <InlineToolbar />
      <DeviceContext.Provider value={device}>
        <div className="relative flex h-full min-h-0 border border-gray-200 rounded-lg overflow-hidden">
          <LeftPanel />
          <div className="flex-1 min-w-0 overflow-y-auto bg-gray-100">
            {hasData ? (
              <Frame data={value!} />
            ) : (
              <Frame>
                <Element is={Page} canvas>
                  <Element is={Section} canvas>
                    <Element is={Column} canvas>
                      <EmailHeading text="New email" />
                      <EmailText text="Drag a Section, then drop content into its columns." />
                    </Element>
                  </Element>
                </Element>
              </Frame>
            )}
          </div>
          <DeviceBar device={device} setDevice={setDevice} />
          <ColumnResizers />
        </div>
      </DeviceContext.Provider>
    </Editor>
    </SavedBlocksProvider>
  );
}
