import type { Account, ChainState } from "./types";

export function queueItems(s: ChainState) {
  return {
    identities: s.accounts.filter((a) => a.identity === "pending"),
    applications: s.applications.filter((a) => a.decision === "waiting"),
    transfers: s.transfers.filter((t) => t.decision === "waiting"),
  };
}

/** Count of items waiting; when `me` is given, only items that account can act on. */
export function pendingCountFor(s: ChainState, me: Account | null) {
  const q = queueItems(s);
  if (!me) return q.identities.length + q.applications.length + q.transfers.length;
  return (me.roles.includes("Identity officer") ? q.identities.length : 0)
    + (me.roles.includes("Registrar") ? q.applications.length + q.transfers.length : 0);
}
