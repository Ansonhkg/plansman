import {useState} from "react";

import {Button, Dropdown, Label, Separator} from "@heroui/react";
import {Sidebar} from "@heroui-pro/react";
import {useLocation, useNavigate} from "react-router";

import logoUrl from "../../../../assets/logo.png";
import {BrandIsotipo} from "../brand";
import {Iconify} from "../icons/iconify";
import {useTracker} from "../state/tracker";

function BreadcrumbLogo() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <BrandIsotipo className="size-4 shrink-0" height={16} width={16} />;
  }

  return (
    <img
      alt=""
      className="size-4 shrink-0 rounded"
      height={16}
      src={logoUrl}
      width={16}
      onError={() => setFailed(true)}
    />
  );
}

export function TopBar() {
  const {pathname} = useLocation();
  const navigate = useNavigate();
  const {activeWorkspace, addFilter, planSort, setNewIssueOpen, setPlanSort} = useTracker();
  const currentView = pathname === "/board"
    ? "Board"
    : pathname === "/dag"
      ? "DAG"
      : pathname === "/settings"
        ? "Settings"
        : pathname.startsWith("/sections/")
          ? "Section"
          : pathname.startsWith("/ideas")
            ? "Ideas"
          : pathname === "/resolutions"
            ? "Resolutions"
            : "Plans";

  return (
    <header className="border-border/70 bg-background flex h-11 shrink-0 items-center gap-2 border-b px-3">
      <Sidebar.Trigger className="text-muted" />

      <div className="flex min-w-0 items-center gap-1.5">
        <BreadcrumbLogo />
        <span className="text-muted truncate text-sm">{activeWorkspace?.name ?? "Plansman"}</span>
        <Iconify className="text-muted/60 size-3.5 shrink-0" icon="chevron-right" />
        <span className="text-foreground truncate text-sm font-medium">{currentView}</span>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {!pathname.startsWith("/ideas") ? <Dropdown>
          <Button className="hidden sm:inline-flex" size="sm" variant="ghost">
            <Iconify className="size-4" icon="funnel" />
            Filter
          </Button>
          <Dropdown.Popover className="w-52" placement="bottom end">
            <Dropdown.Menu
              aria-label="Add filter"
              onAction={(key) => {
                const map: Record<string, {kind: "status" | "completion"; value: string; label: string}> = {
                  "status-running": {kind: "status", value: "running", label: "Status: Running"},
                  "status-not-started": {
                    kind: "status",
                    value: "not started",
                    label: "Status: Not Started",
                  },
                  "completion-incomplete": {
                    kind: "completion",
                    value: "incomplete",
                    label: "Completion: Incomplete",
                  },
                };
                const filter = map[String(key)];

                if (filter) addFilter(filter);
              }}
            >
              <Dropdown.Item id="status-running" textValue="Status Running">
                <Iconify className="text-muted size-4 shrink-0" icon="circle" />
                <Label>Status: Running</Label>
              </Dropdown.Item>
              <Dropdown.Item id="status-not-started" textValue="Status Not Started">
                <Iconify className="text-muted size-4 shrink-0" icon="circle" />
                <Label>Status: Not Started</Label>
              </Dropdown.Item>
              <Dropdown.Item id="completion-incomplete" textValue="Completion Incomplete">
                <Iconify className="text-muted size-4 shrink-0" icon="bars" />
                <Label>Completion: Incomplete</Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown> : null}

        {!pathname.startsWith("/ideas") ? <Dropdown>
          <Button className="hidden sm:inline-flex" size="sm" variant="ghost">
            <Iconify className="size-4" icon="sliders-vertical" />
            Display
          </Button>
          <Dropdown.Popover className="w-52" placement="bottom end">
            <Dropdown.Menu
              aria-label="Display options"
              onAction={(key) => {
                if (key === "ordering-plan-number") setPlanSort("plan-number");
                if (key === "ordering-latest") setPlanSort("latest");
              }}
            >
              <Dropdown.Item id="grouping" textValue="Grouping status">
                <Iconify className="text-muted size-4 shrink-0" icon="layers" />
                <Label>Grouping: Status</Label>
              </Dropdown.Item>
              <Dropdown.Item id="ordering-plan-number" textValue="Ordering plan number">
                <Iconify
                  className={planSort === "plan-number" ? "text-accent size-4 shrink-0" : "text-muted size-4 shrink-0"}
                  icon={planSort === "plan-number" ? "check" : "bars-ascending-align-left"}
                />
                <Label>Ordering: Plan number</Label>
              </Dropdown.Item>
              <Dropdown.Item id="ordering-latest" textValue="Ordering latest">
                <Iconify
                  className={planSort === "latest" ? "text-accent size-4 shrink-0" : "text-muted size-4 shrink-0"}
                  icon={planSort === "latest" ? "check" : "clock-arrow-rotate-left"}
                />
                <Label>Ordering: Latest</Label>
              </Dropdown.Item>
              <Dropdown.Item id="compact" textValue="Compact density">
                <Iconify className="text-muted size-4 shrink-0" icon="list-ul" />
                <Label>Density: Compact</Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown> : null}

        <Separator className="hidden h-4 sm:block" orientation="vertical" />

        <Button
          size="sm"
          variant="primary"
          onPress={() => pathname.startsWith("/ideas") ? navigate("/ideas?capture=1") : setNewIssueOpen(true)}
        >
          <Iconify className="size-4" icon="plus" />
          <span className="hidden sm:inline">{pathname.startsWith("/ideas") ? "New idea" : "New plan"}</span>
        </Button>
      </div>
    </header>
  );
}
