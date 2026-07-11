"use client";

import { useMemo, useState } from "react";

import { AlertTriangle, Send, Trash2, X } from "lucide-react";

import {
  buildAgentCardHistoryRows,
  buildAgentCardViewModel,
  resolveDismissAffordance,
  resolveNudgeAffordance,
  type AgentCardStatus,
} from "@/lib/aihub/agentCard";
import type { AgentState } from "@/features/agents/state/store";

// Phase 6 interactions card: opens in the chat slide-out when an aihub avatar is clicked.
// Shows the agent's live hub state (persona/model, tool, tier/kind, status + age, task,
// blocked detail, current tool, task counts), a nudge composer (top-level Claude sessions
// only), a dismiss affordance (idle/done only), and a read-only synthesized activity view.
// Reads-only from the hub metadata; the two writes (nudge, dismiss) are lifted to OfficeScreen
// which calls the provider directly and reports success/failure back through onNudge/onDismiss.

const STATUS_DOT: Record<AgentCardStatus, string> = {
  working: "bg-emerald-400",
  idle: "bg-white/30",
  blocked: "bg-amber-400",
  done: "bg-sky-400",
};

const STATUS_PILL: Record<AgentCardStatus, string> = {
  working: "border-emerald-400/40 bg-emerald-950/40 text-emerald-200",
  idle: "border-white/15 bg-white/5 text-white/60",
  blocked: "border-amber-400/40 bg-amber-950/40 text-amber-200",
  done: "border-sky-400/40 bg-sky-950/40 text-sky-200",
};

type NudgeFeedback = { ok: boolean; message: string } | null;

