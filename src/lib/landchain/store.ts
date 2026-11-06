// Single LandChain service layer. Screens call these functions; swap the
// implementation for real contract/API calls later without touching the UI.
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import * as E from "./engine";
import { makeSeed, AMA } from "./seed";
import type { ChainState } from "./types";

const KEY = "landchain-demo-v1";
const ACCT_KEY = "landchain-account";
const AUTH_KEY = "landchain-signed-in";

let state: ChainState | null = null;
let current = AMA;
let signedIn = false;
let ready = false;
type Snap = { state: ChainState; current: string; signedIn: boolean; ready: boolean };
let serverSnap: Snap | null = null;
let snap: Snap | null = null;
const listeners = new Set<() => void>();

function get() {
  if (!state) state = makeSeed();
  if (!snap) snap = { state, current, signedIn, ready };
  return snap;
}
function emit() {
  snap = { state: state!, current, signedIn, ready };
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(ACCT_KEY, current);
    localStorage.setItem(AUTH_KEY, signedIn ? "1" : "0");
  }
  listeners.forEach((l) => l());
}

/** Call once on the client after hydration. */
export function hydrateFromStorage() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = JSON.parse(raw);
    const a = localStorage.getItem(ACCT_KEY);
    if (a) current = a;
    signedIn = localStorage.getItem(AUTH_KEY) === "1";
  } catch { /* ignore */ }
  ready = true;
  get();
  emit();
}

export function useChain() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    get,
    () => (serverSnap ??= { state: makeSeed(), current: AMA, signedIn: false, ready: false }),
  );
}
export function useMe() {
  const { state: s, current, signedIn: si, ready: r } = useChain();
  const c = !r || si ? current : "public";
  return { s, me: E.account(s, c) ?? E.account(s, "public")!, id: c };
}

export function switchAccount(id: string) { current = id; emit(); }
export function resetDemo() { state = makeSeed(); signedIn = false; current = AMA; emit(); toast.success("Demo data reset — please sign in again"); }
export function signOut() { signedIn = false; emit(); }
export function signInAs(id: string) { current = id; signedIn = true; emit(); }

async function auth(r: E.Result & { accountId: string }, success: string) {
  state = r.state;
  if (r.ok) { current = r.accountId; signedIn = true; }
  emit();
  if (r.ok) toast.success(success); else toast.error(r.error ?? "Sign-in failed");
  return r;
}
export const authService = {
  login: async (card: string, pin: string) => {
    await new Promise((res) => setTimeout(res, 350));
    return auth(E.login(get().state, { from: "anonymous", now: Date.now() }, E.hashCard(card), E.hashPin(pin)), "Signed in");
  },
  staffLogin: async (id: string, pin: string) =>
    auth(E.staffLogin(get().state, { from: id, now: Date.now() }, id, E.hashPin(pin)), "Signed in as Lands Commission"),
  register: async (name: string, card: string, pin: string, c: "citizen" | "non-citizen") =>
    auth(E.registerCard(get().state, { from: "anonymous", now: Date.now() }, name, E.hashCard(card), E.hashPin(pin), c), "Profile created — waiting for identity check"),
};

type Fn<A extends unknown[]> = (s: ChainState, ctx: E.Ctx, ...a: A) => E.Result;
async function act<A extends unknown[]>(fn: Fn<A>, success: string, ...args: A) {
  const id = toast.loading("Sending to demo chain…");
  await new Promise((r) => setTimeout(r, 450));
  const res = fn(get().state, { from: current, now: Date.now() }, ...args);
  state = res.state;
  emit();
  if (res.ok) toast.success(success, { id, description: `Confirmed in block ${res.tx.block.toLocaleString("en-US")} · ${res.tx.hash.slice(0, 10)}…` });
  else toast.error("Transaction reverted", { id, description: res.error });
  return res;
}

export const landchain = {
  submitIdentity: (hash: string, c: "citizen" | "non-citizen") => act(E.submitIdentity, "Identity submitted for review", hash, c),
  verifyIdentity: (who: string, ok: boolean) => act(E.verifyIdentity, ok ? "Identity verified" : "Identity rejected", who, ok),
  submitApplication: (i: E.ApplicationInput) => act(E.submitApplication, "Application submitted", i),
  approveSurvey: (app: string) => act(E.reviewApplication, "Survey approved", app, "survey", true),
  approveLegal: (app: string) => act(E.reviewApplication, "Legal sign-off approved", app, "legal", true),
  finalise: (app: string) => act(E.reviewApplication, "Title minted", app, "registrar", true),
  rejectApplication: (app: string, step: "survey" | "legal" | "registrar", reason: string) =>
    act(E.reviewApplication, "Application rejected", app, step, false, reason),
  listForSale: (pid: string, price: number) => act(E.listForSale, "Listed for sale", pid, price),
  cancelListing: (pid: string) => act(E.cancelListing, "Listing cancelled", pid),
  buyListed: (pid: string) => act(E.buyListed, "Paid into escrow", pid),
  approveSale: (sale: string) => act(E.approveSale, "Sale approved — title transferred", sale),
  rejectSale: (sale: string) => act(E.rejectSale, "Sale rejected — buyer refunded", sale),
  raiseDispute: (sale: string, reason: string, ev?: string) => act(E.raiseDispute, "Dispute raised", sale, reason, ev),
  resolveDispute: (d: string, f: "buyer" | "seller") => act(E.resolveDispute, "Dispute resolved", d, f),
  faucet: () => act(E.faucet, "1,000,000 tGHS added"),
};

export async function sha256Hex(data: ArrayBuffer | string) {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const d = await crypto.subtle.digest("SHA-256", buf);
  return "0x" + [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
