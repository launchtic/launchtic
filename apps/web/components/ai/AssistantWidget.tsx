"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Bot, X, Send, Loader2, Trash2, Check, AlertCircle, Maximize2, Minimize2 } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useConfirm } from "../ui/ConfirmDialog";
import { toolLabel } from "../../lib/ai/tools/labels";
import { apiFetch } from "../../lib/api-client";

// Server SSE events — mirrors the union in /api/ai/chat. Kept as a local
// type to avoid importing server-side modules into a "use client" file.
type ToolProgress = {
  name:   string;
  status: "running" | "done" | "error";
  ms?:    number;
  error?: string;
};
type StreamEvent =
  | { type: "tool_start"; name: string }
  | { type: "tool_done";  name: string; ms: number }
  | { type: "tool_error"; name: string; ms: number; error: string }
  | { type: "complete";   kind: "text" | "pending_confirm"; messages: Message[]; pending?: PendingToolCall[] }
  | { type: "error";      error: string };

type Message = {
  id: string;
  role: "user" | "assistant" | "tool_use" | "tool_result";
  content: any;
  toolName?: string | null;
  toolStatus?: string | null;
  toolCallId?: string | null;
  createdAt: string;
};

type PendingToolCall = {
  messageId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  summary: string;
};

export default function AssistantWidget() {
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null); // null = unknown, false = not configured
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<PendingToolCall[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  // Real-time tool progress for the current in-flight chat/confirm turn.
  // Cleared at the start of each send.
  const [progress, setProgress] = useState<ToolProgress[]>([]);
  const confirm = useConfirm();
  // Expand state persisted in localStorage so user preference survives reload.
  // Two sizes only — drag-resize was deemed over-engineered for chat widget.
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load expanded preference once on mount
  useEffect(() => {
    setExpanded(localStorage.getItem("ai-widget-expanded") === "1");
  }, []);
  function toggleExpand() {
    setExpanded((v) => {
      const next = !v;
      localStorage.setItem("ai-widget-expanded", next ? "1" : "0");
      return next;
    });
  }

  // Check availability on mount (cheap GET).
  useEffect(() => {
    void checkAvailability();
  }, []);

  // Re-check availability + load history every time widget opens — picks up
  // settings changes the user made in another tab without a reload.
  useEffect(() => {
    if (!open) return;
    void checkAvailability().then(() => {
      if (messages.length === 0) void loadHistory();
    });
  }, [open]);

  // Auto-scroll on message changes.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, sending]);

  async function checkAvailability() {
    try {
      const res = await apiFetch("/api/ai/settings");
      const json = await res.json();
      setAvailable(json.success && json.data.hasApiKey && json.data.enabled);
    } catch {
      setAvailable(false);
    }
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const res = await apiFetch("/api/ai/history");
      const json = await res.json();
      if (json.success) setMessages(json.data.messages);
    } catch {
      /* ignore */
    } finally {
      setLoadingHistory(false);
    }
  }

  // Read SSE stream: split on \n\n, parse JSON after "data: ", dispatch each.
  // Returns when the stream closes. Errors are surfaced via the "error" event,
  // not by throwing — server-side failures still cleanly close the controller.
  async function consumeStream(res: Response, onEvent: (e: StreamEvent) => void): Promise<void> {
    if (!res.body) throw new Error("Empty response");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames end with a blank line. Split on \n\n, keep the trailing
      // (possibly partial) frame in the buffer for the next chunk.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.trim();
        if (!line.startsWith("data:")) continue;
        try {
          onEvent(JSON.parse(line.slice(5).trim()));
        } catch {
          // Malformed frame — skip silently. Don't crash the stream over
          // one bad line; subsequent valid frames still flow.
        }
      }
    }
  }

  function applyEvent(e: StreamEvent) {
    switch (e.type) {
      case "tool_start":
        setProgress((prev) => [...prev, { name: e.name, status: "running" }]);
        break;
      case "tool_done":
      case "tool_error":
        setProgress((prev) =>
          prev.map((p, idx, arr) =>
            // Update the LAST running entry with this name — handles repeated
            // calls of the same tool in one turn without crossing wires.
            idx === arr.map((x) => x.name === e.name && x.status === "running").lastIndexOf(true)
              ? { ...p, status: e.type === "tool_done" ? "done" : "error", ms: e.ms, error: (e as any).error }
              : p,
          ),
        );
        break;
      case "complete":
        setMessages(e.messages);
        setPending(e.kind === "pending_confirm" ? (e.pending ?? []) : []);
        break;
      case "error":
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: `⚠️ ${e.error}`,
            createdAt: new Date().toISOString(),
          },
        ]);
        break;
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    setProgress([]);

    // Optimistic user message
    const optimisticUser: Message = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      // Pass browser timezone so the LLM converts natural-language times
      // ("9 AM tomorrow") to UTC ISO using the operator's local zone, not UTC.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await apiFetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, timezone: tz }),
      });
      if (!res.ok || res.headers.get("content-type")?.includes("application/json")) {
        // Auth/validation failures still come back as JSON — handle that path.
        const json = await res.json().catch(() => ({ error: "Connection failed" }));
        applyEvent({ type: "error", error: json.error ?? "Request failed" });
        return;
      }
      await consumeStream(res, applyEvent);
    } catch (e) {
      applyEvent({ type: "error", error: "Connection failed. Try again." });
    } finally {
      setSending(false);
      // Hold the progress chips one frame so the "done" check is visible,
      // then clear when the next send starts.
    }
  }

  async function handleConfirm(messageId: string, approve: boolean) {
    setConfirming(messageId);
    setProgress([]);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await apiFetch("/api/ai/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, approve, timezone: tz }),
      });
      if (!res.ok || res.headers.get("content-type")?.includes("application/json")) {
        const json = await res.json().catch(() => ({ error: "Connection failed" }));
        applyEvent({ type: "error", error: json.error ?? "Failed to confirm" });
        return;
      }
      await consumeStream(res, applyEvent);
    } finally {
      setConfirming(null);
    }
  }

  async function handleClear() {
    const ok = await confirm({
      title: "Clear conversation history?",
      description: "All messages in this chat will be permanently deleted. This can't be undone.",
      confirmLabel: "Clear",
      variant: "danger",
    });
    if (!ok) return;
    await apiFetch("/api/ai/clear", { method: "POST" });
    setMessages([]);
    setPending([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  // Hide entirely when AI isn't configured (or still checking). Onboarding
  // checklist surfaces "Configure AI Assistant" — once the user adds a key,
  // checkAvailability flips this to true on next mount and the widget appears.
  if (!available) return null;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25 flex items-center justify-center transition-transform hover:scale-105"
          aria-label="Open assistant"
        >
          <Bot size={20} />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className={`fixed bottom-5 right-5 z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden transition-[width,height] duration-200 ${
            expanded
              ? "w-[640px] h-[85vh] max-w-[calc(100vw-40px)]"
              : "w-[380px] h-[560px] max-h-[calc(100vh-40px)]"
          }`}
        >
          {/* Header */}
          <header className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-br from-blue-50 to-white">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                <Bot size={14} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Launchtic Assistant</p>
                <p className="text-[10px] text-gray-500">Beta · BYO API key</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {available && messages.length > 0 && (
                <button
                  onClick={handleClear}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  title="Clear conversation"
                >
                  <Trash2 size={14} />
                </button>
              )}
              <button
                onClick={toggleExpand}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg hidden sm:block"
                title={expanded ? "Collapse" : "Expand"}
                aria-label={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
          </header>

          {/* Body */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50">
            {!available && <NotConfiguredState />}
            {available && loadingHistory && (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-xs">Loading conversation…</span>
              </div>
            )}
            {available && !loadingHistory && messages.length === 0 && (
              <EmptyState onPick={(s) => setInput(s)} />
            )}
            {available && !loadingHistory && messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {pending.map((p) => (
              <ConfirmCard
                key={p.messageId}
                pending={p}
                confirming={confirming === p.messageId}
                onConfirm={(approve) => handleConfirm(p.messageId, approve)}
              />
            ))}
            {(sending || (confirming && progress.length > 0)) && (
              <div className="flex flex-col gap-1.5 px-1">
                {progress.map((p, i) => (
                  <ProgressChip key={`${p.name}-${i}`} progress={p} />
                ))}
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 size={12} className="animate-spin" /> Thinking…
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          {available && (
            <div className="border-t border-gray-100 p-3 bg-white">
              <div className="relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask or give a command…"
                  rows={1}
                  disabled={sending}
                  className="w-full text-sm border border-gray-200 rounded-xl pl-3 pr-10 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-32 disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
                  aria-label="Send"
                >
                  <Send size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ProgressChip({ progress }: { progress: ToolProgress }) {
  const label = toolLabel(progress.name);
  const isRunning = progress.status === "running";
  const isError   = progress.status === "error";
  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs ${
        isError
          ? "bg-red-50 border-red-100 text-red-700"
          : isRunning
            ? "bg-blue-50 border-blue-100 text-blue-700"
            : "bg-gray-50 border-gray-100 text-gray-600"
      }`}
    >
      {isRunning && <Loader2 size={11} className="animate-spin shrink-0" />}
      {progress.status === "done"  && <Check size={11} className="text-green-600 shrink-0" />}
      {isError                      && <AlertCircle size={11} className="shrink-0" />}
      <span className="truncate">{label}</span>
      {progress.status === "done" && progress.ms !== undefined && (
        <span className="ml-auto text-[10px] text-gray-400">{(progress.ms / 1000).toFixed(1)}s</span>
      )}
    </div>
  );
}

function NotConfiguredState() {
  const params = useParams();
  const slug = params.workspaceSlug as string;
  return (
    <div className="flex flex-col items-center text-center py-8 px-4">
      <Bot size={32} className="text-gray-300 mb-2" />
      <p className="text-sm font-medium text-gray-700 mb-1">Assistant not configured</p>
      <p className="text-xs text-gray-500 mb-4">Add an API key (Gemini or Anthropic) to start using the assistant.</p>
      <Link
        href={`/${slug}/settings/ai-assistant`}
        className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
      >
        Open settings
      </Link>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  const suggestions = [
    "Build a funnel to sell my digital product",
    "What's my revenue this week?",
    "List recent orders",
    "Show me active sequences",
    "Create a tag called 'vip'",
  ];
  return (
    <div className="flex flex-col items-center text-center py-6 px-2">
      <Bot size={28} className="text-blue-400 mb-2" />
      <p className="text-sm font-medium text-gray-700 mb-1">How can I help?</p>
      <p className="text-xs text-gray-500 mb-4">Try one of these:</p>
      <div className="flex flex-col gap-1.5 w-full">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="text-left text-xs px-3 py-2 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 rounded-lg text-gray-700 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-blue-600 text-white text-sm rounded-2xl rounded-br-sm px-3 py-2 whitespace-pre-wrap break-words">
          {String(message.content)}
        </div>
      </div>
    );
  }

  if (message.role === "assistant") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] bg-white border border-gray-200 text-gray-800 text-sm rounded-2xl rounded-bl-sm px-3 py-2 break-words">
          <MarkdownContent>{String(message.content)}</MarkdownContent>
        </div>
      </div>
    );
  }

  if (message.role === "tool_use") {
    // Tool use is invisible in the persistent chat history:
    //   - Pending confirms render as a separate ConfirmCard.
    //   - Live progress is shown via the SSE ProgressChip stream during the
    //     in-flight turn (visible while spinner is up, then dropped).
    //   - After the turn, the assistant's text bubble narrates what happened.
    //   - Errors surface via the tool_result branch below (red badge).
    // So nothing to render here at all.
    return null;
  }

  if (message.role === "tool_result") {
    if (message.toolStatus === "error") {
      const errMsg = (message.content as any)?.error ?? "Tool error";
      return (
        <div className="flex justify-start">
          <div className="text-xs px-2 py-1 inline-flex items-center gap-1 text-red-600 bg-red-50 rounded">
            <AlertCircle size={11} /> {errMsg}
          </div>
        </div>
      );
    }
    // Successful tool results are not shown — the assistant turn that follows
    // narrates them. Rejected results also go silent.
    return null;
  }

  return null;
}

// Compact markdown renderer for chat bubbles. Tight spacing + small typography
// to fit the 380px-wide widget. Keeps the chat feel — not a document.
function MarkdownContent({ children }: { children: string }) {
  return (
    <ReactMarkdown
      // GFM = GitHub-flavored markdown: tables, strikethrough, autolinks, task lists.
      // Without this, AI's pipe-table responses render as raw `| col | col |` text.
      remarkPlugins={[remarkGfm]}
      components={{
        p:      ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        ul:     ({ children }) => <ul className="list-disc pl-4 mb-2 last:mb-0 space-y-0.5">{children}</ul>,
        ol:     ({ children }) => <ol className="list-decimal pl-4 mb-2 last:mb-0 space-y-0.5">{children}</ol>,
        li:     ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
        em:     ({ children }) => <em className="italic">{children}</em>,
        a:      ({ href, children }) => {
          // Internal app paths (start with "/") → Next.js Link, same tab,
          // preserves SPA navigation. External URLs → new tab + noreferrer.
          const isInternal = href?.startsWith("/") ?? false;
          if (isInternal) {
            return (
              <Link href={href!} className="underline text-blue-600 hover:text-blue-700 font-medium">
                {children}
              </Link>
            );
          }
          return (
            <a href={href} target="_blank" rel="noreferrer" className="underline text-blue-600 hover:text-blue-700">
              {children}
            </a>
          );
        },
        code: ({ children, ...props }) => {
          const isInline = !(props as any).className?.includes("language-");
          return isInline ? (
            <code className="bg-gray-100 px-1 py-0.5 rounded text-[12px] font-mono text-gray-800">{children}</code>
          ) : (
            <code className="block bg-gray-100 p-2 rounded text-[12px] font-mono overflow-x-auto">{children}</code>
          );
        },
        pre:     ({ children }) => <pre className="mb-2 last:mb-0">{children}</pre>,
        h1:      ({ children }) => <h1 className="text-base font-semibold mb-1.5 mt-1">{children}</h1>,
        h2:      ({ children }) => <h2 className="text-sm font-semibold mb-1.5 mt-1">{children}</h2>,
        h3:      ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-1">{children}</h3>,
        hr:      () => <hr className="my-2 border-gray-200" />,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-gray-300 pl-2 italic text-gray-600 mb-2 last:mb-0">
            {children}
          </blockquote>
        ),
        // GFM tables — wrap in scroll container since 380px widget is narrow.
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto -mx-1">
            <table className="text-xs border-collapse w-full">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr:    ({ children }) => <tr className="border-b border-gray-100 last:border-0">{children}</tr>,
        th:    ({ children }) => (
          <th className="text-left font-semibold text-gray-700 px-2 py-1 border-b border-gray-200">
            {children}
          </th>
        ),
        td:    ({ children }) => <td className="px-2 py-1 align-top">{children}</td>,
        del:   ({ children }) => <del className="text-gray-400">{children}</del>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function ConfirmCard({
  pending, confirming, onConfirm,
}: {
  pending: PendingToolCall;
  confirming: boolean;
  onConfirm: (approve: boolean) => void;
}) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 mb-1">Confirm action</p>
      <p className="text-sm text-gray-800 mb-2">{pending.summary}</p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onConfirm(true)}
          disabled={confirming}
          className="flex-1 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg inline-flex items-center justify-center gap-1.5"
        >
          {confirming ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Confirm
        </button>
        <button
          onClick={() => onConfirm(false)}
          disabled={confirming}
          className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 rounded-lg"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
