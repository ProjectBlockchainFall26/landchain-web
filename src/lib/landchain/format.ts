import type { ParcelStatus } from "./types";

export const acres = (n: number) => `${n.toFixed(2)} acres`;
export const blockNo = (n: number) => n.toLocaleString("en-US");
export const shortHash = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
export const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral";
export const STATUS_LABEL: Record<ParcelStatus, string> = {
  pending: "Pending", registered: "Registered", transfer_pending: "Transfer pending", rejected: "Rejected",
};
export const STATUS_TONE: Record<ParcelStatus, Tone> = {
  pending: "warn", registered: "ok", transfer_pending: "info", rejected: "bad",
};
