// Backend mode: builds the same ChainState the screens use, from landchain-backend's read endpoints instead
// of the contracts. The backend's indexer keeps Postgres in step with the chain; privacy is applied by the
// backend (names, fees and files only come back for people allowed to see them).
import type {
  Account, Application, ChainState, Decision, Doc, FeeKind, HistoryEvent, HistoryType, Interest, Notification, Parcel,
  ParcelStatus, Payment, Role, TransferRequest, Tx,
} from "../types";
import type { Enquiry } from "../enquiries";
import { api, apiAll } from "./http";
import { isSignedIn } from "./auth";

// ---------- response shapes (docs/api-spec.md section 8) ----------
interface PersonRef { public_id: string; name: string | null; kind: "citizen" | "officer"; label: string }
interface MeOut {
  user_id: string; email: string | null; full_name: string; wallet_address: string | null; public_id: string | null;
  kind: "citizen" | "officer"; roles: string[];
  identity: { status: Account["identity"]; citizenship: "citizen" | "non-citizen" | null; card_hash: string | null };
}
interface DemoOut { name: string; email: string; kind: "citizen" | "officer"; roles: string[]; public_id: string | null; address: string | null; identity?: Account["identity"]; citizenship?: "non-citizen" }
interface ParcelItem {
  parcel_id: string; record_id: number; title_no: number | null; status: ParcelStatus; interest: Interest; holder: string; region: string;
  location: string; plan_number: string; gps_address: string | null; acres: string; owner: PersonRef | null; owners: PersonRef[];
  boundary: { pillars: [number, number][] }; registered_at: string | null; updated_at: string | null;
}
interface TransferOut {
  id: string; parcel_id: string; from: PersonRef; to: PersonRef; to_identity: Account["identity"]; requested_at: string | null;
  decision: Decision; decided_by: PersonRef | null; decided_at: string | null; reason: string | null;
}
interface ParcelDetail extends ParcelItem {
  documents: { doc_type: string; sha256: string; file_available: boolean; can_open: boolean }[];
  application: { id: string; decision: Decision; applicant: PersonRef; created_at: string | null; decided_by: PersonRef | null; decided_at: string | null; reason: string | null } | null;
  open_transfer: TransferOut | null;
  visibility: "public" | "private";
}
interface HistoryOut { parcel_id: string; type: HistoryType; text: string; at: string | null; block: number; tx_hash: string }
interface PaymentOut {
  id: string; parcel_id: string; kind: FeeKind; amount_ghs: string; receipt_hash: string; payer: PersonRef | null; recorded_by: PersonRef | null;
  transfer_id: string | null; at: string | null; block: number | null; tx_hash: string | null;
}
interface ActivityOut { tx_hash: string | null; contract: string; function: string; args_label: string; from: PersonRef | null; block: number | null; at: string | null; status: "Success" | "Reverted"; error: string | null }
interface NotificationOut { text: string; at: string; audience: string }
interface EnquiryOut { id: string; parcel_id: string; from_public_id: string; name: string; contact: string; message: string; status: Enquiry["status"]; at: string }
interface IdentityOut { public_id: string; name: string | null; address: string; status: Account["identity"]; citizenship: "citizen" | "non-citizen"; card_hash: string }
export interface ChainStatusOut { kind: "ok" | "error"; chain_id: number; name: string; head_block: number | null; indexed_block: number | null; error: string | null }

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : 0);
const ROLE_LABELS: Role[] = ["Citizen", "Registrar", "Identity officer"];
const roles = (labels: string[]): Role[] => labels.filter((r): r is Role => (ROLE_LABELS as string[]).includes(r));

/** Runs `fn` over items with at most `limit` requests in flight. */
async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]!); }
  }));
  return out;
}

export interface ApiState { state: ChainState; me: string; enquiries: Enquiry[]; status: ChainStatusOut; demo: DemoOut[] }

