// Builds the app's ChainState from the deployed contracts: current state from view functions, and the
// history, activity log and notifications from contract events.
//
// For a large chain this belongs in the backend's event index (Postgres); the browser version is fine for
// a class-sized chain and keeps the chain the single source of truth.
import type { EventLog } from "web3";
import type { Account, Application, ChainState, Decision, HistoryEvent, Interest, Notification, Parcel, ParcelStatus, Role, TransferRequest, Tx } from "../types";
import { DEMO_LABELS, deployment, fromMicro } from "./config";
import { CONTRACT_NAMES, getLocalAccounts, metaMaskAddress, publicIdOf, reader, view } from "./client";

// Shapes of the contract structs as web3 returns them (uint -> bigint).
interface RolesOut { registrar: boolean; idOfficer: boolean }
interface ProfileOut { status: bigint; citizen: boolean; cardHash: string }
interface ParcelOut { parcelId: string; interest: bigint; holder: string; region: string; location: string; acresX100: bigint; status: bigint; owner: string; tokenId: bigint; registeredAt: bigint; updatedAt: bigint }
interface BoundaryOut { lats: bigint[]; lngs: bigint[] }
interface DocOut { docType: string; name: string; hash: string }
interface AppOut { recordId: bigint; applicant: string; createdAt: bigint; decision: bigint; decidedBy: string; decidedAt: bigint; reason: string }
interface TransferOut { recordId: bigint; from: string; to: string; requestedAt: bigint; decision: bigint; decidedBy: string; decidedAt: bigint; reason: string }
/** Every event field the snapshot reads (each event uses a subset). */
interface Ev {
  who: string; by: string; cardHash: string; citizen: boolean; appId: bigint; recordId: bigint; parcelId: string;
  applicant: string; pillars: bigint; reason: string; tokenId: bigint; owner: string; transferId: bigint; from: string; to: string;
}

const INTERESTS: Interest[] = ["Allodial", "Customary freehold", "Common-law freehold", "Leasehold"];
const STATUSES: ParcelStatus[] = ["pending", "registered", "transfer_pending", "rejected"];
const DECISIONS: Decision[] = ["waiting", "approved", "rejected", "cancelled"];
const ID_STATUS = ["none", "pending", "verified", "rejected"] as const;

const n = (v: unknown) => Number(v);
const ms = (seconds: unknown) => Number(seconds) * 1000;
const ZERO = "0x0000000000000000000000000000000000000000";
const ZERO32 = "0x" + "0".repeat(64);

/** Names for addresses: seeded demo labels, then names people typed on this device. */
const NAMES_KEY = "landchain-names";
export function localNames(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(NAMES_KEY) ?? "{}"); } catch { return {}; }
}
export function rememberName(address: string, name: string) {
  const all = localNames();
  all[address.toLowerCase()] = name;
  localStorage.setItem(NAMES_KEY, JSON.stringify(all));
}

/** Calls the user tried that the chain refused (eth_call reverted, so nothing was mined). Kept per device. */
const REVERTS_KEY = `landchain-reverts:${deployment?.contracts.TitleRegistry ?? "none"}`;
export function localReverts(): Tx[] {
  try { return JSON.parse(localStorage.getItem(REVERTS_KEY) ?? "[]"); } catch { return []; }
}
export function recordRevert(tx: Tx) {
  localStorage.setItem(REVERTS_KEY, JSON.stringify([tx, ...localReverts()].slice(0, 50)));
}

