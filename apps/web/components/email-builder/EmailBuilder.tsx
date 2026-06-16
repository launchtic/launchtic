"use client";

// Craft.js email build surface (toolbox + canvas + settings). Page → Section →
// Column → content. value/onChange = Craft serialized JSON (stored in the email
// body); rendered to responsive HTML via MJML at preview/send time.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Editor, Frame, Element, useEditor, useNode } from "@craftjs/core";
import { Heading1, Type, MousePointerClick, Image as ImageIcon, Minus, MoveVertical, Square, Columns2, Columns3, ImagePlus, Copy, Trash2, Move, ArrowUp, ArrowLeft } from "lucide-react";
import { STANDARD_VARIABLES } from "@launchtic/email";
import MediaLibraryPicker from "../media/MediaLibraryPicker";
import {
  EMAIL_RESOLVER, Page, Section, Column, EmailHeading, EmailText, EmailButton, EmailImage, EmailDivider, EmailSpacer,
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
  const [, force] = useState(0);
  useEffect(() => {
    const h = () => force((n) => n + 1);
    window.addEventListener("scroll", h, true);
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("scroll", h, true); window.removeEventListener("resize", h); };
  }, []);
  useEffect(() => {
    if (!dom) return;
    dom.style.outline = isActive ? "2px solid #2563eb" : isHover ? "1px solid #93c5fd" : "";
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
          <div style={{ position: "fixed", top: Math.max(rect.top - 23, 2), left: rect.left, zIndex: 9999 }}
            className="flex items-center gap-0.5 h-[22px] px-1 bg-blue-600 text-white text-[11px] rounded-t-md shadow-md">
            <span ref={(r) => { if (r) drag(r); }} title="Drag to move" className="px-0.5 cursor-grab"><Move size={12} /></span>
            <span className="px-1 font-medium">{name}</span>
            {parent && <button title="Select parent" onMouseDown={stop} onClick={() => (actions as any).selectNode(parent)} className="p-0.5 hover:bg-blue-700 rounded"><ArrowUp size={12} /></button>}
            <button title="Duplicate" onMouseDown={stop} onClick={() => duplicateNode(query, actions, id)} className="p-0.5 hover:bg-blue-700 rounded"><Copy size={12} /></button>
            {deletable && <button title="Delete" onMouseDown={stop} onClick={() => actions.delete(id)} className="p-0.5 hover:bg-blue-700 rounded"><Trash2 size={12} /></button>}
          </div>
        ) : (
          // Hover only — just the name label (lighter).
          <div style={{ position: "fixed", top: Math.max(rect.top - 19, 2), left: rect.left, zIndex: 9998 }}
            className="h-[18px] px-1.5 bg-blue-400 text-white text-[10px] font-medium rounded-t-md leading-[18px]">
            {name}
          </div>
        ),
        document.body,
      )}
      {render}
    </>
  );
}

