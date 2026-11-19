// Single LandChain service layer. Screens call these functions and read useChain()/useMe(); they never
// talk to the chain directly. Reads come from the deployed contracts (chain/snapshot.ts); every write is a
// real transaction (chain/client.ts).
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import * as E from "./engine";
import type { ChainState, Tx } from "./types";
import { chainName, CHAIN_ID, deployment, RPC_URL, toMicro } from "./chain/config";
import { chainCardHash, connectMetaMask, publicIdOf, reader, RevertError, send } from "./chain/client";
import { loadChainState, recordRevert, rememberName } from "./chain/snapshot";
import { areaAcres } from "./geo";

const ACCT_KEY = `landchain-account:${CHAIN_ID}`;
const AUTH_KEY = `landchain-signed-in:${CHAIN_ID}`;

export type ChainStatus =
  | { kind: "loading"; rpc: string; name: string }
  | { kind: "ok"; rpc: string; name: string; chainId: number }
  | { kind: "error"; rpc: string; name: string; error: string };

const emptyState = (): ChainState => ({
  block: 0, accounts: [{ id: "public", name: "Public visitor", kind: "public", roles: [], identity: "none" }],
  parcels: [], applications: [], transfers: [], history: [], txs: [], notifications: [],
});
const initialStatus = (): ChainStatus => ({ kind: "loading", rpc: RPC_URL, name: chainName });

let state: ChainState = emptyState();
let current = "public";
let signedIn = false;
let ready = false;
let status: ChainStatus = initialStatus();
type Snap = { state: ChainState; current: string; signedIn: boolean; ready: boolean; status: ChainStatus };
let serverSnap: Snap | null = null;
let snap: Snap | null = null;
const listeners = new Set<() => void>();

function get() {
  if (!snap) snap = { state, current, signedIn, ready, status };
  return snap;
}
function emit() {
  snap = { state, current, signedIn, ready, status };
  if (typeof window !== "undefined") {
    localStorage.setItem(ACCT_KEY, current);
    localStorage.setItem(AUTH_KEY, signedIn ? "1" : "0");
  }
  listeners.forEach((l) => l());
}

// ---------- loading and polling ----------
let loading: Promise<void> | null = null;
let lastBlock = -1;
async function refresh(force = false) {
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
      status = {
        kind: "error", rpc: RPC_URL, name: chainName,
        error: /fetch|ECONNREFUSED|connection/i.test(msg) ? `Can't reach ${RPC_URL}. Is the chain running?`
          : /decoding|Returned values aren't valid|execute a function inside a smart contract/i.test(msg) ? "This chain doesn't have the current LandChain contracts. In landchain-contracts run npm run chain:fresh, then npm run setup:local, then npm run contracts:sync here."
          : msg,
      };
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
    const a = localStorage.getItem(ACCT_KEY);
    if (a) current = a;
    signedIn = localStorage.getItem(AUTH_KEY) === "1";
  } catch { /* ignore */ }
  get();
  void refresh(true);
  setInterval(() => void refresh(), 3000); // picks up blocks mined by other people / tabs
}

export function useChain() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    get,
    () => (serverSnap ??= { state: emptyState(), current: "public", signedIn: false, ready: false, status: initialStatus() }),
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
export function signOut() { signedIn = false; emit(); }
export function signInAs(id: string) { current = id; signedIn = true; emit(); }

/** Connect MetaMask and act as its selected account. */
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
    const error = errorText(e);
    toast.error("Couldn't connect the wallet", { description: error });
    return { ok: false as const, error };
  }
}

/** MetaMask rejects with plain objects ({ code, message }), not Errors. */
function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as { code?: number; message?: string };
    if (o.code === 4001) return "You cancelled the request in MetaMask";
    if (o.code === -32002) return "MetaMask already has a request open. Click the MetaMask icon to finish it.";
    if (o.message) return o.message;
  }
  return String(e);
}

/** keccak256 of a Ghana Card number. Only this hash is sent; the number never leaves the browser. */
export const hashCard = (card: string) => chainCardHash(card);
/** Names stay on this device (never on chain). */
export function setMyName(name: string) {
  const me = get().state.accounts.find((a) => a.id === current);
  if (me?.address) { rememberName(me.address, name.trim()); void refresh(true); }
}

// ---------- writes ----------
type ActResult = { ok: boolean; error?: string | undefined };
interface Call { contract: Parameters<typeof send>[0]; method: string; args: unknown[]; label: string }

