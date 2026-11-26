// Single LandChain service layer. Screens call these functions and read useChain()/useMe(); they never
// talk to the chain directly.
//
// Two modes, same screens:
//  - chain mode (default): reads come from the deployed contracts (chain/snapshot.ts) and every write is a
//    real transaction sent from the browser (chain/client.ts).
//  - backend mode (VITE_API_URL set): reads come from landchain-backend's index (api/snapshot.ts) and writes
//    go through its endpoints (api/actions.ts): officers' transactions are signed by the backend, citizens'
//    are prepared by it and signed with dev-sign (local demo) or MetaMask.
import { useSyncExternalStore } from "react";
import Web3 from "web3";
import { toast } from "sonner";
import * as E from "./engine";
import type { ChainState, Tx } from "./types";
import {
  chainName,
  CHAIN_ID,
  deployment,
  RPC_URL,
  toMicro,
} from "./chain/config";
import {
  chainCardHash,
  connectMetaMask,
  publicIdOf,
  reader,
  RevertError,
  send,
} from "./chain/client";
import { loadChainState, recordRevert, rememberName } from "./chain/snapshot";
import { areaAcres } from "./geo";
import { FEE_INDEX } from "./fees";
import type { FeeKind } from "./types";
import type { Enquiry } from "./enquiries";
import { API_MODE, API_URL } from "./api/config";
import { loadApiState } from "./api/snapshot";
import {
  backend,
  linkWallet,
  lookupPublicIdApi,
  setFullName,
} from "./api/actions";
import { api, errorMessage, takeRejectedSignIn } from "./api/http";
import { signInDemo, signInWithPassword, signOutApi, signUp } from "./api/auth";

const ACCT_KEY = `landchain-account:${CHAIN_ID}`;
const AUTH_KEY = `landchain-signed-in:${CHAIN_ID}`;

export type ChainStatus =
  | { kind: "loading"; rpc: string; name: string }
  | { kind: "ok"; rpc: string; name: string; chainId: number }
  | { kind: "error"; rpc: string; name: string; error: string };

const emptyState = (): ChainState => ({
  block: 0,
  accounts: [
    {
      id: "public",
      name: "Public visitor",
      kind: "public",
      roles: [],
      identity: "none",
    },
  ],
  parcels: [],
  applications: [],
  transfers: [],
  payments: [],
  history: [],
  txs: [],
  notifications: [],
});
const SOURCE = API_MODE ? API_URL : RPC_URL;
const initialStatus = (): ChainStatus => ({
  kind: "loading",
  rpc: SOURCE,
  name: chainName,
});

