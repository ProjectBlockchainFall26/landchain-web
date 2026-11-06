import type { ParcelStatus } from "./types";

export const cedi = (n: number) => `GH₵ ${Math.round(n).toLocaleString("en-US")}`;
export const cediShort = (n: number) =>
  n >= 1_000_000 ? `GH₵ ${(n / 1_000_000).toFixed(n % 1_000_000 ? 2 : 0)}M` : n >= 1000 ? `GH₵ ${Math.round(n / 1000)}k` : cedi(n);
export const acres = (n: number) => `${n.toFixed(2)} acres`;
export const blockNo = (n: number) => n.toLocaleString("en-US");
export const shortHash = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
export const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral";
export const STATUS_LABEL: Record<ParcelStatus, string> = {
  pending: "Pending", verified: "Not listed", for_sale: "For sale", in_escrow: "In escrow",
  sold: "Sold", frozen: "Frozen", rejected: "Rejected",
};
export const STATUS_TONE: Record<ParcelStatus, Tone> = {
  pending: "warn", verified: "neutral", for_sale: "ok", in_escrow: "warn", sold: "bad", frozen: "info", rejected: "bad",
};
