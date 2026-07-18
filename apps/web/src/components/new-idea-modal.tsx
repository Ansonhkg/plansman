import {useState} from "react";

import {Button, Input, Label, Modal, Spinner, TextField, toast} from "@heroui/react";
import {useNavigate, useSearchParams} from "react-router";

import {Iconify} from "../icons/iconify";
import {useTracker} from "../state/tracker";

export function NewIdeaModal() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {captureIdea} = useTracker();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const open = searchParams.get("capture") === "1";

  const close = () => {
    setTitle("");
    setError(null);
    setSubmitting(false);
    navigate("/ideas", {replace: true});
  };

  const submit = async () => {
    const value = title.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const idea = await captureIdea(value);
      toast(`Captured ${idea.summary.label}`, {variant: "accent", timeout: 2400});
      setTitle("");
      navigate(`/ideas/${idea.summary.label}?status=inbox`, {replace: true});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSubmitting(false);
    }
  };

  return (
    <Modal>
      <Modal.Backdrop
        isOpen={open}
        variant="blur"
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <Modal.Container placement="center" size="md">
          <Modal.Dialog aria-label="Capture idea">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <Modal.Header className="flex items-center gap-2">
                <div className="bg-accent/15 text-accent flex size-8 items-center justify-center rounded-lg">
                  <Iconify className="size-4" icon="bulb" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Capture an idea</h2>
                  <p className="text-muted text-xs">A title is enough. Shape it through discussion later.</p>
                </div>
              </Modal.Header>
              <Modal.CloseTrigger />
              <Modal.Body>
                <TextField isRequired autoFocus value={title} onChange={setTitle}>
                  <Label>Idea title</Label>
                  <Input placeholder="What should we explore?" variant="secondary" />
                </TextField>
                {error ? (
                  <div className="rounded-lg bg-danger/10 p-3 text-sm text-danger" role="alert">
                    {error}
                  </div>
                ) : null}
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary" onPress={close}>Cancel</Button>
                <Button isDisabled={!title.trim() || submitting} type="submit" variant="primary">
                  {submitting ? <Spinner color="current" size="sm" /> : <Iconify className="size-4" icon="plus" />}
                  Capture idea
                </Button>
              </Modal.Footer>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
