// Builds the app's ChainState from the deployed contracts: current state from view functions, and the
// history, activity log and notifications from contract events. Screens read this exactly as they read
// the demo engine's state, so they don't know (or care) which one is behind them.
//
// For a large chain this belongs in the backend's event index (Postgres); the browser version is fine for
// a class-sized chain and keeps the chain the single source of truth.
import type { EventLog } from "web3";
import type { Account, Application, ChainState, Dispute, HistoryEvent, Interest, Notification, Parcel, ParcelStatus, Role, Sale, Step, Tx } from "../types";
import { cedi } from "../format";
import { DEMO_LABELS, deployment, fromMicro, fromUnits } from "./config";
import { CONTRACT_NAMES, getLocalAccounts, metaMaskAddress, publicIdOf, reader, view } from "./client";

// Shapes of the contract structs as web3 returns them (uint -> bigint).
interface RolesOut { registrar: boolean; surveyor: boolean; lawyer: boolean; idOfficer: boolean; judge: boolean }
interface ProfileOut { status: bigint; citizen: boolean; cardHash: string }
interface ParcelOut { parcelId: string; interest: bigint; holder: string; region: string; location: string; acresX100: bigint; status: bigint; owner: string; tokenId: bigint; updatedAt: bigint }
interface BoundaryOut { lats: bigint[]; lngs: bigint[] }
interface DocOut { docType: string; name: string; hash: string }
interface ListingOut { price: bigint; listedAt: bigint }
interface StepOut { status: bigint; by: string; at: bigint; reason: string }
interface AppOut { recordId: bigint; applicant: string; createdAt: bigint; survey: StepOut; legal: StepOut; registrar: StepOut }
interface SaleOut { recordId: bigint; buyer: string; seller: string; amount: bigint; status: bigint; since: bigint }
interface DisputeOut { saleId: bigint; raisedBy: string; reason: string; evidenceHash: string; outcome: bigint; judge: string }
/** Every event field the snapshot reads (each event uses a subset). */
interface Ev {
  who: string; by: string; cardHash: string; citizen: boolean; appId: bigint; recordId: bigint; parcelId: string;
  applicant: string; pillars: bigint; step: bigint; reason: string; tokenId: bigint; owner: string; seller: string;
  buyer: string; price: bigint; amount: bigint; saleId: bigint; disputeId: bigint; favourSeller: boolean; judge: string;
  spender: string; value: bigint;
}

