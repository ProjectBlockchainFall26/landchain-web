// Single LandChain service layer. Screens call these functions and read useChain()/useMe(); they never
// talk to the chain or the demo engine directly.
//
//   chain mode (default): reads come from the deployed contracts (chain/snapshot.ts), writes are real
//                         transactions (chain/client.ts). Set VITE_LANDCHAIN_MODE=demo to switch off.
//   demo mode:            the in-browser demo engine (engine.ts) with seeded data, no chain needed.
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import * as E from "./engine";
import { makeSeed, AMA } from "./seed";
import type { ChainState, Tx } from "./types";
import { chainName, CHAIN_ID, deployment, MODE, RPC_URL, toMicro, toUnits } from "./chain/config";
import { chainCardHash, connectMetaMask, publicIdOf, reader, RevertError, send, view } from "./chain/client";
import { loadChainState, recordRevert, rememberName } from "./chain/snapshot";
import { areaAcres } from "./geo";

export { MODE } from "./chain/config";

const KEY = "landchain-demo-v1";
const ACCT_KEY = MODE === "chain" ? `landchain-account:${CHAIN_ID}` : "landchain-account";
const AUTH_KEY = MODE === "chain" ? `landchain-signed-in:${CHAIN_ID}` : "landchain-signed-in";

export type ChainStatus =
  | { kind: "demo" }
  | { kind: "loading"; rpc: string; name: string }
  | { kind: "ok"; rpc: string; name: string; chainId: number }
  | { kind: "error"; rpc: string; name: string; error: string };

const emptyState = (): ChainState => ({
  block: 0, accounts: [{ id: "public", name: "Public visitor", kind: "public", roles: [], identity: "none" }],
  parcels: [], applications: [], sales: [], disputes: [], history: [], txs: [], wallets: {}, notifications: [], nextToken: 1, nextTitle: 1,
});
const initialStatus = (): ChainStatus => (MODE === "demo" ? { kind: "demo" } : { kind: "loading", rpc: RPC_URL, name: chainName });

let state: ChainState | null = null;
let current = MODE === "demo" ? AMA : "public";
let signedIn = false;
let ready = false;
let status: ChainStatus = initialStatus();
type Snap = { state: ChainState; current: string; signedIn: boolean; ready: boolean; status: ChainStatus };
let serverSnap: Snap | null = null;
let snap: Snap | null = null;
const listeners = new Set<() => void>();

function get() {
  if (!state) state = MODE === "demo" ? makeSeed() : emptyState();
  if (!snap) snap = { state, current, signedIn, ready, status };
  return snap;
}
function emit() {
  snap = { state: state!, current, signedIn, ready, status };
  if (typeof window !== "undefined") {
    if (MODE === "demo") localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(ACCT_KEY, current);
    localStorage.setItem(AUTH_KEY, signedIn ? "1" : "0");
  }
  listeners.forEach((l) => l());
}

// ---------- chain mode: loading and polling ----------
let loading: Promise<void> | null = null;
let lastBlock = -1;
async function refresh(force = false) {
  if (MODE !== "chain") return;
  if (loading) return loading;
  loading = (async () => {
    try {
      if (!deployment) throw new Error(`No contracts recorded for chain ${CHAIN_ID}. Deploy them, then run npm run contracts:sync.`);
      const block = Number(await reader().web3.eth.getBlockNumber());
      if (!force && block === lastBlock && status.kind === "ok") return;
      state = await loadChainState();
      lastBlock = block;
      status = { kind: "ok", rpc: RPC_URL, name: chainName, chainId: CHAIN_ID };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      status = { kind: "error", rpc: RPC_URL, name: chainName, error: /fetch|ECONNREFUSED|connection/i.test(msg) ? `Can't reach ${RPC_URL}. Is the chain running?` : msg };
    } finally {
      ready = true;
      loading = null;
      emit();
    }
  })();
  return loading;
}
export const reloadChain = () => refresh(true);

