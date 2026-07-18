<!-- plansman -->
## Planning

Use the `plansman` command; plans live in workspace plansman.
When creating a plan, synthesize the complete PRD first, then use
`plansman new` with `--title`, `--file` (or `--stdin`), `--objective`,
`--requirements`, and `--forbidden` so the plan stores the PRD and goals.
Use `plansman claim` only when intentionally reserving a blank scaffold.
Use `plansman idea <title>` to capture a rough thought without promoting it
to accepted work. When asked what ideas exist, run `plansman idea list`.
When product intent is mature, use `plansman idea shape` to preserve a PRD
and explicit goals before promotion copies the full PRD into the plan.
<!-- /plansman -->
