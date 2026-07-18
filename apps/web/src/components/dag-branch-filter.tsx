import {useMemo, useState} from "react";
import {Checkbox, Popover} from "@heroui/react";

import type {PlanDagData} from "../../../../src/core/plan-dag";
import {Iconify} from "../icons/iconify";

type FilterBranch = {
  id: string;
  label: string;
  hint: string | null;
  count: number;
};

type FilterGroup = {
  key: string;
  label: string;
  branches: FilterBranch[];
  count: number;
};

function branchDisplay(name: string): {label: string; hint: string | null} {
  const forkIndex = name.indexOf(" fork from ");
  if (forkIndex >= 0) {
    return {label: name.slice(0, forkIndex), hint: name.slice(forkIndex + 1)};
  }
  if (name.endsWith(" root")) return {label: name.slice(0, -5), hint: "root"};
  return {label: name, hint: null};
}

function groupKeyForBranch(data: PlanDagData, branchId: string): {key: string; label: string} {
  if (branchId === "main") return {key: "main", label: "Main path"};

  const first = data.events.find((event) => event.branch === branchId);
  const match = first?.label.match(/(\d+)/);
  if (match) return {key: `plan-${match[1]}`, label: `plan-${match[1]}`};

  return {key: branchId, label: branchId};
}

function groupBranches(data: PlanDagData): FilterGroup[] {
  const groups = new Map<string, FilterGroup>();
  const order: string[] = [];

  for (const branch of data.branches) {
    const {key, label} = groupKeyForBranch(data, branch.id);
    const display = branchDisplay(branch.name);
    const count = data.events.filter((event) => event.branch === branch.id).length;

    let group = groups.get(key);
    if (!group) {
      group = {key, label, branches: [], count: 0};
      groups.set(key, group);
      order.push(key);
    }

    group.branches.push({id: branch.id, label: display.label, hint: display.hint, count});
    group.count += count;
  }

  return order.map((key) => groups.get(key)!);
}

type Props = {
  data: PlanDagData;
  selected: Set<string>;
  colorForBranch: (branchId: string) => string;
  onChange: (next: Set<string>) => void;
};

export function DagBranchFilter({colorForBranch, data, onChange, selected}: Props) {
  const groups = useMemo(() => groupBranches(data), [data]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const activeCount = selected.size;

  const setBranches = (ids: string[], on: boolean) => {
    const next = new Set(selected);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    onChange(next);
  };

  const toggleGroup = (group: FilterGroup) => {
    const ids = group.branches.map((branch) => branch.id);
    const allOn = ids.every((id) => selected.has(id));
    setBranches(ids, !allOn);
  };

  const toggleExpanded = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Popover>
      <Popover.Trigger>
        <button
          className="border-border hover:bg-surface-secondary inline-flex h-7 items-center gap-2 rounded-full border px-3 text-xs transition-colors"
          type="button"
        >
          <Iconify className="size-3.5" icon="funnel" />
          <span>Filter</span>
          {activeCount > 0 ? (
            <span className="bg-accent/15 text-accent inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums">
              {activeCount}
            </span>
          ) : null}
          <Iconify className="text-muted size-3" icon="chevron-down" />
        </button>
      </Popover.Trigger>
      <Popover.Content className="w-72" placement="bottom start">
        <Popover.Dialog className="p-0 outline-none">
          <div className="border-border/70 flex items-center justify-between border-b px-3 py-2">
            <span className="text-foreground text-xs font-semibold">Filter branches</span>
            {activeCount > 0 ? (
              <button
                className="text-muted hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
                type="button"
                onClick={() => onChange(new Set())}
              >
                <Iconify className="size-3" icon="xmark" />
                Clear
              </button>
            ) : (
              <span className="text-muted text-[11px]">Showing all</span>
            )}
          </div>

          <div className="max-h-80 overflow-auto py-1">
            {groups.map((group) => {
              const ids = group.branches.map((branch) => branch.id);
              const selectedCount = ids.filter((id) => selected.has(id)).length;
              const allOn = selectedCount === ids.length && ids.length > 0;
              const someOn = selectedCount > 0 && !allOn;
              const isLeaf = group.branches.length === 1;
              const isOpen = !isLeaf && (expanded.has(group.key) || someOn);

              if (isLeaf) {
                const branch = group.branches[0];
                return (
                  <div key={group.key} className="px-2">
                    <Checkbox
                      aria-label={`Filter ${group.label}`}
                      className="hover:bg-surface-secondary w-full rounded-md px-1.5 py-1.5"
                      isSelected={selected.has(branch.id)}
                      variant="secondary"
                      onChange={() => setBranches([branch.id], !selected.has(branch.id))}
                    >
                      <Checkbox.Content className="flex w-full items-center gap-2">
                        <Checkbox.Control className="size-4 shrink-0">
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{backgroundColor: colorForBranch(branch.id)}}
                        />
                        <span className="text-foreground flex-1 truncate text-xs font-medium">
                          {group.label}
                        </span>
                        <span className="text-muted shrink-0 text-[11px] tabular-nums">{group.count}</span>
                      </Checkbox.Content>
                    </Checkbox>
                  </div>
                );
              }

              return (
                <div key={group.key} className="px-2">
                  <div className="hover:bg-surface-secondary flex items-center gap-1 rounded-md pr-1.5">
                    <button
                      aria-expanded={isOpen}
                      aria-label={isOpen ? `Collapse ${group.label}` : `Expand ${group.label}`}
                      className="text-muted hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded transition-colors"
                      type="button"
                      onClick={() => toggleExpanded(group.key)}
                    >
                      <Iconify className="size-3.5" icon={isOpen ? "chevron-down" : "chevron-right"} />
                    </button>
                    <Checkbox
                      aria-label={`Filter all of ${group.label}`}
                      className="flex-1 rounded-md py-1.5"
                      isIndeterminate={someOn}
                      isSelected={allOn}
                      variant="secondary"
                      onChange={() => toggleGroup(group)}
                    >
                      <Checkbox.Content className="flex w-full items-center gap-2">
                        <Checkbox.Control className="size-4 shrink-0">
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        <span className="text-foreground flex-1 truncate text-xs font-medium">
                          {group.label}
                        </span>
                        <span className="text-muted shrink-0 text-[11px] tabular-nums">
                          {group.branches.length}
                        </span>
                      </Checkbox.Content>
                    </Checkbox>
                  </div>

                  {isOpen ? (
                    <div className="border-border/50 ml-3 border-l pl-1">
                      {group.branches.map((branch) => (
                        <Checkbox
                          key={branch.id}
                          aria-label={`Filter ${branch.label}`}
                          className="hover:bg-surface-secondary w-full rounded-md px-1.5 py-1.5"
                          isSelected={selected.has(branch.id)}
                          variant="secondary"
                          onChange={() => setBranches([branch.id], !selected.has(branch.id))}
                        >
                          <Checkbox.Content className="flex w-full items-center gap-2">
                            <Checkbox.Control className="size-4 shrink-0">
                              <Checkbox.Indicator />
                            </Checkbox.Control>
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{backgroundColor: colorForBranch(branch.id)}}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="text-foreground block truncate text-xs">{branch.label}</span>
                              {branch.hint ? (
                                <span className="text-muted block truncate text-[10px]">{branch.hint}</span>
                              ) : null}
                            </span>
                            <span className="text-muted shrink-0 text-[11px] tabular-nums">{branch.count}</span>
                          </Checkbox.Content>
                        </Checkbox>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
