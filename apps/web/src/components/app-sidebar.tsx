import {useState} from "react";

import {Button, Dropdown, Kbd, Label, Tooltip, useTheme} from "@heroui/react";
import {Sidebar, useSidebar} from "@heroui-pro/react";
import {useLocation, useNavigate} from "react-router";

import logoUrl from "../../../../assets/logo.png";
import {BrandIsotipo, brand} from "../brand";
import {Iconify} from "../icons/iconify";
import {useTracker} from "../state/tracker";

function AppLogo({className}: {className?: string}) {
  const [failed, setFailed] = useState(false);

  if (failed) return <BrandIsotipo className={className} height={22} width={22} />;

  return (
    <img
      alt=""
      className={className}
      height={22}
      src={logoUrl}
      width={22}
      onError={() => setFailed(true)}
    />
  );
}

function CountChip({children}: {children: React.ReactNode}) {
  return (
    <Sidebar.MenuChip>
      <span className="text-muted text-xs tabular-nums">{children}</span>
    </Sidebar.MenuChip>
  );
}

function WorkspaceSwitcher() {
  const {activeWorkspace, setCurrentWorkspaceSlug, workspaces} = useTracker();
  const navigate = useNavigate();

  if (workspaces.length <= 1) {
    return (
      <div className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5">
        <AppLogo className="size-[22px] shrink-0 rounded" />
        <span className="text-foreground min-w-0 flex-1 truncate text-sm font-semibold" data-sidebar="label">
          {activeWorkspace?.name ?? brand.name}
        </span>
      </div>
    );
  }

  return (
    <Dropdown>
      <Dropdown.Trigger
        aria-label="Switch workspace"
        className="hover:bg-surface-secondary flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left outline-none transition-colors data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-accent"
      >
        <AppLogo className="size-[22px] shrink-0 rounded" />
        <span
          className="text-foreground min-w-0 flex-1 truncate text-sm font-semibold"
          data-sidebar="label"
        >
          {activeWorkspace?.name ?? brand.name}
        </span>
        <Iconify
          className="text-muted size-3.5 shrink-0"
          data-sidebar="label"
          icon="chevron-down"
        />
      </Dropdown.Trigger>
      <Dropdown.Popover className="w-56" placement="bottom start">
        <Dropdown.Menu
          aria-label="Workspace menu"
          selectedKeys={activeWorkspace ? [activeWorkspace.slug] : []}
          selectionMode="single"
          onAction={(key) => {
            const value = String(key);
            setCurrentWorkspaceSlug(value);
            navigate("/");
          }}
        >
          {workspaces.map((workspace) => (
            <Dropdown.Item key={workspace.slug} id={workspace.slug} textValue={workspace.name}>
              <Iconify className="text-muted size-4 shrink-0" icon="box" />
              <Label>{workspace.name}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

function SearchRow() {
  const {setCommandOpen} = useTracker();

  return (
    <button
      className="bg-default/70 hover:bg-default group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-colors"
      type="button"
      onClick={() => setCommandOpen(true)}
    >
      <Iconify className="text-muted size-4 shrink-0" icon="magnifier" />
      <span className="text-muted flex-1 truncate text-sm" data-sidebar="label">
        Search
      </span>
      <Kbd className="h-5 px-1 text-[10px]" data-sidebar="label">
        <Kbd.Abbr keyValue="command" />
        <Kbd.Content>K</Kbd.Content>
      </Kbd>
    </button>
  );
}

function ThemeToggle() {
  const {resolvedTheme, setTheme} = useTheme("dark");
  const isDark = resolvedTheme === "dark";

  return (
    <Tooltip delay={300}>
      <Button
        isIconOnly
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        size="sm"
        variant="ghost"
        onPress={() => setTheme(isDark ? "light" : "dark")}
      >
        <Iconify className="size-4" icon={isDark ? "sun" : "moon"} />
      </Button>
      <Tooltip.Content>
        <p className="text-xs">{isDark ? "Light mode" : "Dark mode"}</p>
      </Tooltip.Content>
    </Tooltip>
  );
}

function DagPreviewToggle() {
  const {dagPreviewVisible, setDagPreviewVisible} = useTracker();

  return (
    <Tooltip delay={300}>
      <Button
        isIconOnly
        aria-label={dagPreviewVisible ? "Hide DAG preview" : "Show DAG preview"}
        size="sm"
        variant={dagPreviewVisible ? "secondary" : "ghost"}
        onPress={() => setDagPreviewVisible(!dagPreviewVisible)}
      >
        <Iconify className="size-4" icon={dagPreviewVisible ? "eye" : "eye-slash"} />
      </Button>
      <Tooltip.Content>
        <p className="text-xs">{dagPreviewVisible ? "Hide DAG preview" : "Show DAG preview"}</p>
      </Tooltip.Content>
    </Tooltip>
  );
}

function HeaderBlock() {
  return (
    <div className="flex flex-col gap-1 px-1 pt-1">
      <WorkspaceSwitcher />
      <SearchRow />
    </div>
  );
}

function NavGroups({
  isBoard,
  isDag,
  isIdeas,
  isList,
  isResolutions,
  openResolutionCount,
  planCount,
  ideaCount,
  pathname,
  sections,
}: {
  isBoard: boolean;
  isDag: boolean;
  isIdeas: boolean;
  isList: boolean;
  isResolutions: boolean;
  openResolutionCount: number;
  planCount: number;
  ideaCount: number;
  pathname: string;
  sections: Array<{id: string; name: string; enabled: boolean; fileCount: number}>;
}) {
  const draftSection = sections.find((section) => section.enabled && section.id === "drafts");
  const otherSections = sections.filter((section) => section.enabled && section.id !== "drafts");

  return (
    <Sidebar.Group>
      {draftSection ? (
        <>
          <Sidebar.Menu aria-label="Drafts">
            <Sidebar.MenuItem
              href={`/sections/${encodeURIComponent(draftSection.id)}`}
              id={`section-${draftSection.id}`}
              isCurrent={pathname === `/sections/${encodeURIComponent(draftSection.id)}`}
              textValue={draftSection.name}
            >
              <Sidebar.MenuIcon>
                <Iconify className="size-4" icon="file-text" />
              </Sidebar.MenuIcon>
              <Sidebar.MenuLabel>{draftSection.name}</Sidebar.MenuLabel>
              <CountChip>{draftSection.fileCount}</CountChip>
            </Sidebar.MenuItem>
          </Sidebar.Menu>
          <Sidebar.Separator className="mx-2 my-2" />
        </>
      ) : null}
      <Sidebar.Menu aria-label="Plans">
        <Sidebar.MenuItem href="/" id="plans" isCurrent={isList} textValue="Plans">
          <Sidebar.MenuIcon>
            <Iconify className="size-4" icon="tray" />
          </Sidebar.MenuIcon>
          <Sidebar.MenuLabel>Plans</Sidebar.MenuLabel>
          <CountChip>{planCount}</CountChip>
        </Sidebar.MenuItem>
        <Sidebar.MenuItem href="/board" id="board" isCurrent={isBoard} textValue="Board">
          <Sidebar.MenuIcon>
            <Iconify className="size-4" icon="layout-cells" />
          </Sidebar.MenuIcon>
          <Sidebar.MenuLabel>Board</Sidebar.MenuLabel>
          <CountChip>{planCount}</CountChip>
        </Sidebar.MenuItem>
        <Sidebar.MenuItem href="/dag" id="dag" isCurrent={isDag} textValue="DAG">
          <Sidebar.MenuIcon>
            <Iconify className="size-4" icon="code-fork" />
          </Sidebar.MenuIcon>
          <Sidebar.MenuLabel>DAG</Sidebar.MenuLabel>
          <CountChip>{planCount}</CountChip>
        </Sidebar.MenuItem>
      </Sidebar.Menu>
      <Sidebar.Separator className="mx-2 my-2" />
      <Sidebar.Menu aria-label="References">
        <Sidebar.MenuItem href="/ideas" id="ideas" isCurrent={isIdeas} textValue="Ideas">
          <Sidebar.MenuIcon>
            <Iconify className="size-4" icon="bulb" />
          </Sidebar.MenuIcon>
          <Sidebar.MenuLabel>Ideas</Sidebar.MenuLabel>
          <CountChip>{ideaCount}</CountChip>
        </Sidebar.MenuItem>
        <Sidebar.MenuItem href="/resolutions" id="resolutions" isCurrent={isResolutions} textValue="Resolutions">
          <Sidebar.MenuIcon>
            <Iconify className="size-4" icon="comments" />
          </Sidebar.MenuIcon>
          <Sidebar.MenuLabel>Resolutions</Sidebar.MenuLabel>
          <CountChip>{openResolutionCount}</CountChip>
        </Sidebar.MenuItem>
        {otherSections.map((section) => (
          <Sidebar.MenuItem
            key={section.id}
            href={`/sections/${encodeURIComponent(section.id)}`}
            id={`section-${section.id}`}
            isCurrent={pathname === `/sections/${encodeURIComponent(section.id)}`}
            textValue={section.name}
          >
            <Sidebar.MenuIcon>
              <Iconify className="size-4" icon="file-text" />
            </Sidebar.MenuIcon>
            <Sidebar.MenuLabel>{section.name}</Sidebar.MenuLabel>
            <CountChip>{section.fileCount}</CountChip>
          </Sidebar.MenuItem>
        ))}
      </Sidebar.Menu>
    </Sidebar.Group>
  );
}

export function AppSidebar() {
  const {pathname} = useLocation();
  const navigate = useNavigate();
  const {isOpen} = useSidebar();
  const {ideas, plans, resolutions, sections} = useTracker();
  const isList = pathname === "/";
  const isResolutions = pathname === "/resolutions";
  const isBoard = pathname === "/board";
  const isDag = pathname === "/dag";
  const isIdeas = pathname.startsWith("/ideas");
  const openResolutionCount = resolutions.filter((resolution) => resolution.status === "open").length;

  return (
    <>
      <Sidebar>
        <Sidebar.Header>
          <HeaderBlock />
        </Sidebar.Header>

        <Sidebar.Content>
          <NavGroups
            isBoard={isBoard}
            isDag={isDag}
            isIdeas={isIdeas}
            isList={isList}
            isResolutions={isResolutions}
            openResolutionCount={openResolutionCount}
            pathname={pathname}
            planCount={plans.length}
            ideaCount={ideas.length}
            sections={sections}
          />
        </Sidebar.Content>

        <Sidebar.Footer>
          <div
            className={`flex items-center gap-1 ${isOpen ? "justify-between px-1" : "flex-col justify-center"}`}
          >
            <ThemeToggle />
            <DagPreviewToggle />
            <Tooltip delay={300}>
              <Button isIconOnly aria-label="Settings" size="sm" variant="ghost" onPress={() => navigate("/settings")}>
                <Iconify className="size-4" icon="gear" />
              </Button>
              <Tooltip.Content>
                <p className="text-xs">Settings</p>
              </Tooltip.Content>
            </Tooltip>
          </div>
        </Sidebar.Footer>

        <Sidebar.Rail />
      </Sidebar>

      <Sidebar.Mobile>
        <Sidebar.Header>
          <HeaderBlock />
        </Sidebar.Header>
        <Sidebar.Content>
          <NavGroups
            isBoard={isBoard}
            isDag={isDag}
            isIdeas={isIdeas}
            isList={isList}
            isResolutions={isResolutions}
            openResolutionCount={openResolutionCount}
            pathname={pathname}
            planCount={plans.length}
            ideaCount={ideas.length}
            sections={sections}
          />
        </Sidebar.Content>
      </Sidebar.Mobile>
    </>
  );
}
