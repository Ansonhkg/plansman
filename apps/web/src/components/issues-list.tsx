import {useEffect, useMemo} from "react";

import {FilterBar} from "./filter-bar";
import {IssueGroup} from "./issue-group";
import {LIST_GROUP_ORDER} from "../data/tracker";
import {useTracker} from "../state/tracker";
import type {ActiveFilter, FilterKind} from "../state/tracker";
import type {PlanSummary} from "../data/tracker";

function matchesFilters(plan: PlanSummary, filters: ActiveFilter[]) {
  if (filters.length === 0) return true;

  const byKind = filters.reduce<Record<FilterKind, string[]>>(
    (acc, filter) => {
      acc[filter.kind] = acc[filter.kind] ?? [];
      acc[filter.kind].push(filter.value);

      return acc;
    },
    {} as Record<FilterKind, string[]>,
  );

  return (Object.entries(byKind) as [FilterKind, string[]][]).every(([kind, values]) => {
    if (kind === "status") return values.includes(plan.status);
    if (kind === "completion") return values.some((value) => {
      if (value === "complete") return plan.completion === 100;
      if (value === "incomplete") return plan.completion < 100;
      return true;
    });

    return true;
  });
}

export function IssuesList() {
  const {filters, plans, plansError, plansLoading, setDagPreviewPlanId} = useTracker();

  const grouped = useMemo(() => {
    const filtered = plans.filter((plan) => matchesFilters(plan, filters));

    return LIST_GROUP_ORDER.map((state) => ({
      state,
      issues: filtered.filter((plan) => plan.status === state),
    })).filter((group) => group.issues.length > 0);
  }, [filters, plans]);

  useEffect(() => {
    const handleFocusPlan = (event: Event) => {
      const id = (event as CustomEvent<{id?: string}>).detail?.id;
      if (!id) return;

      const row = document.querySelector<HTMLElement>(`[data-plan-row-id="${CSS.escape(id)}"]`);
      if (!row) return;

      setDagPreviewPlanId(id);
      row.scrollIntoView({behavior: "smooth", block: "nearest", inline: "nearest"});
    };

    window.addEventListener("plansman:focus-dag-plan", handleFocusPlan);

    return () => window.removeEventListener("plansman:focus-dag-plan", handleFocusPlan);
  }, [setDagPreviewPlanId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <FilterBar />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {plansLoading ? (
          <div className="text-muted flex h-32 items-center justify-center text-sm" role="status">
            Loading plans...
          </div>
        ) : plansError ? (
          <div className="m-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
            Plans API error: {plansError}
          </div>
        ) : grouped.length > 0 ? (
          grouped.map((group) => (
            <IssueGroup key={group.state} issues={group.issues} state={group.state} />
          ))
        ) : (
          <div className="text-muted flex h-32 items-center justify-center text-sm">
            No plans match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
