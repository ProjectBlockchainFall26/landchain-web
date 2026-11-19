// Who may see what. The blockchain itself is public: anything stored in a contract can be read by anyone
// running a node. So names, documents and contact details are kept OFF chain, and the app shows them only to
// the people allowed to see them. This file is the single place those rules live.
import { account } from "./engine";
import type { Account, ChainState, Parcel } from "./types";

/** Lands Commission officers and the parcel's own owner (or applicant) see its private details. */
export function canSeePrivate(me: Account, p: Parcel) {
  return me.kind === "officer" || me.id === p.owner || p.owners.includes(me.id);
}

/** Lands Commission officers see everyone's name; a person sees their own; everyone else sees the public ID. */
export function shownName(s: ChainState, me: Account, id: string): string {
  const a = account(s, id);
  if (!a) return id;
  if (a.kind === "officer") return a.name; // officers act in an official capacity
  if (me.kind === "officer" || me.id === id) return a.name;
  return id;
}
