// Pure helpers over the ChainState that snapshot.ts reads from the contracts. No rules live here:
// the Solidity contracts enforce them. These only look things up and pre-check the boundary drawing.
import { insideGhana, polygonsOverlap, type LatLng } from "./geo";
import type { Account, ChainState, Interest, Role } from "./types";

export function fakeHash(input: string): string {
  let h1 = 0x811c9dc5, h2 = 0x1234567;
  for (let i = 0; i < input.length; i++) {
    h1 = Math.imul(h1 ^ input.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 + input.charCodeAt(i), 2654435761);
  }
  let out = "";
  for (let i = 0; i < 8; i++) {
    h1 = Math.imul(h1 ^ (h2 >>> 7), 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (h1 >>> 3), 2246822507) >>> 0;
    out += (h1 >>> 0).toString(16).padStart(8, "0").slice(0, 8);
  }
  return "0x" + out;
}

export function account(s: ChainState, id: string): Account | undefined {
  return s.accounts.find((a) => a.id === id);
}
export function hasRole(s: ChainState, id: string, role: Role) {
  return !!account(s, id)?.roles.includes(role);
}

export interface ApplicationInput {
  parcelId: string; interest: Interest; holder: string; region: string; location: string;
  pillars: LatLng[]; docs: { type: string; name: string; hash: string }[];
}

/** Checked in the browser before sending. The contract checks id format, duplicates and Ghana's box itself. */
export function validateBoundary(s: ChainState, pillars: LatLng[], ignoreId?: string): string | null {
  if (pillars.length < 3) return "A boundary needs at least 3 corner pillars";
  if (!pillars.every(insideGhana)) return "All pillars must be inside Ghana";
  const hit = s.parcels.find((p) => p.id !== ignoreId && p.status !== "rejected" && polygonsOverlap(pillars, p.pillars));
  if (hit) return `Boundary overlaps neighbouring parcel ${hit.id}`;
  return null;
}

export function getParcel(s: ChainState, id: string) {
  return s.parcels.find((p) => p.id.toLowerCase() === id.trim().toLowerCase());
}
export function getHistory(s: ChainState, id: string) {
  return s.history.filter((h) => h.parcelId === id).sort((a, b) => a.block - b.block);
}
export function openTransfer(s: ChainState, parcelId: string) {
  return s.transfers.find((t) => t.parcelId === parcelId && t.decision === "waiting");
}
export function applicationFor(s: ChainState, parcelId: string) {
  return [...s.applications].reverse().find((a) => a.parcelId === parcelId);
}