/** Call once on the client after hydration. */
export function hydrateFromStorage() {
  try {
    if (MODE === "demo") {
      const raw = localStorage.getItem(KEY);
      if (raw) state = JSON.parse(raw);
    }
    const a = localStorage.getItem(ACCT_KEY);
    if (a) current = a;
    signedIn = localStorage.getItem(AUTH_KEY) === "1";
  } catch { /* ignore */ }
  if (MODE === "demo") {
    ready = true;
    get();
    emit();
    return;
  }
  get();
  void refresh(true);
  setInterval(() => void refresh(), 3000); // picks up blocks mined by other people / tabs
}

export function useChain() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    get,
    () => (serverSnap ??= { state: MODE === "demo" ? makeSeed() : emptyState(), current: MODE === "demo" ? AMA : "public", signedIn: false, ready: false, status: initialStatus() }),
  );
}
/** Current snapshot outside React (tests, scripts). */
export const chainSnapshot = () => get();
export function useMe() {
  const { state: s, current, signedIn: si, ready: r } = useChain();
  const c = !r || si ? current : "public";
  return { s, me: E.account(s, c) ?? E.account(s, "public")!, id: c };
}

export function switchAccount(id: string) { current = id; emit(); }
export function resetDemo() {
  if (MODE === "chain") {
    toast.info("Chain data lives on the blockchain", { description: "Restart Ganache and run npm run setup:local in landchain-contracts to start over." });
    return;
  }
  state = makeSeed(); signedIn = false; current = AMA; emit(); toast.success("Demo data reset — please sign in again");
}
export function signOut() { signedIn = false; emit(); }
export function signInAs(id: string) { current = id; signedIn = true; emit(); }

/** Chain mode: connect MetaMask and act as its selected account. */
export async function connectWallet() {
  try {
    const address = await connectMetaMask((next) => {
      if (next) { current = publicIdOf(next); void refresh(true); } else { signOut(); }
    });
    current = publicIdOf(address);
    signedIn = true;
    await refresh(true);
    toast.success("Wallet connected", { description: `${chainName} · ${publicIdOf(address)}` });
    return { ok: true as const };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    toast.error("Couldn't connect the wallet", { description: error });
    return { ok: false as const, error };
  }
}

/** Hash of a Ghana Card number. Chain mode uses keccak256; the demo engine uses its own toy hash. */
export function hashCard(card: string) {
  return MODE === "chain" ? chainCardHash(card) : E.hashCard(card);
}
/** Chain mode: names stay on this device (never on chain). */
export function setMyName(name: string) {
  const me = get().state.accounts.find((a) => a.id === current);
  if (me?.address) { rememberName(me.address, name.trim()); void refresh(true); }
}

// ---------- demo sign-in (Ghana Card + PIN) ----------
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

// ---------- writes ----------
type Fn<A extends unknown[]> = (s: ChainState, ctx: E.Ctx, ...a: A) => E.Result;
type ActResult = { ok: boolean; error?: string | undefined };

async function act<A extends unknown[]>(fn: Fn<A>, success: string, ...args: A): Promise<ActResult> {
  const id = toast.loading("Sending to demo chain…");
  await new Promise((r) => setTimeout(r, 450));
  const res = fn(get().state, { from: current, now: Date.now() }, ...args);
  state = res.state;
  emit();
  if (res.ok) toast.success(success, { id, description: `Confirmed in block ${res.tx.block.toLocaleString("en-US")} · ${res.tx.hash.slice(0, 10)}…` });
  else toast.error("Transaction reverted", { id, description: res.error });
  return res;
}

interface Call { contract: Parameters<typeof send>[0]; method: string; args: unknown[]; label: string }

