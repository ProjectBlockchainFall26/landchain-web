// Backend mode: every write goes through landchain-backend (spec section 15).
//
//  - Officer actions (verify, approve, reject, record a fee) are signed by the backend's role wallets:
//    POST …?wait=true returns once the indexer has confirmed the transaction.
//  - Citizen actions (identity, apply, transfer, cancel) are prepared by the backend as an unsigned transaction
//    (a TxIntent). On a local chain a demo account signs with dev-sign (Ganache's unlocked account); otherwise
//    MetaMask signs it and the app reports the hash. Either way the contract's own refusal message comes back.
import { api, ApiError } from "./http";
import { IS_LOCAL } from "../chain/config";

export interface Intent {
  id: string;
  status:
    | "awaiting_signature"
    | "queued"
    | "submitted"
    | "mined"
    | "confirmed"
    | "reverted"
    | "failed"
    | "expired";
  from: string;
  tx: {
    from: string;
    to: string;
    data: string;
    value: string;
    gas: string;
    chainId: string;
  } | null;
  tx_hash: string | null;
  block: number | null;
  revert_reason: string | null;
  error: string | null;
  result: Record<string, unknown> | null;
  success_message: string;
}
interface IntentBody {
  intent: Intent;
}

const FINAL = new Set(["confirmed", "reverted", "failed", "expired"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(intent: Intent, timeoutMs = 60_000): Promise<Intent> {
  const end = Date.now() + timeoutMs;
  let it = intent;
  while (!FINAL.has(it.status) && Date.now() < end) {
    await sleep(700);
    it = await api<Intent>(`/chain/intents/${it.id}`);
  }
  return it;
}

function check(it: Intent): Intent {
  if (it.status === "confirmed") return it;
  if (it.status === "reverted" || it.status === "failed")
    throw new ApiError(
      it.revert_reason || it.error || "Transaction failed",
      "CHAIN_REVERT",
      422,
    );
  if (it.status === "expired")
    throw new ApiError(
      "This transaction expired. Start again.",
      "INTENT_EXPIRED",
      410,
    );
  throw new ApiError(
    "The chain hasn't confirmed this yet. It will show up once the indexer catches up.",
    "PENDING",
    202,
  );
}

interface Eip1193 {
  request(a: { method: string; params?: unknown[] }): Promise<unknown>;
}
const eth = (): Eip1193 | undefined =>
  typeof window !== "undefined"
    ? (window as unknown as { ethereum?: Eip1193 }).ethereum
    : undefined;

async function signWithWallet(intent: Intent): Promise<Intent> {
  const wallet = eth();
  if (!wallet || !intent.tx)
    throw new ApiError(
      "Connect MetaMask to sign this transaction.",
      "WALLET_REQUIRED",
      403,
    );
  try {
    const hash = (await wallet.request({
      method: "eth_sendTransaction",
      params: [intent.tx],
    })) as string;
    return await api<Intent>(`/chain/intents/${intent.id}/submitted`, {
      body: { tx_hash: hash },
    });
  } catch (e) {
    const o = e as { code?: number; message?: string };
    if (o?.code === 4001) {
      await api(`/chain/intents/${intent.id}/rejected-by-wallet`, {
        body: { code: 4001, message: o.message ?? "" },
      }).catch(() => undefined);
      throw new ApiError(
        "You cancelled the transaction in your wallet",
        "WALLET_REJECTED",
        400,
      );
    }
    throw e;
  }
}

/** Citizen write: POST the prepare endpoint, sign (dev-sign on Ganache, else MetaMask), wait for confirmation. */
export async function citizenWrite(
  path: string,
  body: Record<string, unknown>,
): Promise<Intent> {
  const { intent } = await api<IntentBody>(path, { body, idempotent: true });
  let signed: Intent;
  if (IS_LOCAL) {
    try {
      signed = await api<Intent>(`/chain/intents/${intent.id}/dev-sign`, {
        body: {},
      });
    } catch (e) {
      if (
        e instanceof ApiError &&
        (e.code === "CANNOT_SIGN" || e.status === 404)
      )
        signed = await signWithWallet(intent);
      else throw e;
    }
  } else {
    signed = await signWithWallet(intent);
  }
  return check(await waitFor(signed));
}

/** Officer write: the backend signs with the role wallet; ?wait=true returns when the indexer confirms. */
export async function officerWrite(
  path: string,
  body: Record<string, unknown> = {},
): Promise<Intent> {
  const sep = path.includes("?") ? "&" : "?";
  const { intent } = await api<IntentBody>(`${path}${sep}wait=true`, {
    body,
    idempotent: true,
  });
  return check(await waitFor(intent));
}

export const backend = {
  submitIdentity: (cardHash: string, citizenship: "citizen" | "non-citizen") =>
    citizenWrite("/identity/submit", { card_hash: cardHash, citizenship }),
  verifyIdentity: (publicId: string, ok: boolean) =>
    officerWrite(`/identities/${publicId}/${ok ? "verify" : "reject"}`),
  submitApplication: (body: Record<string, unknown>) =>
    citizenWrite("/applications", body),
  approveApplication: (app: string) =>
    officerWrite(`/applications/${app}/approve`),
  rejectApplication: (app: string, reason: string) =>
    officerWrite(`/applications/${app}/reject`, { reason }),
  recordPayment: (
    parcelId: string,
    kind: string,
    amount: number,
    receiptNo: string,
  ) =>
    officerWrite(`/parcels/${parcelId}/payments`, {
      kind,
      amount_ghs: amount.toFixed(2),
      receipt_no: receiptNo,
    }),
  requestTransfer: (parcelId: string, toPublicId: string) =>
    citizenWrite("/transfers", {
      parcel_id: parcelId,
      to_public_id: toPublicId,
    }),
  cancelTransfer: (trf: string) => citizenWrite(`/transfers/${trf}/cancel`, {}),
  approveTransfer: (trf: string) => officerWrite(`/transfers/${trf}/approve`),
  rejectTransfer: (trf: string, reason: string) =>
    officerWrite(`/transfers/${trf}/reject`, { reason }),
};

/** Upload one document to the vault (off chain). Returns its id for the application and its fingerprint. */
export async function uploadDocument(
  file: File,
  docType: string,
  sha256: string,
): Promise<{ id: string; sha256: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("doc_type", docType);
  form.append("sha256", sha256);
  return api<{ id: string; sha256: string }>("/documents", { body: form });
}

/** Open a vault file through a 60-second signed link. False when the file isn't in the vault. */
export async function openDocument(
  sha256: string,
  parcelId: string,
): Promise<boolean> {
  try {
    const { url } = await api<{ url: string }>(
      `/documents/${sha256}/url?parcel_id=${encodeURIComponent(parcelId)}`,
    );
    window.open(url, "_blank", "noopener");
    return true;
  } catch (e) {
    if (
      e instanceof ApiError &&
      (e.code === "FILE_NOT_IN_VAULT" || e.status === 404)
    )
      return false;
    throw e;
  }
}

export async function sendEnquiryApi(
  parcelId: string,
  name: string,
  contact: string,
  message: string,
) {
  return api(`/parcels/${parcelId}/enquiries`, {
    body: { name, contact, message },
  });
}
export async function markEnquiryApi(id: string, status: "read" | "answered") {
  return api(`/enquiries/${id}`, { method: "PATCH", body: { status } });
}

/** Statement of costs with the gas of every transaction, computed by the backend from the receipts. */
export interface ReceiptOut {
  transactions: {
    items: {
      label: string;
      tx_hash: string;
      signed_by: { public_id: string } | null;
      block: number;
      gas_used: number;
      gas_price_gwei: string;
      cost_eth: string;
      at: string;
    }[];
    total_eth: string;
    owner_signed_eth: string;
  };
}
export const loadReceipt = (parcelId: string) =>
  api<ReceiptOut>(`/parcels/${parcelId}/receipt`);

/** Link a MetaMask wallet to the signed-in account with Sign-In with Ethereum (spec 9.2). */
export async function linkWallet(): Promise<string> {
  const wallet = eth();
  if (!wallet)
    throw new ApiError("MetaMask isn't installed.", "WALLET_REQUIRED", 400);
  const [address] = (await wallet.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!address)
    throw new ApiError(
      "MetaMask didn't share an account.",
      "WALLET_REQUIRED",
      400,
    );
  const { message } = await api<{ message: string }>("/auth/wallet/nonce", {
    body: { address },
  });
  const signature = (await wallet.request({
    method: "personal_sign",
    params: [message, address],
  })) as string;
  await api("/auth/wallet/verify", { body: { message, signature } });
  return address.toLowerCase();
}

export const setFullName = (name: string) =>
  api("/me", { method: "PATCH", body: { full_name: name } });

export interface LookupOut {
  public_id: string;
  exists: boolean;
  verified: boolean;
  is_you: boolean;
}
/** Does this public ID belong to a person on the register? Never reveals a name (spec decision 18.7). */
export const lookupPublicIdApi = (publicId: string) =>
  api<LookupOut>(
    `/identities/lookup?public_id=${encodeURIComponent(publicId)}`,
  );
