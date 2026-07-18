import {useEffect, useMemo, useState} from "react";

import {Button} from "@heroui/react";

import {CompletionBar, StatusIcon} from "./atoms";
import {Iconify} from "../icons/iconify";
import {
  BOARD_COLUMN_ORDER,
  formatCompletion,
  formatPlanId,
  planRouteId,
  STATE_MAP,
} from "../data/tracker";
import type {PlanStatus, PlanSummary} from "../data/tracker";
import {useTracker} from "../state/tracker";

interface DragState {
  planId: string;
  fromState: PlanStatus;
}

function BoardCard({
  isDragging,
  onDragStart,
  plan,
}: {
  isDragging: boolean;
  onDragStart: (planId: string, fromState: PlanStatus) => void;
  plan: PlanSummary;
}) {
  const {dagPreviewPlanId, openIssue, pinnedDagPreviewPlanId, setDagPreviewPlanId, toggleSelected} = useTracker();
  const id = planRouteId(plan);
  const isPreviewed = dagPreviewPlanId === id || pinnedDagPreviewPlanId === id;

  return (
    <div
      draggable
      aria-grabbed={isDragging}
      data-plan-card-id={id}
      className={[
        "tracker-row border-border bg-surface rounded-md border p-2.5 cursor-grab active:cursor-grabbing",
        "hover:border-accent/40 hover:bg-surface-secondary",
        "select-none transition-[opacity,transform,box-shadow] duration-150",
        isPreviewed ? "border-accent/70 bg-surface-secondary shadow-overlay" : "",
        isDragging ? "opacity-40 scale-[0.97] shadow-none" : "opacity-100",
      ].join(" ")}
      role="button"
      tabIndex={0}
      onClick={(event) => {
        if (isDragging) return;
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          toggleSelected(id);
          return;
        }
        openIssue(id);
      }}
      onMouseEnter={() => setDagPreviewPlanId(id)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("planId", id);
        onDragStart(id, plan.status);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openIssue(id);
        }
      }}
    >
      <span className="text-muted font-mono text-[11px] tabular-nums">{formatPlanId(plan)}</span>
      <p className="text-foreground/90 mt-1 line-clamp-2 text-[13px] leading-snug">
        {plan.title}
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <CompletionBar completion={plan.completion} />
        <span className="text-muted ml-auto text-[11px] tabular-nums">
          {formatCompletion(plan.completion)}
        </span>
      </div>
    </div>
  );
}

function BoardColumn({
  dragging,
  isOver,
  onDragLeave,
  onDragOver,
  onDragStart,
  onDrop,
  plans,
  state,
}: {
  dragging: DragState | null;
  isOver: boolean;
  onDragLeave: () => void;
  onDragOver: (event: React.DragEvent, toState: PlanStatus) => void;
  onDragStart: (planId: string, fromState: PlanStatus) => void;
  onDrop: (event: React.DragEvent, toState: PlanStatus) => void;
  plans: PlanSummary[];
  state: PlanStatus;
}) {
  const meta = STATE_MAP[state];
  const isSourceColumn = dragging?.fromState === state;

  return (
    <div
      className={[
        "flex h-full w-80 shrink-0 flex-col rounded-lg transition-colors duration-150",
        isOver && !isSourceColumn ? "bg-accent/8 ring-accent/30 ring-1" : "bg-surface/30",
      ].join(" ")}
      onDragLeave={onDragLeave}
      onDragOver={(event) => onDragOver(event, state)}
      onDrop={(event) => onDrop(event, state)}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 px-3">
        <StatusIcon className="shrink-0" size={16} state={state} />
        <span className="text-foreground text-[13px] font-semibold">{meta.name}</span>
        <span className="text-muted text-xs tabular-nums">{plans.length}</span>
        <Button
          isIconOnly
          aria-label={`Add plan to ${meta.name}`}
          className="text-muted ml-auto"
          size="sm"
          variant="ghost"
        >
          <Iconify className="size-4" icon="plus" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-3">
        {isOver && !isSourceColumn ? (
          <div className="border-accent bg-accent/10 h-16 rounded-md border-2 border-dashed" />
        ) : null}
        {plans.map((plan) => (
          <BoardCard
            key={formatPlanId(plan)}
            isDragging={dragging?.planId === planRouteId(plan)}
            plan={plan}
            onDragStart={onDragStart}
          />
        ))}
      </div>
    </div>
  );
}

export function Board() {
  const {plans, plansError, plansLoading, setDagPreviewPlanId, setPlanStatus} = useTracker();
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [overState, setOverState] = useState<PlanStatus | null>(null);

  const grouped = useMemo(
    () =>
      Object.fromEntries(
        BOARD_COLUMN_ORDER.map((state) => [
          state,
          plans.filter((plan) => plan.status === state),
        ]),
      ) as Record<PlanStatus, PlanSummary[]>,
    [plans],
  );

  useEffect(() => {
    const handleFocusPlan = (event: Event) => {
      const id = (event as CustomEvent<{id?: string}>).detail?.id;
      if (!id) return;

      const card = document.querySelector<HTMLElement>(`[data-plan-card-id="${CSS.escape(id)}"]`);
      if (!card) return;

      setDagPreviewPlanId(id);
      card.scrollIntoView({behavior: "smooth", block: "nearest", inline: "nearest"});
    };

    window.addEventListener("plansman:focus-dag-plan", handleFocusPlan);

    return () => window.removeEventListener("plansman:focus-dag-plan", handleFocusPlan);
  }, [setDagPreviewPlanId]);

  const handleDragOver = (event: React.DragEvent, toState: PlanStatus) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setOverState(toState);
  };

  const handleDrop = (event: React.DragEvent, toState: PlanStatus) => {
    event.preventDefault();
    setOverState(null);

    const planId = event.dataTransfer.getData("planId");
    if (!planId || !dragging || dragging.fromState === toState) {
      setDragging(null);
      return;
    }

    const plan = plans.find((item) => planRouteId(item) === planId);
    void setPlanStatus(planId, toState, plan?.completion);
    setDragging(null);
  };

  if (plansLoading) {
    return (
      <div className="text-muted flex h-full items-center justify-center text-sm" role="status">
        Loading plans...
      </div>
    );
  }

  if (plansError) {
    return (
      <div className="m-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
        Plans API error: {plansError}
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-x-auto"
      onDragEnd={() => {
        setDragging(null);
        setOverState(null);
      }}
    >
      <div className="flex h-full min-w-max gap-3 p-3">
        {BOARD_COLUMN_ORDER.map((state) => (
          <BoardColumn
            key={state}
            dragging={dragging}
            isOver={overState === state}
            plans={grouped[state]}
            state={state}
            onDragLeave={() => setOverState(null)}
            onDragOver={handleDragOver}
            onDragStart={(planId, fromState) => setDragging({planId, fromState})}
            onDrop={handleDrop}
          />
        ))}
      </div>
    </div>
  );
}