/** Sends one contract call from the current account, with progress toasts. */
async function chainAct(success: string, build: (s: ChainState, me: string) => Call | string): Promise<ActResult> {
  const s = get().state;
  const me = s.accounts.find((a) => a.id === current);
  const t: { id?: string | number } = {}; // the progress toast, once there is one
  const fail = async (error: string, call?: Call): Promise<ActResult> => {
    if (call && me) {
      const tx: Tx = { hash: E.fakeHash(`${Date.now()}${call.method}`), contract: call.contract, fn: call.method, args: call.label, from: me.id, block: s.block, at: Date.now(), status: "Reverted", error };
      recordRevert(tx);
    }
    toast.error(call ? "Transaction reverted" : "Can't send this", { ...t, description: error });
    await refresh(true);
    return { ok: false, error };
  };
  if (!me?.address) return fail(me?.kind === "public" ? "Public visitors can't send transactions. Sign in first." : "Sign in with a wallet first.");
  const call = build(s, me.address);
  if (typeof call === "string") return fail(call);

  t.id = toast.loading(`Sending to ${chainName}…`);
  try {
    const sent = await send(call.contract, call.method, call.args, me.address);
    await refresh(true);
    toast.success(success, { ...t, description: `Confirmed in block ${sent.block.toLocaleString("en-US")} · ${sent.hash.slice(0, 10)}…` });
    return { ok: true };
  } catch (e) {
    return fail(e instanceof RevertError ? e.message : errorText(e), call);
  }
}

// Lookups from the UI's ids to on-chain ids.
const num = (id: string) => Number(id.split("-").pop());
const addr = (s: ChainState, accountId: string) => s.accounts.find((a) => a.id === accountId)?.address;
const INTEREST_INDEX = { Allodial: 0, "Customary freehold": 1, "Common-law freehold": 2, Leasehold: 3 } as const;

export const landchain = {
  // IdentityRegistry
  submitIdentity: (hash: string, c: "citizen" | "non-citizen") =>
    chainAct("Identity submitted for review", () => ({ contract: "IdentityRegistry", method: "submitProfile", args: [hash, c === "citizen"], label: `${hash.slice(0, 10)}…, ${c}` })),
  verifyIdentity: (who: string, ok: boolean) =>
    chainAct(ok ? "Identity verified" : "Identity rejected", (s) => {
      const a = addr(s, who);
      return a ? { contract: "IdentityRegistry", method: ok ? "verifyProfile" : "rejectProfile", args: [a], label: who } : "Unknown person";
    }),

  // TitleRegistry: registration
  submitApplication: (i: E.ApplicationInput) =>
    chainAct("Application submitted", (s) => {
      // Overlap between different polygons is checked here; the contract enforces id format,
      // unique id, unique boundary and the Ghana bounding box.
      const err = E.validateBoundary(s, i.pillars);
      if (err) return err;
      const input = {
        parcelId: i.parcelId, interest: INTEREST_INDEX[i.interest], holder: i.holder, region: i.region, location: i.location,
        acresX100: Math.max(1, Math.round(areaAcres(i.pillars) * 100)),
        lats: i.pillars.map((p) => toMicro(p[0])), lngs: i.pillars.map((p) => toMicro(p[1])),
        docs: i.docs.map((d) => ({ docType: d.type, name: d.name, hash: d.hash })),
      };
      return { contract: "TitleRegistry", method: "submitApplication", args: [input], label: `"${i.parcelId}", ${i.pillars.length} pillars` };
    }),
  approveApplication: (app: string) =>
    chainAct("Registered: title NFT minted", () => ({ contract: "TitleRegistry", method: "approveApplication", args: [num(app)], label: app })),
  rejectApplication: (app: string, reason: string) =>
    chainAct("Application rejected", () => ({ contract: "TitleRegistry", method: "rejectApplication", args: [num(app), reason], label: `${app}, "${reason}"` })),

  // TitleRegistry: transfer of ownership
  requestTransfer: (parcelId: string, to: string) =>
    chainAct("Transfer requested: waiting for the registrar", (s) => {
      const p = s.parcels.find((x) => x.id === parcelId);
      const a = addr(s, to);
      if (!p) return `Parcel ${parcelId} does not exist`;
      if (!a) return "Pick the new owner";
      return { contract: "TitleRegistry", method: "requestTransfer", args: [p.recordId, a], label: `"${parcelId}", ${to}` };
    }),
  cancelTransfer: (trf: string) =>
    chainAct("Transfer cancelled", () => ({ contract: "TitleRegistry", method: "cancelTransfer", args: [num(trf)], label: trf })),
  approveTransfer: (trf: string) =>
    chainAct("Transfer approved: title moved to the new owner", () => ({ contract: "TitleRegistry", method: "approveTransfer", args: [num(trf)], label: trf })),
  rejectTransfer: (trf: string, reason: string) =>
    chainAct("Transfer rejected", () => ({ contract: "TitleRegistry", method: "rejectTransfer", args: [num(trf), reason], label: `${trf}, "${reason}"` })),
};

export async function sha256Hex(data: ArrayBuffer | string) {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const d = await crypto.subtle.digest("SHA-256", buf);
  return "0x" + [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