function Toolbox() {
  const { connectors: { create } } = useEditor();
  const ref = (el: React.ReactElement) => (r: HTMLElement | null) => { if (r) create(r, el); };
  const cell = "flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-lg border border-gray-200 bg-white text-[13px] text-gray-700 hover:border-blue-300 hover:bg-blue-50 cursor-grab active:cursor-grabbing select-none";
  const sectionPreset = (n: number) => (
    <Element canvas is={Section}>
      {Array.from({ length: n }).map((_, i) => <Element key={i} canvas is={Column} />)}
    </Element>
  );
  return (
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
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Content <span className="normal-case font-normal">(drop into a column)</span></p>
        <div className="grid grid-cols-2 gap-2">
          <div ref={ref(<EmailHeading />)} className={cell}><Heading1 size={20} />Heading</div>
          <div ref={ref(<EmailText />)} className={cell}><Type size={20} />Text</div>
          <div ref={ref(<EmailButton />)} className={cell}><MousePointerClick size={20} />Button</div>
          <div ref={ref(<EmailImage />)} className={cell}><ImageIcon size={20} />Image</div>
          <div ref={ref(<EmailDivider />)} className={cell}><Minus size={20} />Divider</div>
          <div ref={ref(<EmailSpacer />)} className={cell}><MoveVertical size={20} />Spacer</div>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const LABEL: Record<string, string> = {
  text: "Text", href: "Link URL", src: "Image URL", alt: "Alt text", fontSize: "Font size", color: "Color", bg: "Button color",
  align: "Align", width: "Width (px)", height: "Height (px)", radius: "Corner radius", bgColor: "Background", contentBg: "Content background",
  textColor: "Text color", breakpoint: "Mobile breakpoint", paddingY: "Padding Y", paddingX: "Padding X", verticalAlign: "Vertical align",
  borderRadius: "Corner radius",
};
const COLOR_KEYS = ["color", "bg", "bgColor", "contentBg", "textColor"];
const NUM_KEYS = ["fontSize", "height", "radius", "breakpoint", "paddingY", "paddingX", "borderRadius"];
// Section background-media keys — rendered by a dedicated control, not generically.
const SKIP_GENERIC = ["bgImage", "bgDisplay", "bgPosition"];
const BG_DISPLAY = [{ v: "cover", l: "Cover" }, { v: "contain", l: "Contain (no crop)" }, { v: "repeat", l: "Repeat" }, { v: "actual", l: "Actual size" }];
const BG_POSITION = ["top left", "top center", "top right", "center left", "center center", "center right", "bottom left", "bottom center", "bottom right"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-1">{label}</span>{children}</label>;
}

function SettingsPanel() {
  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const { id, name, props, actions, query } = useEditor((state) => {
    const sid = Array.from(state.events.selected as Set<string>)[0];
    const node = sid ? state.nodes[sid] : null;
    return { id: sid, name: node?.data.displayName ?? null, props: node?.data.props ?? null };
  });

  if (!id || !props) return null; // LeftPanel shows the Toolbox when nothing is selected
  const set = (k: string, v: any) => actions.setProp(id, (p: any) => { p[k] = v; });
  const isImage = name === "Image";
  const isSection = name === "Section";
  const isTextual = name === "Heading" || name === "Text";

  const renderField = (k: string) => {
    const v = props[k];
    if (k === "align") return <Field key={k} label={LABEL[k]}><select value={v} onChange={(e) => set(k, e.target.value)} className={inputCls}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></Field>;
    if (k === "verticalAlign") return <Field key={k} label={LABEL[k]}><select value={v} onChange={(e) => set(k, e.target.value)} className={inputCls}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></Field>;
    if (COLOR_KEYS.includes(k)) {
      const transparent = v === "transparent";
      return <Field key={k} label={LABEL[k]}>
        <div className="flex items-center gap-2">
          <input type="color" value={transparent ? "#ffffff" : v} onChange={(e) => set(k, e.target.value)} className="h-8 w-12 rounded border border-gray-200" />
          {(k === "bgColor") && <button type="button" onClick={() => set(k, "transparent")} className={`text-[11px] px-2 py-1 rounded border ${transparent ? "bg-blue-50 border-blue-300 text-blue-700" : "border-gray-200 text-gray-500"}`}>None</button>}
        </div>
      </Field>;
    }
    if (k === "width" && isImage) return <Field key={k} label={LABEL[k]}><input type="number" placeholder="auto" value={v ?? ""} onChange={(e) => set(k, e.target.value === "" ? null : Number(e.target.value))} className={inputCls} /></Field>;
    if (k === "width") return <Field key={k} label="Email width (px)"><input type="number" value={v} onChange={(e) => set(k, Number(e.target.value))} className={inputCls} /></Field>;
    if (NUM_KEYS.includes(k)) return <Field key={k} label={LABEL[k] ?? k}><input type="number" value={v ?? 0} onChange={(e) => set(k, Number(e.target.value))} className={inputCls} /></Field>;
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
      {isImage && <button type="button" onClick={() => setPickerKey("src")} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"><ImagePlus size={14} /> Choose from Library</button>}

      {isSection && (
        <div className="space-y-2 pb-1">
          <Field label="Background image">
            {props.bgImage ? (
              <div className="space-y-1.5">
                <div className="h-16 rounded-lg border border-gray-200 bg-gray-50 bg-center bg-cover" style={{ backgroundImage: `url("${props.bgImage}")` }} />
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setPickerKey("bgImage")} className="flex-1 text-xs px-2 py-1.5 rounded border border-gray-200 hover:bg-gray-50">Replace</button>
                  <button type="button" onClick={() => set("bgImage", "")} className="text-xs px-2 py-1.5 rounded border border-gray-200 text-gray-500 hover:text-red-600 hover:bg-red-50">Remove</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setPickerKey("bgImage")} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-600 hover:border-blue-300 hover:bg-blue-50"><ImagePlus size={14} /> Choose image</button>
            )}
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
        </div>
      )}

      {Object.keys(props).filter((k) => !SKIP_GENERIC.includes(k)).map(renderField)}
      {isTextual && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">Insert variable</p>
          <div className="flex flex-wrap gap-1">
            {STANDARD_VARIABLES.map((va) => (
              <button key={va.key} type="button" onClick={() => set("text", `${props.text ?? ""}{{${va.key}}}`)} className="text-[10px] font-mono px-1.5 py-0.5 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 text-gray-600 rounded border border-gray-200">{`{{${va.key}}}`}</button>
            ))}
          </div>
        </div>
      )}
      {pickerKey && <MediaLibraryPicker onSelect={(url) => { set(pickerKey, url); setPickerKey(null); }} onClose={() => setPickerKey(null)} />}
    </div>
  );
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

export default function EmailBuilder({ value, onChange, fontCss }: { value?: string; onChange: (json: string) => void; fontCss?: string }) {
  const hasData = !!value && value.trim().startsWith("{") && value.includes("ROOT");
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  return (
    <Editor resolver={EMAIL_RESOLVER} onRender={RenderNode} onNodesChange={(q) => onChangeRef.current(q.serialize())}>
      <div className="flex h-full min-h-0 border border-gray-200 rounded-lg overflow-hidden">
        <LeftPanel />
        <div className="flex-1 min-w-0 overflow-y-auto" style={fontCss ? { fontFamily: fontCss } : undefined}>
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
      </div>
    </Editor>
  );
}