export async function loadApiState(): Promise<ApiState> {
  const signedIn = await isSignedIn();
  const [status, me, demo] = await Promise.all([
    api<ChainStatusOut>("/chain/status"),
    signedIn ? api<MeOut>("/me").catch(() => null) : Promise.resolve(null),
    api<{ accounts: DemoOut[] }>("/dev/demo-accounts").then((d) => d.accounts).catch(() => [] as DemoOut[]),
  ]);

  // ---------- accounts: me, demo people, people the backend showed us ----------
  const accounts = new Map<string, Account>();
  // The signed-in person's own record (from /me) wins over the demo list; the demo list fills the gaps.
  const put = (a: Account) => {
    const old = accounts.get(a.id);
    accounts.set(a.id, old ? { ...a, ...old, email: old.email ?? a.email, address: old.address ?? a.address } : a);
  };
  const meId = me ? (me.public_id ?? `user:${me.user_id}`) : "public";
  if (me) {
    accounts.set(meId, {
      id: meId, name: me.full_name || me.email || meId, address: me.wallet_address ?? undefined, email: me.email ?? undefined,
      kind: me.kind, roles: me.kind === "officer" ? roles(me.roles).filter((r) => r !== "Citizen") : ["Citizen"],
      identity: me.kind === "officer" ? "verified" : me.identity.status,
      citizenship: me.identity.citizenship ?? undefined, cardHash: me.identity.card_hash ?? undefined,
    });
  }
  for (const d of demo) {
    const id = d.public_id ?? `demo:${d.email}`;
    put({
      id, name: d.name, address: d.address ?? undefined, email: d.email, kind: d.kind,
      roles: d.kind === "officer" ? roles(d.roles).filter((r) => r !== "Citizen") : ["Citizen"],
      identity: d.kind === "officer" ? "verified" : d.identity ?? "none", citizenship: d.citizenship,
    });
  }
  const ref = (r: PersonRef | null | undefined): string => {
    if (!r) return "";
    if (!accounts.has(r.public_id)) {
      accounts.set(r.public_id, {
        id: r.public_id, name: r.name ?? (r.kind === "officer" ? r.label : r.public_id), kind: r.kind,
        roles: r.kind === "officer" ? (r.label.includes("identity") ? ["Identity officer"] : ["Registrar"]) : ["Citizen"],
        identity: r.kind === "officer" ? "verified" : "none",
      });
    }
    return r.public_id;
  };
  if (me?.kind === "officer") {
    const ids = await apiAll<IdentityOut>("/identities?status=pending").catch(() => []);
    for (const i of ids) {
      const old = accounts.get(i.public_id);
      accounts.set(i.public_id, {
        ...(old ?? { id: i.public_id, kind: "citizen", roles: ["Citizen"] as Role[] }), name: i.name ?? old?.name ?? i.public_id,
        address: i.address, identity: "pending", citizenship: i.citizenship, cardHash: i.card_hash,
      } as Account);
    }
  }

  // ---------- parcels (list, then each record's documents, application and open transfer) ----------
  const items = await apiAll<ParcelItem>("/parcels?status=pending,registered,transfer_pending,rejected");
  const details = await pool(items, 6, (p) => api<ParcelDetail>(`/parcels/${p.parcel_id}`));
  const histories = await pool(items, 6, (p) => api<{ results: HistoryOut[] }>(`/parcels/${p.parcel_id}/history`).then((h) => h.results));
  const privateOnes = details.filter((d) => d.visibility === "private");
  const paymentLists = await pool(privateOnes, 6, (p) => api<{ results: PaymentOut[] }>(`/parcels/${p.parcel_id}/payments`).then((x) => x.results).catch(() => []));

  const parcels: Parcel[] = details.map((d) => ({
    id: d.parcel_id, recordId: d.record_id, titleNo: d.title_no ?? undefined, interest: d.interest, holder: d.holder, region: d.region,
    location: d.location, planNumber: d.plan_number, gpsAddress: d.gps_address ?? "", acres: Number(d.acres), status: d.status,
    owner: ref(d.owner), owners: d.owners.map(ref), pillars: d.boundary.pillars,
    registeredAt: d.registered_at ? ms(d.registered_at) : undefined, updatedAt: ms(d.updated_at),
    docs: d.documents.map((x): Doc => ({ type: x.doc_type, hash: x.sha256 })),
  }));

  // ---------- applications and transfers ----------
  const applications = new Map<string, Application>();
  const transfers = new Map<string, TransferRequest>();
  const trf = (t: TransferOut): TransferRequest => ({
    id: t.id, parcelId: t.parcel_id, from: ref(t.from), to: ref(t.to), requestedAt: ms(t.requested_at), decision: t.decision,
    by: t.decided_by ? ref(t.decided_by) : undefined, at: t.decided_at ? ms(t.decided_at) : undefined, reason: t.reason ?? undefined,
  });
  for (const d of details) {
    if (d.application) {
      const a = d.application;
      applications.set(a.id, {
        id: a.id, parcelId: d.parcel_id, applicant: ref(a.applicant), createdAt: ms(a.created_at), decision: a.decision,
        by: a.decided_by ? ref(a.decided_by) : undefined, at: a.decided_at ? ms(a.decided_at) : undefined, reason: a.reason ?? undefined,
      });
    }
    if (d.open_transfer) {
      transfers.set(d.open_transfer.id, trf(d.open_transfer));
      const to = accounts.get(ref(d.open_transfer.to));
      if (to && to.identity === "none") to.identity = d.open_transfer.to_identity;
    }
  }
  if (me) for (const t of await apiAll<TransferOut>("/transfers").catch(() => [])) transfers.set(t.id, trf(t));

  // ---------- fees, history, activity, notifications, enquiries ----------
  const payments: Payment[] = paymentLists.flat().map((p) => ({
    id: p.id, parcelId: p.parcel_id, kind: p.kind, amount: Number(p.amount_ghs), receiptHash: p.receipt_hash,
    payer: ref(p.payer), recordedBy: ref(p.recorded_by), at: ms(p.at), block: p.block ?? 0, tx: p.tx_hash ?? "",
    transferId: p.transfer_id ?? undefined,
  }));
  const history: HistoryEvent[] = histories.flat().map((h) => ({ parcelId: h.parcel_id, type: h.type, text: h.text, at: ms(h.at), block: h.block, tx: h.tx_hash }));
  const activity = await api<{ results: ActivityOut[] }>("/activity?page_size=200").then((a) => a.results).catch(() => []);
  const txs: Tx[] = activity.map((t, i) => ({
    hash: t.tx_hash ?? `revert-${i}-${t.at}`, contract: t.contract, fn: t.function, args: t.args_label, from: ref(t.from) || "public",
    block: t.block ?? status.indexed_block ?? 0, at: ms(t.at), status: t.status, error: t.error ?? undefined,
  }));
  let notifications: Notification[] = [];
  let enquiries: Enquiry[] = [];
  if (me) {
    const [n, e] = await Promise.all([
      api<{ results: NotificationOut[] }>("/me/notifications?page_size=50").then((x) => x.results).catch(() => []),
      api<{ results: EnquiryOut[] }>("/me/enquiries?page_size=200").then((x) => x.results).catch(() => []),
    ]);
    // Shell shows notifications addressed to me or to one of my roles: the backend already filtered them.
    notifications = n.filter((x) => !x.text.startsWith("New enquiry about")).map((x) => ({ to: meId, text: x.text, at: ms(x.at) }));
    enquiries = e.map((x) => ({ id: x.id, parcelId: x.parcel_id, to: meId, from: x.from_public_id, name: x.name, contact: x.contact, message: x.message, at: ms(x.at), status: x.status }));
  }

  accounts.set("public", { id: "public", name: "Public visitor", kind: "public", roles: [], identity: "none" });
  return {
    me: meId, enquiries, status, demo,
    state: {
      block: status.indexed_block ?? 0, accounts: [...accounts.values()], parcels,
      applications: [...applications.values()].sort((a, b) => Number(a.id.slice(4)) - Number(b.id.slice(4))),
      transfers: [...transfers.values()].sort((a, b) => Number(a.id.slice(4)) - Number(b.id.slice(4))),
      payments, history, txs, notifications,
    },
  };
}