const INTERESTS: Interest[] = ["Allodial", "Customary freehold", "Common-law freehold", "Leasehold"];
const STATUSES: ParcelStatus[] = ["pending", "verified", "for_sale", "in_escrow", "sold", "frozen", "rejected"];
const STEP_STATUS: Step["status"][] = ["waiting", "approved", "rejected"];
const SALE_STATUS: Sale["status"][] = ["awaiting", "approved", "refunded", "disputed"];
const ID_STATUS = ["none", "pending", "verified", "rejected"] as const;
const STEP_NAMES = ["survey", "legal", "registrar"] as const;
const STEP_FN = ["approveSurvey", "approveLegal", "finalise"];
const STEP_ROLE: Role[] = ["Surveyor", "Lawyer", "Registrar"];

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
    if (roles.surveyor) r.push("Surveyor");
    if (roles.lawyer) r.push("Lawyer");
    if (roles.idOfficer) r.push("Identity officer");
    if (roles.judge) r.push("Judge");
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

  // ---------- parcels, listings ----------
  const parcelCount = n(await view<bigint>(c, "TitleRegistry", "parcelCount"));
  const rawParcels = await Promise.all(Array.from({ length: parcelCount }, async (_, i) => {
    const recordId = i + 1;
    const [p, b, docs, listing] = await Promise.all([
      view<ParcelOut>(c, "TitleRegistry", "getParcel", recordId),
      view<BoundaryOut>(c, "TitleRegistry", "getBoundary", recordId),
      view<DocOut[]>(c, "TitleRegistry", "getDocs", recordId),
      view<ListingOut>(c, "Marketplace", "listingOf", recordId),
    ]);
    const tokenId = n(p.tokenId);
    const parcel: Parcel = {
      id: p.parcelId, recordId,
      token: tokenId || undefined, titleNo: tokenId || undefined,
      interest: INTERESTS[n(p.interest)]!, holder: p.holder, region: p.region, location: p.location,
      acres: n(p.acresX100) / 100, status: STATUSES[n(p.status)]!, owner: idOf(p.owner),
      pillars: b.lats.map((lat, k) => [fromMicro(lat), fromMicro(b.lngs[k]!)] as [number, number]),
      updatedAt: ms(p.updatedAt),
      docs: docs.map((d) => ({ type: d.docType, name: d.name, hash: d.hash })),
    };
    if (listing.price > 0n) { parcel.price = fromUnits(listing.price); parcel.listedAt = ms(listing.listedAt); }
    return parcel;
  }));
  // A rejected application frees its parcel id; if the id was reused, show only the newest record.
  const latest = new Map<string, Parcel>();
  for (const p of rawParcels) latest.set(p.id, p);
  const parcels = [...latest.values()];
  const byRecord = new Map(rawParcels.map((p) => [p.recordId!, p]));

  // ---------- applications ----------
  const appCount = n(await view<bigint>(c, "TitleRegistry", "applicationCount"));
  const applications: Application[] = await Promise.all(Array.from({ length: appCount }, async (_, i) => {
    const a = await view<AppOut>(c, "TitleRegistry", "getApplication", i + 1);
    const step = (x: StepOut): Step => {
      return { status: STEP_STATUS[n(x.status)]!, by: x.by === ZERO ? undefined : idOf(x.by), at: x.at ? ms(x.at) : undefined, reason: x.reason || undefined };
    };
    return {
      id: `APP-${i + 1}`, parcelId: byRecord.get(n(a.recordId))?.id ?? "?", applicant: idOf(a.applicant),
      createdAt: ms(a.createdAt), survey: step(a.survey), legal: step(a.legal), registrar: step(a.registrar),
    };
  }));
  // Applications for records that were superseded would point at a parcel the UI can't show; keep them only if current.
  const visibleApps = applications.filter((a) => {
    const rec = rawParcels.find((p) => p.id === a.parcelId && latest.get(p.id) === p);
    return !!rec;
  });

  // ---------- sales, disputes ----------
  const saleCount = n(await view<bigint>(c, "Marketplace", "saleCount"));
  const sales: Sale[] = await Promise.all(Array.from({ length: saleCount }, async (_, i) => {
    const s = await view<SaleOut>(c, "Marketplace", "getSale", i + 1);
    return {
      id: `SALE-${i + 1}`, parcelId: byRecord.get(n(s.recordId))?.id ?? "?", buyer: idOf(s.buyer), seller: idOf(s.seller),
      amount: fromUnits(s.amount), status: SALE_STATUS[n(s.status)]!, since: ms(s.since),
    };
  }));
  const disputeCount = n(await view<bigint>(c, "DisputeResolution", "disputeCount"));
  const disputes: Dispute[] = await Promise.all(Array.from({ length: disputeCount }, async (_, i) => {
    const d = await view<DisputeOut>(c, "DisputeResolution", "getDispute", i + 1);
    const outcome = n(d.outcome);
    return {
      id: `DSP-${i + 1}`, saleId: `SALE-${n(d.saleId)}`, raisedBy: idOf(d.raisedBy), reason: d.reason,
      evidenceHash: d.evidenceHash === ZERO32 ? undefined : d.evidenceHash,
      outcome: outcome === 0 ? undefined : outcome === 2 ? "seller" : "buyer", judge: outcome ? idOf(d.judge) : undefined,
    };
  }));

  // ---------- wallets ----------
  const wallets: ChainState["wallets"] = {};
  await Promise.all(accounts.filter((a) => a.address && a.kind === "citizen").map(async (a) => {
    const [bal, last] = await Promise.all([
      view<bigint>(c, "TestCedi", "balanceOf", a.address),
      view<bigint>(c, "TestCedi", "lastFaucet", a.address),
    ]);
    wallets[a.id] = { tghs: fromUnits(bal), lastFaucet: last > 0n ? ms(last) : undefined };
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
  const saleParcel = (saleId: bigint) => sales[n(saleId) - 1]?.parcelId ?? "?";
  const marketAddr = (deployment?.contracts.Marketplace ?? "").toLowerCase();

  for (const { contract, e } of events) {
    const v = e.returnValues as unknown as Ev;
    const block = n(e.blockNumber);
    const at = blockTimes.get(block) ?? 0;
    const tx = (fn: string, args: string, by: string) =>
      txs.push({ hash: e.transactionHash ?? "", contract, fn, args, from: idOf(by), block, at, status: "Success" });
    const hist = (parcelId: string, type: HistoryEvent["type"], text: string) => history.push({ parcelId, type, text, at, block });
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
        note("role:Surveyor", `New title application ${v.parcelId} waiting for your review`);
        break;
      case "TitleRegistry.StepApproved": {
        const step = n(v.step), parcelId = pid(v.recordId);
        tx(STEP_FN[step]!, `APP-${n(v.appId)}`, v.by);
        const applicant = applications[n(v.appId) - 1]?.applicant ?? "";
        if (step < 2) {
          note(applicant, `Your application ${parcelId} passed ${STEP_NAMES[step]}`);
          note(`role:${STEP_ROLE[step + 1]}`, `Title application ${parcelId} waiting for your review`);
        }
        break;
      }
      case "TitleRegistry.ApplicationRejected": {
        tx("rejectApplication", `APP-${n(v.appId)}, "${v.reason}"`, v.by);
        const applicant = applications[n(v.appId) - 1]?.applicant ?? "";
        note(applicant, `Your application ${pid(v.recordId)} was rejected at ${STEP_NAMES[n(v.step)]}: ${v.reason}`);
        break;
      }
      case "TitleRegistry.TitleMinted":
        hist(pid(v.recordId), "Registration", `Minted to ${idOf(v.owner)}`);
        note(idOf(v.owner), `Title GLT #${n(v.tokenId)} issued for ${pid(v.recordId)}`);
        break;
      case "Marketplace.Listed":
        tx("listForSale", `"${pid(v.recordId)}", ${fromUnits(v.price).toLocaleString("en-US")}`, v.seller);
        hist(pid(v.recordId), "Listing", `Listed for ${cedi(fromUnits(v.price))}`);
        break;
      case "Marketplace.ListingCancelled":
        tx("cancelListing", `"${pid(v.recordId)}"`, v.seller);
        break;
      case "Marketplace.Purchased":
        tx("buyListed", `"${pid(v.recordId)}"`, v.buyer);
        note("role:Registrar", `Sale of ${pid(v.recordId)} waiting for approval`);
        note(idOf(v.seller), `${idOf(v.buyer)} paid ${cedi(fromUnits(v.amount))} into escrow for ${pid(v.recordId)}`);
        break;
      case "Marketplace.SaleApproved":
        tx("approveSale", `SALE-${n(v.saleId)}`, v.by);
        break;
      case "Marketplace.SaleRejected":
        tx("rejectSale", `SALE-${n(v.saleId)}`, v.by);
        break;
      case "Marketplace.SaleCompleted": {
        const amount = cedi(fromUnits(v.amount));
        hist(pid(v.recordId), "Transfer", `${idOf(v.seller)} → ${idOf(v.buyer)} for ${amount}`);
        note(idOf(v.buyer), `Sale of ${pid(v.recordId)} approved — the title is now yours`);
        note(idOf(v.seller), `Sale of ${pid(v.recordId)} approved — ${amount} released to you`);
        break;
      }
      case "Marketplace.SaleRefunded": {
        const sale = sales[n(v.saleId) - 1];
        hist(pid(v.recordId), "Refund", `Sale cancelled, ${idOf(v.buyer)} refunded`);
        note(idOf(v.buyer), `Sale of ${pid(v.recordId)} rejected — you were refunded in full`);
        if (sale) note(sale.seller, `Sale of ${pid(v.recordId)} was rejected`);
        break;
      }
      case "DisputeResolution.DisputeRaised":
        tx("raiseDispute", `SALE-${n(v.saleId)}, "${v.reason}"`, v.by);
        hist(saleParcel(v.saleId), "Dispute", `Dispute raised by ${idOf(v.by)}`);
        note("role:Judge", `New dispute on ${saleParcel(v.saleId)}`);
        break;
      case "DisputeResolution.DisputeResolved":
        tx("resolveDispute", `DSP-${n(v.disputeId)}, ${v.favourSeller ? "seller" : "buyer"}`, v.judge);
        break;
      case "DisputeResolution.TitleFrozen":
        tx("freezeTitle", `"${pid(v.recordId)}"`, v.judge);
        hist(pid(v.recordId), "Freeze", `Frozen by court order (${v.reason})`);
        break;
      case "DisputeResolution.TitleUnfrozen":
        tx("unfreezeTitle", `"${pid(v.recordId)}"`, v.judge);
        break;
      case "TestCedi.FaucetClaimed":
        tx("faucet", "", v.who);
        break;
      case "TestCedi.Approval":
        if (v.spender.toLowerCase() === marketAddr && v.value > 0n) {
          tx("approve", `Marketplace, ${fromUnits(v.value).toLocaleString("en-US")}`, v.owner);
        }
        break;
    }
  }

  const allTxs = [...txs, ...localReverts()].sort((a, b) => b.block - a.block || b.at - a.at);
  const titled = rawParcels.filter((p) => p.token);
  return {
    block: blockNow,
    accounts,
    parcels,
    applications: visibleApps,
    sales,
    disputes,
    history,
    txs: allTxs,
    wallets,
    notifications: notifications.reverse(),
    nextToken: titled.length + 1,
    nextTitle: titled.length + 1,
  };
}
