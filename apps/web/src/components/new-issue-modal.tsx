import {useState} from "react";

import {Button, Input, Modal, TextField, toast} from "@heroui/react";

import {Iconify} from "../icons/iconify";
import {formatPlanId} from "../data/tracker";
import {useTracker} from "../state/tracker";

export function NewIssueModal() {
  const {newIssueOpen, setNewIssueOpen, claimPlan, openIssue} = useTracker();
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setTitle("");
    setTarget("");
    setError(null);
    setSubmitting(false);
  };

  const close = () => {
    setNewIssueOpen(false);
    reset();
  };

  const create = async () => {
    const name = title.trim();
    const targetId = target.trim();
    if (!name) return;

    setSubmitting(true);
    setError(null);

    try {
      const plan = await claimPlan({title: name, ...(targetId ? {target: targetId} : {})});

      if (plan) {
        close();
        openIssue(plan.summary.fileName.replace(/\.md$/, ""));
        toast(`Claimed ${formatPlanId(plan.summary)}`, {variant: "accent", timeout: 2500});
      }
    } catch (caught) {
      setSubmitting(false);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <Modal>
      <Modal.Backdrop
        isOpen={newIssueOpen}
        variant="blur"
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <Modal.Container placement="center" size="lg">
          <Modal.Dialog className="sm:max-w-[560px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <div className="flex items-center gap-1.5">
                <span className="bg-accent/20 text-accent flex size-4 items-center justify-center rounded text-[9px] font-bold">
                  P
                </span>
                <span className="text-muted text-xs">Plansman</span>
                <Iconify className="text-muted/60 size-3 shrink-0" icon="chevron-right" />
                <span className="text-foreground text-xs font-medium">New plan</span>
              </div>
            </Modal.Header>
            <Modal.Body className="gap-3">
              <TextField
                aria-label="Plan title"
                autoFocus
                className="w-full"
                value={title}
                onChange={setTitle}
              >
                <Input
                  className="border-0 bg-transparent px-0 text-lg font-medium shadow-none placeholder:text-muted/70 focus:ring-0"
                  placeholder="Plan title"
                  variant="secondary"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void create();
                  }}
                />
              </TextField>

              <TextField
                aria-label="Plan id"
                className="w-full"
                value={target}
                onChange={setTarget}
              >
                <Input
                  className="border-0 bg-transparent px-0 text-sm shadow-none placeholder:text-muted/70 focus:ring-0"
                  placeholder="Plan id optional, e.g. 33 or 30b"
                  variant="secondary"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void create();
                  }}
                />
              </TextField>

              {error ? (
                <div className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-200" role="alert">
                  Plans API error: {error}
                </div>
              ) : null}
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary" onPress={close}>
                Cancel
              </Button>
              <Button
                isDisabled={title.trim().length === 0 || submitting}
                variant="primary"
                onPress={() => void create()}
              >
                Claim plan
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
