// Enquiries from people interested in a parcel. They go to the owner WITHOUT revealing the owner's identity:
// the enquirer sees only the public ID; the owner reads the message and decides whether to get in touch.
//
// Messages hold personal contact details, so they never go on chain. In production they live in the backend;
// for the class demo they are kept in this browser's localStorage.
import { useSyncExternalStore } from "react";

export interface Enquiry {
  id: string;
  parcelId: string;
  to: string; // owner's public ID at the time
  from: string; // enquirer's public ID, or "public"
  name: string;
  contact: string;
  message: string;
  at: number;
  status: "new" | "read" | "answered";
}

const KEY = "landchain-enquiries";
const listeners = new Set<() => void>();
let cache: Enquiry[] | null = null;
const read = (): Enquiry[] => {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { cache = []; }
  return cache!;
};
const write = (all: Enquiry[]) => { cache = all; localStorage.setItem(KEY, JSON.stringify(all)); listeners.forEach((l) => l()); };

export function sendEnquiry(e: Omit<Enquiry, "id" | "at" | "status">) {
  write([{ ...e, id: `ENQ-${Date.now().toString(36)}`, at: Date.now(), status: "new" }, ...read()]);
}
export function markEnquiry(id: string, status: Enquiry["status"]) {
  write(read().map((e) => (e.id === id ? { ...e, status } : e)));
}
const EMPTY: Enquiry[] = [];
export function useEnquiries() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, read, () => EMPTY);
}