/** Sends one or more contract calls in order from the current account, with progress toasts. */
async function chainAct(success: string, build: (s: ChainState, me: string) => Call[] | string): Promise<ActResult> {
  const s = get().state;
  const me = s.accounts.find((a) => a.id === current);
  const fail = async (error: string, call?: Call): Promise<ActResult> => {
    if (call && me) {
      const tx: Tx = { hash: E.fakeHash(`${Date.now()}${call.method}`), contract: call.contract, fn: call.method, args: call.label, from: me.id, block: s.block, at: Date.now(), status: "Reverted", error };
      recordRevert(tx);
    }
    toast.error(call ? "Transaction reverted" : "Can't send this", { ...t, description: error });
    await refresh(true);
    return { ok: false, error };
  };
  const t: { id?: string | number } = {}; // the progress toast, once there is one
  if (!me?.address) return fail(me?.kind === "public" ? "Public visitors can't send transactions. Sign in first." : "Sign in with a wallet first.");
  const plan = build(s, me.address);
  if (typeof plan === "string") return fail(plan);

  t.id = toast.loading(`Sending to ${chainName}…`);
  let last = { hash: "", block: 0 };
  for (const [i, call] of plan.entries()) {
    try {
      if (plan.length > 1) toast.loading(`Step ${i + 1} of ${plan.length}: ${call.method}…`, t);
      last = await send(call.contract, call.method, call.args, me.address);
    } catch (e) {
      return fail(e instanceof RevertError ? e.message : e instanceof Error ? e.message : String(e), call);
    }
  }
  await refresh(true);
  toast.success(success, { ...t, description: `Confirmed in block ${last.block.toLocaleString("en-US")} · ${last.hash.slice(0, 10)}…` });
  return { ok: true };
}

// Lookups from the UI's ids to on-chain ids.
const num = (id: string) => Number(id.split("-").pop());
const rec = (s: ChainState, parcelId: string) => s.parcels.find((p) => p.id === parcelId)?.recordId;
const addr = (s: ChainState, accountId: string) => s.accounts.find((a) => a.id === accountId)?.address;
const STEP_INDEX = { survey: 0, legal: 1, registrar: 2 } as const;
const STEP_METHOD = { survey: "approveSurvey", legal: "approveLegal", registrar: "finalise" } as const;
const ZERO32 = "0x" + "0".repeat(64);
const INTEREST_INDEX = { Allodial: 0, "Customary freehold": 1, "Common-law freehold": 2, Leasehold: 3 } as const;

const parcelCall = (contract: Call["contract"], method: string, s: ChainState, parcelId: string, extra: unknown[] = [], extraLabel = ""): Call[] | string => {
  const r = rec(s, parcelId);
  return r ? [{ contract, method, args: [r, ...extra], label: `"${parcelId}"${extraLabel}` }] : `Parcel ${parcelId} does not exist`;
};

