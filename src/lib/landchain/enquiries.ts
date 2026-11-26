// Enquiries from people interested in a parcel. They go to the owner WITHOUT revealing the owner's identity:
// the enquirer sees only the public ID; the owner reads the message and decides whether to get in touch.
//
// Messages hold personal contact details, so they never go on chain. In backend mode (VITE_API_URL) they live in
// landchain-backend and are relayed to the owner by email/SMS; in chain mode they are kept in this browser's
// localStorage for the class demo.
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { API_MODE } from "./api/config";
import { markEnquiryApi, sendEnquiryApi } from "./api/actions";
import { errorMessage } from "./api/http";
import { apiEnquiryList, reloadChain, useChain } from "./store";

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
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    cache = [];
  }
  return cache!;
};
const write = (all: Enquiry[]) => {
  cache = all;
  localStorage.setItem(KEY, JSON.stringify(all));
  listeners.forEach((l) => l());
};

/** Returns true when the enquiry was accepted. */
export async function sendEnquiry(
  e: Omit<Enquiry, "id" | "at" | "status">,
): Promise<boolean> {
  if (API_MODE) {
    try {
      await sendEnquiryApi(e.parcelId, e.name, e.contact, e.message);
      return true;
    } catch (err) {
      toast.error("Couldn't send the enquiry", {
        description: errorMessage(err),
      });
      return false;
    }
  }
  write([
    {
      ...e,
      id: `ENQ-${Date.now().toString(36)}`,
      at: Date.now(),
      status: "new",
    },
    ...read(),
  ]);
  return true;
}
export function markEnquiry(id: string, status: Enquiry["status"]) {
  if (API_MODE) {
    if (status !== "new")
      void markEnquiryApi(id, status)
        .then(() => reloadChain())
        .catch(() => undefined);
    return;
  }
  write(read().map((e) => (e.id === id ? { ...e, status } : e)));
}
const EMPTY: Enquiry[] = [];
export function useEnquiries(): Enquiry[] {
  // Backend mode: the store reloads enquiries with the rest of the register (re-render on every store update).
  const chain = useChain();
  const local = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    API_MODE ? () => EMPTY : read,
    () => EMPTY,
  );
  return API_MODE ? (chain.ready ? apiEnquiryList() : EMPTY) : local;
}
