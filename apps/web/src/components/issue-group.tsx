import {useEffect, useMemo, useState} from "react";

import {Button} from "@heroui/react";

import {IssueRow} from "./issue-row";
import {StatusIcon} from "./atoms";
import {Iconify} from "../icons/iconify";
import {STATE_MAP, type PlanStatus, type PlanSummary} from "../data/tracker";

export function IssueGroup({state, issues}: {state: PlanStatus; issues: PlanSummary[]}) {
  const storageKey = useMemo(() => `plansman.issueGroupOpen.${state}`, [state]);
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(storageKey) !== "false";
    } catch {
      return true;
    }
  });
  const meta = STATE_MAP[state];

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, String(open));
    } catch {
      // Ignore unavailable storage; the group still toggles in memory.
    }
  }, [open, storageKey]);

  return (
    <section className="group/section">
      <div className="border-border/60 bg-surface/40 sticky top-0 z-10 flex h-9 items-center gap-2 border-b px-3 backdrop-blur">
        <button
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none"
          type="button"
          onClick={() => setOpen((value) => !value)}
        >
          <Iconify
            className="text-muted size-3.5 shrink-0 transition-transform duration-150"
            icon="chevron-right"
            style={{transform: open ? "rotate(90deg)" : "none"}}
          />
          <StatusIcon className="shrink-0" size={16} state={state} />
          <span className="text-foreground text-[13px] font-semibold">{meta.name}</span>
          <span className="text-muted text-xs tabular-nums">{issues.length}</span>
        </button>
        <Button
          isIconOnly
          aria-label={`Add plan to ${meta.name}`}
          className="text-muted opacity-0 transition-opacity group-hover/section:opacity-100"
          size="sm"
          variant="ghost"
        >
          <Iconify className="size-4" icon="plus" />
        </Button>
      </div>

      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{gridTemplateRows: open ? "1fr" : "0fr"}}
      >
        <div className="overflow-hidden">
          <div className="divide-border/40 divide-y">
            {issues.map((issue) => (
              <IssueRow key={issue.fileName} issue={issue} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