let state: ChainState = emptyState();
let current = "public";
let signedIn = false;
let ready = false;
let status: ChainStatus = initialStatus();
let apiEnquiries: Enquiry[] = [];
type Snap = {
  state: ChainState;
  current: string;
  signedIn: boolean;
  ready: boolean;
  status: ChainStatus;
};
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
    if (API_MODE) return refreshFromApi(force);
    try {
      if (!deployment)
        throw new Error(
          `No contracts recorded for chain ${CHAIN_ID}. Deploy them, then run npm run contracts:sync.`,
        );
      const block = Number(await reader().web3.eth.getBlockNumber());
      if (!force && block === lastBlock && status.kind === "ok") return;
      state = await loadChainState();
      lastBlock = block;
      status = { kind: "ok", rpc: RPC_URL, name: chainName, chainId: CHAIN_ID };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      status = {
        kind: "error",
        rpc: RPC_URL,
        name: chainName,
        error: /fetch|ECONNREFUSED|connection/i.test(msg)
          ? `Can't reach ${RPC_URL}. Is the chain running?`
          : /decoding|Returned values aren't valid|execute a function inside a smart contract/i.test(
                msg,
              )
            ? "This chain doesn't have the current LandChain contracts. In landchain-contracts run npm run chain:fresh, then npm run setup:local, then npm run contracts:sync here."
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

/** Backend mode: poll /chain/status (cheap) and reload everything only when the index moved. */
async function refreshFromApi(force: boolean) {
  try {
    if (!force && status.kind === "ok") {
      const st = await api<{ indexed_block: number | null }>("/chain/status");
      if ((st.indexed_block ?? -1) === lastBlock) return;
    }
    const r = await loadApiState();
    state = r.state;
    apiEnquiries = r.enquiries;
    current = r.me;
    signedIn = r.me !== "public";
    lastBlock = r.status.indexed_block ?? -1;
    status =
      r.status.kind === "ok"
        ? {
            kind: "ok",
            rpc: SOURCE,
            name: r.status.name,
            chainId: r.status.chain_id,
          }
        : {
            kind: "error",
            rpc: SOURCE,
            name: r.status.name,
            error: r.status.error ?? "The chain is unavailable",
          };
  } catch (e) {
    status = {
      kind: "error",
      rpc: SOURCE,
      name: chainName,
      error: errorMessage(e),
    };
  } finally {
    ready = true;
    loading = null;
    emit();
  }
}

/** Backend mode: enquiries addressed to the signed-in owner (enquiries.ts reads them from here). */
export const apiEnquiryList = () => apiEnquiries;

/** Call once on the client after hydration. */
export function hydrateFromStorage() {
  try {
    const a = localStorage.getItem(ACCT_KEY);
    if (a) current = a;
    signedIn = localStorage.getItem(AUTH_KEY) === "1";
  } catch {
    /* ignore */
  }
  get();
  void refresh(true);
  setInterval(() => void refresh(), 3000); // picks up blocks mined by other people / tabs
}

export function useChain() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    get,
    () =>
      (serverSnap ??= {
        state: emptyState(),
        current: "public",
        signedIn: false,
        ready: false,
        status: initialStatus(),
      }),
  );
}
/** Current snapshot outside React (tests, scripts). */
export const chainSnapshot = () => get();
export function useMe() {
  const { state: s, current, signedIn: si, ready: r } = useChain();
  const c = !r || si ? current : "public";
  return { s, me: E.account(s, c) ?? E.account(s, "public")!, id: c };
}