export async function loadChainState(): Promise<ChainState> {
  const { web3, c } = reader();
  const blockNow = n(await web3.eth.getBlockNumber());

  // ---------- accounts ----------
  const labels = new Map(DEMO_LABELS.map((l) => [l.address.toLowerCase(), l.name]));
  const typed = localNames();
  const members = (await view<string[]>(c, "IdentityRegistry", "members")).map((a) => a.toLowerCase());
  const mm = metaMaskAddress();
  const addresses = [...new Set([...labels.keys(), ...(await getLocalAccounts()).filter((a) => labels.has(a)), ...members, ...(mm ? [mm] : [])])];
  const accounts: Account[] = await Promise.all(addresses.map(async (address) => {
    const [roles, profile] = await Promise.all([
      view<RolesOut>(c, "LandAccessControl", "rolesOf", address),
      view<ProfileOut>(c, "IdentityRegistry", "profileOf", address),
    ]);
    const r: Role[] = [];
    if (roles.registrar) r.push("Registrar");
    if (roles.idOfficer) r.push("Identity officer");
    const officer = r.length > 0;
    const id = publicIdOf(address);
    const status = ID_STATUS[n(profile.status)] ?? "none";
    return {
      id, address,
      name: labels.get(address) ?? typed[address] ?? (officer ? "Lands Commission officer" : `Citizen ${id}`),
      kind: officer ? "officer" : "citizen",
      roles: officer ? r : ["Citizen"],
      identity: officer ? "verified" : status,
      citizenship: status === "none" ? undefined : profile.citizen ? "citizen" : "non-citizen",
      cardHash: profile.cardHash === ZERO32 ? undefined : profile.cardHash,
    } satisfies Account;
  }));
  accounts.push({ id: "public", name: "Public visitor", kind: "public", roles: [], identity: "none" });
  const idOf = (address: string) => (address && address !== ZERO ? publicIdOf(address) : "");

  // ---------- parcels ----------
  const parcelCount = n(await view<bigint>(c, "TitleRegistry", "parcelCount"));
  const rawParcels = await Promise.all(Array.from({ length: parcelCount }, async (_, i) => {
    const recordId = i + 1;
    const [p, b, docs, owners] = await Promise.all([
      view<ParcelOut>(c, "TitleRegistry", "getParcel", recordId),
      view<BoundaryOut>(c, "TitleRegistry", "getBoundary", recordId),
      view<DocOut[]>(c, "TitleRegistry", "getDocs", recordId),
      view<string[]>(c, "TitleRegistry", "ownerHistory", recordId),
    ]);
    const tokenId = n(p.tokenId);
    const parcel: Parcel = {
      id: p.parcelId, recordId, titleNo: tokenId || undefined,
      interest: INTERESTS[n(p.interest)]!, holder: p.holder, region: p.region, location: p.location,
      acres: n(p.acresX100) / 100, status: STATUSES[n(p.status)]!, owner: idOf(p.owner),
      owners: owners.map(idOf),
      pillars: b.lats.map((lat, k) => [fromMicro(lat), fromMicro(b.lngs[k]!)] as [number, number]),
      registeredAt: p.registeredAt ? ms(p.registeredAt) || undefined : undefined,
      updatedAt: ms(p.updatedAt),
      docs: docs.map((d) => ({ type: d.docType, name: d.name, hash: d.hash })),
    };
    return parcel;
  }));
  // A rejected application frees its parcel id; if the id was reused, show only the newest record.
  const latest = new Map<string, Parcel>();
  for (const p of rawParcels) latest.set(p.id, p);
  const parcels = [...latest.values()];
  const byRecord = new Map(rawParcels.map((p) => [p.recordId, p]));
  const isCurrent = (recordId: bigint) => { const p = byRecord.get(n(recordId)); return !!p && latest.get(p.id) === p; };

  // ---------- applications and transfer requests ----------
  const appCount = n(await view<bigint>(c, "TitleRegistry", "applicationCount"));
  const rawApps = await Promise.all(Array.from({ length: appCount }, (_, i) => view<AppOut>(c, "TitleRegistry", "getApplication", i + 1)));
  const applications: Application[] = rawApps.map((a, i) => ({
    id: `APP-${i + 1}`, parcelId: byRecord.get(n(a.recordId))?.id ?? "?", applicant: idOf(a.applicant),
    createdAt: ms(a.createdAt), decision: DECISIONS[n(a.decision)]!,
    by: idOf(a.decidedBy) || undefined, at: a.decidedAt ? ms(a.decidedAt) || undefined : undefined, reason: a.reason || undefined,
  }));
  const visibleApps = applications.filter((_, i) => isCurrent(rawApps[i]!.recordId));

  const transferCount = n(await view<bigint>(c, "TitleRegistry", "transferCount"));
  const transfers: TransferRequest[] = await Promise.all(Array.from({ length: transferCount }, async (_, i) => {
    const t = await view<TransferOut>(c, "TitleRegistry", "getTransfer", i + 1);
    return {
      id: `TRF-${i + 1}`, parcelId: byRecord.get(n(t.recordId))?.id ?? "?", from: idOf(t.from), to: idOf(t.to),
      requestedAt: ms(t.requestedAt), decision: DECISIONS[n(t.decision)]!,
      by: idOf(t.decidedBy) || undefined, at: t.decidedAt ? ms(t.decidedAt) || undefined : undefined, reason: t.reason || undefined,
    };
  }));

  // ---------- events: history, activity log, notifications ----------
  const fromBlock = deployment?.startBlock ?? 0;
  const events = (await Promise.all(CONTRACT_NAMES.map(async (name) =>
    ((await c[name].getPastEvents("allEvents", { fromBlock, toBlock: "latest" })) as EventLog[]).map((e) => ({ contract: name, e })),
  ))).flat().sort((a, b) => n(a.e.blockNumber) - n(b.e.blockNumber) || n(a.e.logIndex) - n(b.e.logIndex));

  const blockTimes = new Map<number, number>();
  await Promise.all([...new Set(events.map((x) => n(x.e.blockNumber)))].map(async (b) => {
    blockTimes.set(b, ms((await web3.eth.getBlock(b)).timestamp));
  }));

  const history: HistoryEvent[] = [];
  const txs: Tx[] = [];
  const notifications: Notification[] = [];
  const pid = (recordId: bigint) => byRecord.get(n(recordId))?.id ?? `#${n(recordId)}`;

  for (const { contract, e } of events) {
    const v = e.returnValues as unknown as Ev;
    const block = n(e.blockNumber);
    const at = blockTimes.get(block) ?? 0;
    const hash = e.transactionHash ?? "";
    const tx = (fn: string, args: string, by: string) =>
      txs.push({ hash, contract, fn, args, from: idOf(by), block, at, status: "Success" });
    const hist = (recordId: bigint, type: HistoryEvent["type"], text: string) => {
      if (isCurrent(recordId)) history.push({ parcelId: pid(recordId), type, text, at, block, tx: hash });
    };
    const note = (to: string, text: string) => notifications.push({ to, text, at });

    switch (`${contract}.${e.event}`) {
      case "IdentityRegistry.ProfileSubmitted":
        tx("submitProfile", `${v.cardHash.slice(0, 10)}…, ${v.citizen ? "citizen" : "non-citizen"}`, v.who);
        note("role:Identity officer", `New identity request from ${idOf(v.who)}`);
        break;
      case "IdentityRegistry.ProfileVerified":
        tx("verifyProfile", idOf(v.who), v.by);
        note(idOf(v.who), "Your identity has been verified");
        break;
      case "IdentityRegistry.ProfileRejected":
        tx("rejectProfile", idOf(v.who), v.by);
        note(idOf(v.who), "Your identity request was rejected");
        break;
      case "TitleRegistry.ApplicationSubmitted":
        tx("submitApplication", `"${v.parcelId}", ${n(v.pillars)} pillars`, v.applicant);
        hist(v.recordId, "Application", `Applied by ${idOf(v.applicant)}`);
        note("role:Registrar", `New title application ${v.parcelId} waiting for your review`);
        break;
      case "TitleRegistry.ApplicationApproved":
        tx("approveApplication", `APP-${n(v.appId)}`, v.by);
        break;
      case "TitleRegistry.ApplicationRejected": {
        tx("rejectApplication", `APP-${n(v.appId)}, "${v.reason}"`, v.by);
        hist(v.recordId, "Rejected", `Rejected by the registrar: ${v.reason}`);
        note(applications[n(v.appId) - 1]?.applicant ?? "", `Your application ${pid(v.recordId)} was rejected: ${v.reason}`);
        break;
      }
      case "TitleRegistry.TitleMinted":
        hist(v.recordId, "Registration", `Title GLT #${n(v.tokenId)} minted to ${idOf(v.owner)}`);
        note(idOf(v.owner), `Title GLT #${n(v.tokenId)} issued for ${pid(v.recordId)}`);
        break;
      case "TitleRegistry.TransferRequested":
        tx("requestTransfer", `"${pid(v.recordId)}", ${idOf(v.to)}`, v.from);
        hist(v.recordId, "Transfer requested", `${idOf(v.from)} asked to transfer to ${idOf(v.to)}`);
        note("role:Registrar", `Transfer of ${pid(v.recordId)} waiting for approval`);
        note(idOf(v.to), `${idOf(v.from)} asked to transfer ${pid(v.recordId)} to you`);
        break;
      case "TitleRegistry.TransferApproved":
        tx("approveTransfer", `TRF-${n(v.transferId)}`, v.by);
        hist(v.recordId, "Transfer", `${idOf(v.from)} → ${idOf(v.to)}, approved by the registrar`);
        note(idOf(v.to), `${pid(v.recordId)} is now registered to you`);
        note(idOf(v.from), `Transfer of ${pid(v.recordId)} approved`);
        break;
      case "TitleRegistry.TransferRejected": {
        tx("rejectTransfer", `TRF-${n(v.transferId)}, "${v.reason}"`, v.by);
        hist(v.recordId, "Transfer rejected", `Rejected by the registrar: ${v.reason}`);
        const t = transfers[n(v.transferId) - 1];
        if (t) note(t.from, `Transfer of ${pid(v.recordId)} was rejected: ${v.reason}`);
        break;
      }
      case "TitleRegistry.TransferCancelled": {
        const t = transfers[n(v.transferId) - 1];
        if (t) txs.push({ hash, contract, fn: "cancelTransfer", args: `TRF-${n(v.transferId)}`, from: t.from, block, at, status: "Success" });
        hist(v.recordId, "Transfer cancelled", "Cancelled by the owner");
        break;
      }
    }
  }

  const allTxs = [...txs, ...localReverts()].sort((a, b) => b.block - a.block || b.at - a.at);
  return {
    block: blockNow,
    accounts,
    parcels,
    applications: visibleApps,
    transfers: transfers.filter((t) => parcels.some((p) => p.id === t.parcelId)),
    history,
    txs: allTxs,
    notifications: notifications.reverse(),
  };
}
