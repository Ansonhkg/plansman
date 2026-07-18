import {useNavigate} from "react-router";

import {Command} from "@heroui-pro/react";

import {StatusIcon} from "./atoms";
import {Iconify} from "../icons/iconify";
import {formatPlanId} from "../data/tracker";
import {useTracker} from "../state/tracker";

function Keys({combo}: {combo: string[]}) {
  return (
    <span className="ml-auto flex items-center gap-1">
      {combo.map((key, index) =>
        key === "then" ? (
          <span key={index} className="text-muted text-[11px]">
            then
          </span>
        ) : (
          <kbd
            key={index}
            className="bg-default text-muted flex h-5 min-w-5 items-center justify-center rounded px-1 text-[11px] font-medium"
          >
            {key}
          </kbd>
        ),
      )}
    </span>
  );
}

export function CommandPalette() {
  const navigate = useNavigate();
  const {commandOpen, setCommandOpen, openIssue, plans, setNewIssueOpen} = useTracker();

  const handle = (key: string) => {
    setCommandOpen(false);

    if (key === "nav-inbox" || key === "nav-active" || key === "nav-my") navigate("/");
    else if (key === "nav-board") navigate("/board");
    else if (key === "nav-dag") navigate("/dag");
    else if (key === "action-new-plan") setNewIssueOpen(true);
    else if (key.startsWith("plan-")) openIssue(key);
  };

  return (
    <Command>
      <Command.Backdrop isOpen={commandOpen} variant="blur" onOpenChange={setCommandOpen}>
        <Command.Container size="lg">
          <Command.Dialog>
            <Command.InputGroup>
              <Command.InputGroup.Prefix>
                <Iconify className="size-4" icon="magnifier" />
              </Command.InputGroup.Prefix>
              <Command.InputGroup.Input placeholder="Type a command or search..." />
              <Command.InputGroup.ClearButton />
            </Command.InputGroup>
            <Command.List
              renderEmptyState={() => (
                <div className="text-muted flex h-20 items-center justify-center text-sm">
                  No results found.
                </div>
              )}
              onAction={(key) => handle(String(key))}
            >
              <Command.Group heading="Navigation">
                <Command.Item id="nav-inbox" textValue="Go to Inbox">
                  <Iconify className="size-4" icon="tray" />
                  <span>Go to Inbox</span>
                  <Keys combo={["G", "then", "I"]} />
                </Command.Item>
                <Command.Item id="nav-active" textValue="Go to Active plans">
                  <Iconify className="size-4" icon="circle" />
                  <span>Go to Active plans</span>
                  <Keys combo={["G", "then", "A"]} />
                </Command.Item>
                <Command.Item id="nav-board" textValue="Go to Board">
                  <Iconify className="size-4" icon="layout-columns" />
                  <span>Go to Board</span>
                  <Keys combo={["G", "then", "B"]} />
                </Command.Item>
                <Command.Item id="nav-dag" textValue="Go to DAG">
                  <Iconify className="size-4" icon="code-fork" />
                  <span>Go to DAG</span>
                  <Keys combo={["G", "then", "D"]} />
                </Command.Item>
                <Command.Item id="nav-my" textValue="Go to Plans">
                  <Iconify className="size-4" icon="person" />
                  <span>Go to Plans</span>
                  <Keys combo={["G", "then", "M"]} />
                </Command.Item>
              </Command.Group>

              <Command.Group heading="Plan">
                <Command.Item id="action-new-plan" textValue="New plan">
                  <Iconify className="size-4" icon="square-plus" />
                  <span>New plan...</span>
                  <Keys combo={["C"]} />
                </Command.Item>
              </Command.Group>

              <Command.Group heading="Plans">
                {plans.map((plan) => (
                  <Command.Item
                    key={formatPlanId(plan)}
                    id={formatPlanId(plan)}
                    textValue={`${formatPlanId(plan)} ${plan.title}`}
                  >
                    <StatusIcon size={16} state={plan.status} />
                    <span className="truncate">{plan.title}</span>
                    <span className="text-muted ml-auto font-mono text-[11px] tabular-nums">
                      {formatPlanId(plan)}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
            <Command.Footer className="justify-between [&_kbd]:h-5 [&_kbd]:text-xs">
              <div className="flex items-center gap-3">
                <span className="text-muted text-xs">Navigate & select</span>
              </div>
              <span className="text-muted text-xs">Esc to close</span>
            </Command.Footer>
          </Command.Dialog>
        </Command.Container>
      </Command.Backdrop>
    </Command>
  );
}