/** Backend mode: sign in as a seeded demo person (Supabase password from VITE_DEMO_PASSWORD, or the dev header). */
async function apiSignInAs(id: string) {
  if (id === "public") {
    await signOutApi();
    await refresh(true);
    return;
  }
  const a = get().state.accounts.find((x) => x.id === id);
  if (!a?.email) {
    toast.error("Can't sign in as this person", {
      description: "Only demo accounts can be picked from the list.",
    });
    return;
  }
  try {
    await signInDemo(a.email);
    await refresh(true);
    const refused = takeRejectedSignIn();
    if (refused) throw new Error(refused);
  } catch (e) {
    toast.error("Couldn't sign in", { description: errorMessage(e) });
  }
}
export function switchAccount(id: string) {
  if (API_MODE) {
    void apiSignInAs(id);
    return;
  }
  current = id;
  emit();
}
export function signOut() {
  if (API_MODE) {
    void signOutApi().then(() => refresh(true));
    return;
  }
  signedIn = false;
  emit();
}
export async function signInAs(id: string): Promise<void> {
  if (API_MODE) return apiSignInAs(id);
  current = id;
  signedIn = true;
  emit();
}
/** Backend mode: sign in with an email and password (Supabase Auth). */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<ActResult> {
  try {
    await signInWithPassword(email, password);
    await refresh(true);
    const refused = takeRejectedSignIn();
    if (refused) return { ok: false, error: refused };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
/** Backend mode: create a Supabase account (email confirmation is off for the class demo). */
export async function signUpWithEmail(
  email: string,
  password: string,
  fullName: string,
): Promise<ActResult> {
  try {
    await signUp(email, password, fullName);
    await refresh(true);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Connect MetaMask and act as its selected account. */
export async function connectWallet() {
  if (API_MODE) {
    if (!get().signedIn) {
      const error =
        "Sign in first, then link your MetaMask wallet to your account.";
      toast.error("Couldn't link the wallet", { description: error });
      return { ok: false as const, error };
    }
    try {
      const address = await linkWallet();
      await refresh(true);
      toast.success("Wallet linked", {
        description: `${publicIdOf(address)} is now your public ID`,
      });
      return { ok: true as const };
    } catch (e) {
      const error = errorText(e);
      toast.error("Couldn't link the wallet", { description: error });
      return { ok: false as const, error };
    }
  }
  try {
    const address = await connectMetaMask((next) => {
      if (next) {
        current = publicIdOf(next);
        void refresh(true);
      } else {
        signOut();
      }
    });
    current = publicIdOf(address);
    signedIn = true;
    await refresh(true);
    toast.success("Wallet connected", {
      description: `${chainName} · ${publicIdOf(address)}`,
    });
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
    if (o.code === -32002)
      return "MetaMask already has a request open. Click the MetaMask icon to finish it.";
    if (o.message) return o.message;
  }
  return String(e);
}

/** keccak256 of a Ghana Card number. Only this hash is sent; the number never leaves the browser. */
export const hashCard = (card: string) => chainCardHash(card);
/** Names stay on this device (never on chain). */
export function setMyName(name: string) {
  if (API_MODE) {
    void setFullName(name.trim()).then(() => refresh(true));
    return;
  }
  const me = get().state.accounts.find((a) => a.id === current);
  if (me?.address) {
    rememberName(me.address, name.trim());
    void refresh(true);
  }
}

// ---------- writes ----------
type ActResult = { ok: boolean; error?: string | undefined };
interface Call {
  contract: Parameters<typeof send>[0];
  method: string;
  args: unknown[];
  label: string;
}

/** Sends one contract call from the current account, with progress toasts. */
async function chainAct(
  success: string,
  build: (s: ChainState, me: string) => Call | string,
): Promise<ActResult> {
  const s = get().state;
  const me = s.accounts.find((a) => a.id === current);
  const t: { id?: string | number } = {}; // the progress toast, once there is one
  const fail = async (error: string, call?: Call): Promise<ActResult> => {
    if (call && me) {
      const tx: Tx = {
        hash: E.fakeHash(`${Date.now()}${call.method}`),
        contract: call.contract,
        fn: call.method,
        args: call.label,
        from: me.id,
        block: s.block,
        at: Date.now(),
        status: "Reverted",
        error,
      };
      recordRevert(tx);
    }
    toast.error(call ? "Transaction reverted" : "Can't send this", {
      ...t,
      description: error,
    });
    await refresh(true);
    return { ok: false, error };
  };
  if (!me?.address)
    return fail(
      me?.kind === "public"
        ? "Public visitors can't send transactions. Sign in first."
        : "Sign in with a wallet first.",
    );
  const call = build(s, me.address);
  if (typeof call === "string") return fail(call);

  t.id = toast.loading(`Sending to ${chainName}…`);
  try {
    const sent = await send(call.contract, call.method, call.args, me.address);
    await refresh(true);
    toast.success(success, {
      ...t,
      description: `Confirmed in block ${sent.block.toLocaleString("en-US")} · ${sent.hash.slice(0, 10)}…`,
    });
    return { ok: true };
  } catch (e) {
    return fail(e instanceof RevertError ? e.message : errorText(e), call);
  }
}

/** Backend mode: one write through the API, with the same progress toasts. */
async function apiAct(
  success: string,
  run: () => Promise<{ block: number | null; tx_hash: string | null }>,
): Promise<ActResult> {
  if (!get().signedIn) {
    const error = "Public visitors can't send transactions. Sign in first.";
    toast.error("Can't send this", { description: error });
    return { ok: false, error };
  }
  const id = toast.loading(
    `Sending to ${status.kind === "ok" ? status.name : chainName}…`,
  );
  try {
    const it = await run();
    await refresh(true);
    toast.success(success, {
      id,
      description: it.block
        ? `Confirmed in block ${it.block.toLocaleString("en-US")} · ${(it.tx_hash ?? "").slice(0, 10)}…`
        : undefined,
    });
    return { ok: true };
  } catch (e) {
    const error = errorMessage(e);
    toast.error("Transaction reverted", { id, description: error });
    await refresh(true);
    return { ok: false, error };
  }
}

// Lookups from the UI's ids to on-chain ids.
const num = (id: string) => Number(id.split("-").pop());
const addr = (s: ChainState, accountId: string) =>
  s.accounts.find((a) => a.id === accountId)?.address;
const INTEREST_INDEX = {
  Allodial: 0,
  "Customary freehold": 1,
  "Common-law freehold": 2,
  Leasehold: 3,
} as const;

const chainLandchain = {
  // IdentityRegistry
  submitIdentity: (hash: string, c: "citizen" | "non-citizen") =>
    chainAct("Identity submitted for review", () => ({
      contract: "IdentityRegistry",
      method: "submitProfile",
      args: [hash, c === "citizen"],
      label: `${hash.slice(0, 10)}…, ${c}`,
    })),
  verifyIdentity: (who: string, ok: boolean) =>
    chainAct(ok ? "Identity verified" : "Identity rejected", (s) => {
      const a = addr(s, who);
      return a
        ? {
            contract: "IdentityRegistry",
            method: ok ? "verifyProfile" : "rejectProfile",
            args: [a],
            label: who,
          }
        : "Unknown person";
    }),

  // TitleRegistry: registration
  submitApplication: (i: E.ApplicationInput) =>
    chainAct("Application submitted", (s) => {
      // Overlap between different polygons is checked here; the contract enforces id format,
      // unique id, unique boundary and the Ghana bounding box.
      const err = E.validateBoundary(s, i.pillars);
      if (err) return err;
      const input = {
        parcelId: i.parcelId,
        interest: INTEREST_INDEX[i.interest],
        holder: i.holder,
        region: i.region,
        location: i.location,
        planNumber: i.planNumber.trim(),
        gpsAddress: i.gpsAddress.trim().toUpperCase(),
        acresX100: Math.max(1, Math.round(areaAcres(i.pillars) * 100)),
        lats: i.pillars.map((p) => toMicro(p[0])),
        lngs: i.pillars.map((p) => toMicro(p[1])),
        docs: i.docs.map((d) => ({ docType: d.type, hash: d.hash })), // file names stay off chain
      };
      return {
        contract: "TitleRegistry",
        method: "submitApplication",
        args: [input],
        label: `"${i.parcelId}", ${i.pillars.length} pillars`,
      };
    }),
  approveApplication: (app: string) =>
    chainAct("Registered: title NFT minted", () => ({
      contract: "TitleRegistry",
      method: "approveApplication",
      args: [num(app)],
      label: app,
    })),
  rejectApplication: (app: string, reason: string) =>
    chainAct("Application rejected", () => ({
      contract: "TitleRegistry",
      method: "rejectApplication",
      args: [num(app), reason],
      label: `${app}, "${reason}"`,
    })),

  // FeeLedger: the registrar records an official receipt (amount in GH¢, receipt number hashed)
  recordPayment: (
    parcelId: string,
    kind: FeeKind,
    amount: number,
    receiptNo: string,
  ) =>
    chainAct(`${kind} receipt recorded`, (s) => {
      const p = s.parcels.find((x) => x.id === parcelId);
      if (!p) return `Parcel ${parcelId} does not exist`;
      if (!receiptNo.trim()) return "Add the official receipt number";
      const receiptHash = Web3.utils.keccak256(
        Web3.utils.utf8ToHex(receiptNo.trim().toUpperCase()),
      );
      return {
        contract: "FeeLedger",
        method: "recordPayment",
        args: [
          p.recordId,
          FEE_INDEX[kind],
          Math.round(amount * 100),
          receiptHash,
        ],
        label: `"${parcelId}", ${kind}`,
      };
    }),

  // TitleRegistry: transfer of ownership
  requestTransfer: (parcelId: string, to: string) =>
    chainAct("Transfer requested: waiting for the registrar", (s) => {
      const p = s.parcels.find((x) => x.id === parcelId);
      const a = addr(s, to);
      if (!p) return `Parcel ${parcelId} does not exist`;
      if (!a) return "Pick the new owner";
      return {
        contract: "TitleRegistry",
        method: "requestTransfer",
        args: [p.recordId, a],
        label: `"${parcelId}", ${to}`,
      };
    }),
  cancelTransfer: (trf: string) =>
    chainAct("Transfer cancelled", () => ({
      contract: "TitleRegistry",
      method: "cancelTransfer",
      args: [num(trf)],
      label: trf,
    })),
  approveTransfer: (trf: string) =>
    chainAct("Transfer approved: title moved to the new owner", () => ({
      contract: "TitleRegistry",
      method: "approveTransfer",
      args: [num(trf)],
      label: trf,
    })),
  rejectTransfer: (trf: string, reason: string) =>
    chainAct("Transfer rejected", () => ({
      contract: "TitleRegistry",
      method: "rejectTransfer",
      args: [num(trf), reason],
      label: `${trf}, "${reason}"`,
    })),
};

/** Backend mode: the same functions, routed through landchain-backend. */
const apiLandchain: typeof chainLandchain & {
  submitApplicationWithDocs: (
    i: E.ApplicationInput,
    documentIds: string[],
  ) => Promise<ActResult>;
} = {
  submitIdentity: (hash, c) =>
    apiAct("Identity submitted for review", () =>
      backend.submitIdentity(hash, c),
    ),
  verifyIdentity: (who, ok) =>
    apiAct(ok ? "Identity verified" : "Identity rejected", () =>
      backend.verifyIdentity(who, ok),
    ),
  submitApplication: () =>
    Promise.resolve({
      ok: false,
      error: "Upload the documents first (backend mode).",
    }),
  submitApplicationWithDocs: (i, documentIds) => {
    const err = E.validateBoundary(get().state, i.pillars);
    if (err) {
      toast.error("Can't send this", { description: err });
      return Promise.resolve({ ok: false, error: err });
    }
    return apiAct("Application submitted", () =>
      backend.submitApplication({
        parcel_id: i.parcelId,
        interest: i.interest,
        holder: i.holder,
        region: i.region,
        location: i.location,
        plan_number: i.planNumber.trim(),
        gps_address: i.gpsAddress.trim().toUpperCase(),
        pillars: i.pillars,
        documents: documentIds,
      }),
    );
  },
  approveApplication: (app) =>
    apiAct("Registered: title NFT minted", () =>
      backend.approveApplication(app),
    ),
  rejectApplication: (app, reason) =>
    apiAct("Application rejected", () =>
      backend.rejectApplication(app, reason),
    ),
  recordPayment: (parcelId, kind, amount, receiptNo) =>
    apiAct(`${kind} receipt recorded`, () =>
      backend.recordPayment(parcelId, kind, amount, receiptNo),
    ),
  requestTransfer: (parcelId, to) =>
    apiAct("Transfer requested: waiting for the registrar", () =>
      backend.requestTransfer(parcelId, to),
    ),
  cancelTransfer: (trf) =>
    apiAct("Transfer cancelled", () => backend.cancelTransfer(trf)),
  approveTransfer: (trf) =>
    apiAct("Transfer approved: title moved to the new owner", () =>
      backend.approveTransfer(trf),
    ),
  rejectTransfer: (trf, reason) =>
    apiAct("Transfer rejected", () => backend.rejectTransfer(trf, reason)),
};

export const landchain = API_MODE ? apiLandchain : chainLandchain;

/** A public ID looks like GH-9c2a41d0 (the first 4 bytes of the wallet's hash, see IdentityRegistry.publicIdOf). */
export const PUBLIC_ID_RE = /^GH-[0-9a-f]{8}$/i;
export const normalPublicId = (raw: string) => {
  const t = raw.trim();
  return /^gh-/i.test(t) ? `GH-${t.slice(3).toLowerCase()}` : t;
};
export interface PersonLookup {
  exists: boolean;
  verified: boolean;
  isYou: boolean;
}
/** Look up the person behind a public ID, for a transfer: on chain from the identity list, through the API otherwise. */
export async function lookupPerson(publicId: string): Promise<PersonLookup> {
  const pid = normalPublicId(publicId);
  if (API_MODE) {
    const r = await lookupPublicIdApi(pid);
    return { exists: r.exists, verified: r.verified, isYou: r.is_you };
  }
  const { state: s, current } = get();
  const a = s.accounts.find((x) => x.id === pid && x.kind !== "public");
  return {
    exists: !!a,
    verified: a?.identity === "verified",
    isYou: current === pid,
  };
}
export const apiWrites = apiLandchain;

export async function sha256Hex(data: ArrayBuffer | string) {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const d = await crypto.subtle.digest("SHA-256", buf);
  return (
    "0x" +
    [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}
