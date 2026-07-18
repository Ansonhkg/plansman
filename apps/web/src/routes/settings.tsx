import {Checkbox, toast} from "@heroui/react";

import {Iconify} from "../icons/iconify";
import {useTracker} from "../state/tracker";

export function SettingsRoute() {
  const {
    activeWorkspace,
    sections,
    toggleSection,
    workspacesError,
    workspacesLoading,
  } = useTracker();

  const onToggle = async (id: string, enabled: boolean) => {
    try {
      await toggleSection(id, enabled);
      toast(`${enabled ? "Enabled" : "Disabled"} ${id}`, {timeout: 1800});
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), {timeout: 2800});
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-border/70 flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <Iconify className="text-muted size-4" icon="gear" />
        <span className="text-foreground text-sm font-medium">Settings</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {workspacesLoading ? (
          <div className="text-muted flex h-32 items-center justify-center text-sm" role="status">
            Loading settings...
          </div>
        ) : workspacesError ? (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
            Workspace API error: {workspacesError}
          </div>
        ) : activeWorkspace ? (
          <div className="max-w-2xl">
            <div className="mb-5">
              <div className="text-muted text-xs">Workspace</div>
              <h1 className="text-foreground mt-1 text-xl font-semibold">{activeWorkspace.name}</h1>
              {activeWorkspace.legacy ? (
                <p className="text-muted mt-2 text-sm">settings persist once this workspace has a plansman.yaml</p>
              ) : null}
            </div>

            <div className="border-border/70 overflow-hidden rounded-md border">
              {sections.map((section) => (
                <div
                  key={section.id}
                  className="border-border/70 flex min-h-12 items-center gap-3 border-b px-3 last:border-b-0"
                >
                  <Checkbox
                    aria-label={`Enable ${section.name}`}
                    isDisabled={activeWorkspace.legacy}
                    isSelected={section.enabled}
                    variant="secondary"
                    onChange={() => void onToggle(section.id, !section.enabled)}
                  >
                    <Checkbox.Content>
                      <Checkbox.Control className="size-4">
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox.Content>
                  </Checkbox>
                  <div className="min-w-0 flex-1">
                    <div className="text-foreground truncate text-sm font-medium">{section.name}</div>
                    <div className="text-muted truncate text-xs">{section.path}</div>
                  </div>
                  <div className="text-muted shrink-0 text-xs tabular-nums">{section.fileCount}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
