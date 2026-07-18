import type { PlanSummary } from "../../surfaces/contracts/plansman.v1";

export type PlanDagBranch = {
  id: string;
  name: string;
};

export type PlanDagEvent = {
  id: string;
  branch: string;
  parents: string[];
  label: string;
  title: string;
  desc: string;
  tag: string;
  meta: string;
  fileName: string;
  completion: number;
  status: PlanSummary["status"];
};

export type PlanDagData = {
  title: string;
  branches: PlanDagBranch[];
  events: PlanDagEvent[];
};

function planStem(plan: Pick<PlanSummary, "fileName">): string {
  return plan.fileName.replace(/\.md$/, "");
}

function formatPlanRef(plan: Pick<PlanSummary, "fileName">): string {
  return planStem(plan);
}

function sortPlans(plans: PlanSummary[]): PlanSummary[] {
  return [...plans].sort((left, right) => {
    const leftCanonical = isCanonicalPlan(left) ? 0 : 1;
    const rightCanonical = isCanonicalPlan(right) ? 0 : 1;

    return left.id - right.id ||
      leftCanonical - rightCanonical ||
      (left.subPlan ?? "").localeCompare(right.subPlan ?? "") ||
      left.fileName.localeCompare(right.fileName);
  });
}

function isCanonicalPlan(plan: PlanSummary): boolean {
  return Number.isInteger(plan.id) && plan.fileName === `plan-${plan.id}.md`;
}

function branchName(parentId: string, plan: PlanSummary): string {
  return `${formatPlanRef(plan)} fork from ${parentId}`;
}

export function buildPlanDag(plans: PlanSummary[], title = "Plan follow-up DAG"): PlanDagData {
  const ordered = sortPlans(plans);
  const eventIdByNumber = new Map<number, string>();
  const planById = new Map<string, PlanSummary>();

  for (const plan of ordered) {
    planById.set(planStem(plan), plan);
    if (!eventIdByNumber.has(plan.id) || isCanonicalPlan(plan)) {
      eventIdByNumber.set(plan.id, planStem(plan));
    }
  }

  const parentsById = new Map<string, string | null>();
  const childrenByParent = new Map<string, string[]>();
  let previousCanonicalEventId: string | null = null;

  for (const plan of ordered) {
    const id = planStem(plan);
    const sameNumberCanonical = eventIdByNumber.get(plan.id) ?? null;
    const inferredDecimalParent = Number.isInteger(plan.id) ? null : eventIdByNumber.get(Math.floor(plan.id)) ?? null;
    const inferredSameNumberParent = !isCanonicalPlan(plan) && sameNumberCanonical !== id ? sameNumberCanonical : null;
    const parent = plan.followUp === undefined
      ? inferredDecimalParent ?? inferredSameNumberParent ?? previousCanonicalEventId
      : eventIdByNumber.get(plan.followUp) ?? null;
    parentsById.set(id, parent);

    if (parent) {
      const children = childrenByParent.get(parent) ?? [];
      children.push(id);
      childrenByParent.set(parent, children);
    }

    if (isCanonicalPlan(plan)) {
      previousCanonicalEventId = id;
    }
  }

  for (const [parentId, children] of childrenByParent.entries()) {
    const parent = planById.get(parentId);
    children.sort((leftId, rightId) => {
      const left = planById.get(leftId);
      const right = planById.get(rightId);
      const leftContinuation = parent && left && isCanonicalPlan(left) && left.id === Math.floor(parent.id) + 1 ? 0 : 1;
      const rightContinuation = parent && right && isCanonicalPlan(right) && right.id === Math.floor(parent.id) + 1 ? 0 : 1;

      return leftContinuation - rightContinuation || leftId.localeCompare(rightId, undefined, {numeric: true});
    });
  }

  const branches: PlanDagBranch[] = [{ id: "main", name: "Main path" }];
  const branchByEvent = new Map<string, string>();

  const ensureBranch = (id: string, name: string) => {
    if (!branches.some((branch) => branch.id === id)) branches.push({ id, name });
    return id;
  };

  const events = ordered.map<PlanDagEvent>((plan) => {
    const id = planStem(plan);
    const parent = parentsById.get(id) ?? null;
    let branch = "main";

    if (parent) {
      const siblings = childrenByParent.get(parent) ?? [];
      const parentBranch = branchByEvent.get(parent) ?? "main";
      branch = siblings[0] === id
        ? parentBranch
        : ensureBranch(`fork-${parent}-${id}`, branchName(parent, plan));
    } else if (branchByEvent.size > 0) {
      branch = ensureBranch(`root-${id}`, `${formatPlanRef(plan)} root`);
    }

    branchByEvent.set(id, branch);

    return {
      id,
      branch,
      parents: parent ? [parent] : [],
      label: formatPlanRef(plan),
      title: plan.title,
      desc: parent ? `Follows ${parent}.` : "Root plan.",
      tag: plan.status,
      meta: `${Math.round(plan.completion)}% complete`,
      fileName: plan.fileName,
      completion: plan.completion,
      status: plan.status,
    };
  });

  const usedBranches = branches.filter((branch) => events.some((event) => event.branch === branch.id));
  return { title, branches: usedBranches, events };
}
