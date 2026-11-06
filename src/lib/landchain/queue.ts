import { currentStep } from "./engine";
import type { Account, ChainState, Role } from "./types";

export function queueItems(s: ChainState) {
  return {
    identities: s.accounts.filter((a) => a.identity === "pending"),
    applications: s.applications.filter((a) => currentStep(a) !== null),
    sales: s.sales.filter((x) => x.status === "awaiting"),
    disputes: s.disputes.filter((d) => !d.outcome),
  };
}

const STEP_ROLE = { survey: "Surveyor", legal: "Lawyer", registrar: "Registrar" } as const;

/** Count of items waiting; when `me` is given, only items that account can act on. */
export function pendingCountFor(s: ChainState, me: Account | null) {
  const q = queueItems(s);
  if (!me) return q.identities.length + q.applications.length + q.sales.length + q.disputes.length;
  const has = (r: Role) => me.roles.includes(r);
  return (
    (has("Identity officer") ? q.identities.length : 0) +
    q.applications.filter((a) => has(STEP_ROLE[currentStep(a)!])).length +
    (has("Registrar") ? q.sales.length : 0) +
    (has("Judge") ? q.disputes.length : 0)
  );
}