const chainImpl = {
  submitIdentity: (hash: string, c: "citizen" | "non-citizen") =>
    chainAct("Identity submitted for review", () => [{ contract: "IdentityRegistry", method: "submitProfile", args: [hash, c === "citizen"], label: `${hash.slice(0, 10)}…, ${c}` }]),
  verifyIdentity: (who: string, ok: boolean) =>
    chainAct(ok ? "Identity verified" : "Identity rejected", (s) => {
      const a = addr(s, who);
      return a ? [{ contract: "IdentityRegistry", method: ok ? "verifyProfile" : "rejectProfile", args: [a], label: who }] : "Unknown person";
    }),
  submitApplication: (i: E.ApplicationInput) =>
    chainAct("Application submitted", (s) => {
      // Overlap between different polygons is checked here (and later by the backend's PostGIS index);
      // the contract enforces id format, unique id, unique boundary and the Ghana bounding box.
      const err = E.validateBoundary(s, i.pillars);
      if (err) return err;
      const input = {
        parcelId: i.parcelId, interest: INTEREST_INDEX[i.interest], holder: i.holder, region: i.region, location: i.location,
        acresX100: Math.max(1, Math.round(areaAcres(i.pillars) * 100)),
        lats: i.pillars.map((p) => toMicro(p[0])), lngs: i.pillars.map((p) => toMicro(p[1])),
        docs: i.docs.map((d) => ({ docType: d.type, name: d.name, hash: d.hash })),
      };
      return [{ contract: "TitleRegistry", method: "submitApplication", args: [input], label: `"${i.parcelId}", ${i.pillars.length} pillars` }];
    }),
  approveSurvey: (app: string) => chainAct("Survey approved", () => [{ contract: "TitleRegistry", method: STEP_METHOD.survey, args: [num(app)], label: app }]),
  approveLegal: (app: string) => chainAct("Legal sign-off approved", () => [{ contract: "TitleRegistry", method: STEP_METHOD.legal, args: [num(app)], label: app }]),
  finalise: (app: string) => chainAct("Title minted", () => [{ contract: "TitleRegistry", method: STEP_METHOD.registrar, args: [num(app)], label: app }]),
  rejectApplication: (app: string, step: "survey" | "legal" | "registrar", reason: string) =>
    chainAct("Application rejected", () => [{ contract: "TitleRegistry", method: "rejectApplication", args: [num(app), STEP_INDEX[step], reason], label: `${app}, "${reason}"` }]),
  listForSale: (pid: string, price: number) =>
    chainAct("Listed for sale", (s) => parcelCall("Marketplace", "listForSale", s, pid, [toUnits(price).toString()], `, ${price.toLocaleString("en-US")}`)),
  cancelListing: (pid: string) => chainAct("Listing cancelled", (s) => parcelCall("Marketplace", "cancelListing", s, pid)),
  buyListed: async (pid: string) => {
    // ERC-20 escrow takes two transactions: let the Marketplace take the price, then buy.
    const s = get().state;
    const p = s.parcels.find((x) => x.id === pid);
    const me = s.accounts.find((a) => a.id === current);
    let needsApproval = true;
    if (p?.price && me?.address) {
      try {
        const allowance = await view<bigint>(reader().c, "TestCedi", "allowance", me.address, deployment!.contracts.Marketplace);
        needsApproval = allowance < toUnits(p.price);
      } catch { /* fall through: approve anyway */ }
    }
    return chainAct("Paid into escrow", (st) => {
      const buy = parcelCall("Marketplace", "buyListed", st, pid);
      if (typeof buy === "string" || !p?.price) return buy; // not listed: let the contract refuse it, with its own message
      const approve: Call = { contract: "TestCedi", method: "approve", args: [deployment!.contracts.Marketplace, toUnits(p.price).toString()], label: `Marketplace, ${p.price.toLocaleString("en-US")}` };
      return needsApproval ? [approve, ...buy] : buy;
    });
  },
  approveSale: (sale: string) => chainAct("Sale approved — title transferred", () => [{ contract: "Marketplace", method: "approveSale", args: [num(sale)], label: sale }]),
  rejectSale: (sale: string) => chainAct("Sale rejected — buyer refunded", () => [{ contract: "Marketplace", method: "rejectSale", args: [num(sale)], label: sale }]),
  raiseDispute: (sale: string, reason: string, ev?: string) =>
    chainAct("Dispute raised", () => [{ contract: "DisputeResolution", method: "raiseDispute", args: [num(sale), reason, ev && /^0x[0-9a-f]{64}$/i.test(ev) ? ev : ZERO32], label: `${sale}, "${reason}"` }]),
  resolveDispute: (d: string, f: "buyer" | "seller") =>
    chainAct("Dispute resolved", () => [{ contract: "DisputeResolution", method: "resolveDispute", args: [num(d), f === "seller"], label: `${d}, ${f}` }]),
  faucet: () => chainAct("1,000,000 tGHS added", () => [{ contract: "TestCedi", method: "faucet", args: [], label: "" }]),
};

const demoImpl = {
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

type LandchainApi = { [K in keyof typeof demoImpl]: (...a: Parameters<(typeof demoImpl)[K]>) => Promise<ActResult> };
export const landchain: LandchainApi = MODE === "chain" ? chainImpl : demoImpl;

export async function sha256Hex(data: ArrayBuffer | string) {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const d = await crypto.subtle.digest("SHA-256", buf);
  return "0x" + [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