export function AihubAgentCard({
  agent,
  canSend,
  onNudge,
  onDismiss,
  onClose,
}: {
  agent: AgentState;
  canSend: boolean;
  onNudge: (message: string) => Promise<void>;
  onDismiss: () => void | Promise<void>;
  onClose: () => void;
}) {
  const hub = agent.hub ?? null;
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<NudgeFeedback>(null);
  const [dismissing, setDismissing] = useState(false);

  const view = useMemo(
    () =>
      hub
        ? buildAgentCardViewModel({
            name: agent.name,
            role: agent.role ?? null,
            model: agent.model ?? null,
            hub,
          })
        : null,
    [agent.name, agent.role, agent.model, hub],
  );
  const nudge = useMemo(() => (hub ? resolveNudgeAffordance(hub) : null), [hub]);
  const dismiss = useMemo(() => (hub ? resolveDismissAffordance(hub) : null), [hub]);
  const historyRows = useMemo(
    () => (hub ? buildAgentCardHistoryRows(hub) : []),
    [hub],
  );

  if (!hub || !view || !nudge || !dismiss) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 font-mono text-[12px] text-white/40">
        No hub data for this agent.
      </div>
    );
  }

  const nudgeReady = nudge.enabled && canSend;
  const trimmedDraft = draft.trim();

  const handleSend = async () => {
    if (!nudgeReady || !trimmedDraft || sending) return;
    setSending(true);
    setFeedback(null);
    try {
      await onNudge(trimmedDraft);
      setDraft("");
      setFeedback({ ok: true, message: "Nudge delivered — session resumed." });
    } catch (error) {
      setFeedback({
        ok: false,
        message: error instanceof Error ? error.message : "Nudge failed.",
      });
    } finally {
      setSending(false);
    }
  };

  const handleDismiss = async () => {
    if (!dismiss.enabled || dismissing) return;
    setDismissing(true);
    try {
      await onDismiss();
    } finally {
      setDismissing(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden font-mono text-white/85">
      {/* Header */}
      <div className="flex items-start gap-2 border-b border-white/10 px-4 py-3">
        <span
          className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[view.status]}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-white">
              {view.name}
            </span>
            <span className="shrink-0 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/55">
              {view.toolLabel}
            </span>
          </div>
          {view.personaLine ? (
            <div className="truncate text-[11px] text-white/45">{view.personaLine}</div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-1 text-white/40 transition hover:bg-white/10 hover:text-white/80"
          aria-label="Close"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_PILL[view.status]}`}
          >
            {view.statusLabel}
          </span>
          <span className="text-[10px] text-white/40">{view.ageLabel}</span>
          <span className="text-[10px] text-white/35">
            {view.kindLabel} · {view.tierLabel}
          </span>
        </div>

        <dl className="mt-3 flex flex-col gap-1.5 text-[11px]">
          {view.project ? (
            <MetaRow label="Project" value={view.project} />
          ) : null}
          {view.currentTool ? (
            <MetaRow label="Current tool" value={view.currentTool} />
          ) : null}
          {view.taskCountsLabel ? (
            <MetaRow label="Tasks" value={view.taskCountsLabel} />
          ) : null}
          {view.bgTasksLabel ? (
            <MetaRow label="Background" value={view.bgTasksLabel} />
          ) : null}
        </dl>

        {view.taskText ? (
          <div className="mt-3 rounded border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-[9px] uppercase tracking-[0.16em] text-white/35">
              Current task
            </div>
            <div className="mt-1 break-words text-[12px] text-white/80">
              {view.taskText}
            </div>
          </div>
        ) : null}

        {view.blockedDetail ? (
          <div className="mt-3 flex items-start gap-2 rounded border border-amber-400/30 bg-amber-950/30 px-3 py-2">
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300"
              aria-hidden
            />
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-[0.16em] text-amber-300/70">
                Blocked
              </div>
              <div className="mt-0.5 break-words text-[12px] text-amber-100/90">
                {view.blockedDetail}
              </div>
            </div>
          </div>
        ) : null}

        {/* Read-only synthesized history (task checklist + recent activity + detail) */}
        <div className="mt-4">
          <div className="mb-1.5 text-[9px] uppercase tracking-[0.16em] text-white/35">
            Recent activity
          </div>
          <div className="flex flex-col gap-1.5">
            {historyRows.map((row, index) => (
              <div
                key={`${row.kind}-${index}`}
                className={`rounded border border-white/[0.06] px-2.5 py-1.5 text-[11px] ${
                  row.kind === "tasks"
                    ? "whitespace-pre-wrap bg-white/[0.03] text-white/70"
                    : row.kind === "detail"
                      ? "bg-white/[0.03] text-white/60"
                      : "bg-white/[0.02] text-white/55"
                }`}
              >
                {row.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer: nudge composer + dismiss */}
      <div className="border-t border-white/10 px-4 py-3">
        {nudge.enabled ? (
          <>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              disabled={!canSend || sending}
              rows={2}
              placeholder={
                canSend
                  ? "Nudge this session — sends via claude --resume…"
                  : "Connect to nudge…"
              }
              className="w-full resize-none rounded border border-white/12 bg-black/40 px-2.5 py-2 text-[12px] text-white/90 placeholder:text-white/30 focus:border-cyan-400/40 focus:outline-none disabled:opacity-50"
            />
            <div className="mt-2 flex items-center gap-2">
              {feedback ? (
                <span
                  className={`min-w-0 flex-1 truncate text-[10px] ${
                    feedback.ok ? "text-emerald-300/85" : "text-red-300/85"
                  }`}
                >
                  {feedback.message}
                </span>
              ) : (
                <span className="min-w-0 flex-1 text-[10px] text-white/25">
                  ⌘/Ctrl + Enter to send
                </span>
              )}
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!nudgeReady || !trimmedDraft || sending}
                className="inline-flex shrink-0 items-center gap-1.5 rounded border border-cyan-400/40 bg-cyan-950/40 px-3 py-1.5 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-900/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" aria-hidden />
                {sending ? "Nudging…" : "Nudge"}
              </button>
            </div>
          </>
        ) : (
          <div className="rounded border border-white/10 bg-white/[0.02] px-3 py-2 text-[10px] text-white/40">
            {nudge.reason}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[9px] uppercase tracking-wide text-white/25">
            {dismiss.enabled ? "24h hide" : dismiss.reason}
          </span>
          <button
            type="button"
            onClick={() => void handleDismiss()}
            disabled={!dismiss.enabled || dismissing}
            title={dismiss.enabled ? "Dismiss (hide 24h)" : dismiss.reason ?? undefined}
            className="inline-flex shrink-0 items-center gap-1.5 rounded border border-red-400/30 bg-red-950/30 px-2.5 py-1.5 text-[11px] text-red-200/90 transition hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {dismissing ? "Dismissing…" : "Dismiss"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-[9px] uppercase tracking-[0.14em] text-white/30">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 truncate text-right text-white/70">{value}</dd>
    </div>
  );
}
