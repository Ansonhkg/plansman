import {Checkbox} from "@heroui/react";

import {CompletionBar, CompletionPill, StatusIcon} from "./atoms";
import {formatPlanId, planRouteId, type PlanSummary} from "../data/tracker";
import {useTracker} from "../state/tracker";

export function IssueRow({issue}: {issue: PlanSummary}) {
  const {dagPreviewPlanId, openIssue, pinnedDagPreviewPlanId, selectedIds, setDagPreviewPlanId, toggleSelected} = useTracker();
  const id = planRouteId(issue);
  const isSelected = selectedIds.has(id);
  const isPreviewed = dagPreviewPlanId === id || pinnedDagPreviewPlanId === id;
  const openOrSelect = (event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      toggleSelected(id);
      return;
    }

    openIssue(id);
  };

  return (
    <div
      className={[
        "tracker-row group/row grid h-9 cursor-pointer grid-cols-[1rem_3.5rem_4.5rem_1rem_minmax(12rem,1fr)_5.5rem_5.5rem_6rem] items-center gap-2 px-3 pl-2 transition-colors",
        isSelected
          ? "bg-accent/10"
          : isPreviewed
            ? "bg-foreground/[0.06]"
            : "hover:bg-foreground/[0.04]",
      ].join(" ")}
      data-plan-row-id={id}
      role="button"
      tabIndex={0}
      onClick={openOrSelect}
      onMouseEnter={() => setDagPreviewPlanId(id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openIssue(id);
        }
      }}
    >
      <div
        className={`flex w-4 shrink-0 items-center justify-center transition-opacity ${
          isSelected ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 focus-within:opacity-100"
        }`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Checkbox
          aria-label={`Select ${formatPlanId(issue)}`}
          className="size-3.5"
          isSelected={isSelected}
          variant="secondary"
          onChange={() => toggleSelected(id)}
        >
          <Checkbox.Content>
            <Checkbox.Control className="size-3.5">
              <Checkbox.Indicator />
            </Checkbox.Control>
          </Checkbox.Content>
        </Checkbox>
      </div>

      <CompletionPill className="hidden sm:inline-flex" completion={issue.completion} />

      <span className="text-muted w-16 shrink-0 font-mono text-xs tabular-nums">
        {formatPlanId(issue)}
      </span>

      <StatusIcon className="shrink-0" size={16} state={issue.status} />

      <span className="text-foreground/90 min-w-0 flex-1 truncate text-sm">{issue.title}</span>

      <div className="hidden justify-self-end lg:block">
        <CompletionBar completion={issue.completion} />
      </div>

      <div className="hidden min-w-0 lg:block">
        {issue.followUp ? (
          <span className="text-muted block truncate text-xs tabular-nums">follows {issue.followUp}</span>
        ) : issue.subPlan ? (
          <span className="text-muted block truncate text-xs tabular-nums">sub {issue.subPlan}</span>
        ) : (
          <span aria-hidden="true" className="block">&nbsp;</span>
        )}
      </div>

      <span className="text-muted hidden min-w-0 truncate text-right text-xs tabular-nums sm:block">
        {issue.fileName}
      </span>
    </div>
  );
}
