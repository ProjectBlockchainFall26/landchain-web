// In-browser demo chain. Mirrors the milestone-1 contract rules.
import { areaAcres, insideGhana, polygonsOverlap, type LatLng } from "./geo";
import type { Account, ChainState, Interest, Role, Sale, Tx } from "./types";

export class ChainError extends Error {}
function req(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new ChainError(msg);
}

export const FAUCET_AMOUNT = 1_000_000;
export const FAUCET_COOLDOWN_MS = 60 * 60 * 1000;

export function fakeHash(input: string): string {
  let h1 = 0x811c9dc5, h2 = 0x1234567;
  for (let i = 0; i < input.length; i++) {
    h1 = Math.imul(h1 ^ input.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 + input.charCodeAt(i), 2654435761);
  }
  let out = "";
  for (let i = 0; i < 8; i++) {
    h1 = Math.imul(h1 ^ (h2 >>> 7), 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (h1 >>> 3), 2246822507) >>> 0;
    out += (h1 >>> 0).toString(16).padStart(8, "0").slice(0, 8);
  }
  return "0x" + out;
}

export const normaliseCard = (n: string) => n.trim().toUpperCase().replace(/\s+/g, "");
export const hashCard = (n: string) => fakeHash(`landchain-card:${normaliseCard(n)}`);
export const hashPin = (pin: string) => fakeHash(`landchain-pin:${pin}`);

export interface Ctx { from: string; now: number }
export interface Result { state: ChainState; ok: boolean; error?: string; tx: Tx }

export function account(s: ChainState, id: string): Account | undefined {
  return s.accounts.find((a) => a.id === id);
}
export function hasRole(s: ChainState, id: string, role: Role) {
  return !!account(s, id)?.roles.includes(role);
}
export function escrowHeldBy(s: ChainState, id: string) {
  return s.sales.filter((x) => x.buyer === id && (x.status === "awaiting" || x.status === "disputed")).reduce((a, x) => a + x.amount, 0);
}
export function wallet(s: ChainState, id: string) {
  return s.wallets[id] ?? { tghs: 0 };
}

function run(
  prev: ChainState,
  ctx: Ctx,
  contract: string,
  fn: string,
  args: string,
  body: (s: ChainState, block: number) => void,
): Result {
  const s = structuredClone(prev);
  s.block += 1 + (s.txs.length % 3);
  const tx: Tx = {
    hash: fakeHash(`${s.block}:${fn}:${args}:${ctx.from}:${ctx.now}`),
    contract, fn, args, from: ctx.from, block: s.block, at: ctx.now, status: "Success",
  };
  try {
    body(s, s.block);
    s.txs.unshift(tx);
    return { state: s, ok: true, tx };
  } catch (e) {
    if (!(e instanceof ChainError)) throw e;
    const r = structuredClone(prev);
    r.block = s.block;
    tx.status = "Reverted";
    tx.error = e.message;
    r.txs.unshift(tx);
    return { state: r, ok: false, error: e.message, tx };
  }
}

const notify = (s: ChainState, to: string, text: string, at: number) => s.notifications.unshift({ to, text, at });
const parcel = (s: ChainState, id: string) => {
  const p = s.parcels.find((x) => x.id === id);
  req(p, `Parcel ${id} does not exist`);
  return p;
};

// ---------- Identity ----------
export function submitIdentity(st: ChainState, ctx: Ctx, cardHash: string, citizenship: "citizen" | "non-citizen") {
  return run(st, ctx, "IdentityRegistry", "submitProfile", `${cardHash.slice(0, 10)}…, ${citizenship}`, (s, b) => {
    const a = account(s, ctx.from);
    req(a && a.kind === "citizen", "Only citizens can submit a profile");
    req(a.identity !== "verified", "Identity already verified");
    req(!s.accounts.some((x) => x.cardHash === cardHash && x.id !== a.id), "This Ghana Card is already linked to another profile");
    a.identity = "pending"; a.cardHash = cardHash; a.citizenship = citizenship;
    notify(s, "role:Identity officer", `New identity request from ${a.id}`, ctx.now);
    void b;
  });
}
export function verifyIdentity(st: ChainState, ctx: Ctx, who: string, approve: boolean) {
  return run(st, ctx, "IdentityRegistry", approve ? "verify" : "reject", who, (s) => {
    req(hasRole(s, ctx.from, "Identity officer"), "Only an identity officer can do this");
    const a = account(s, who);
    req(a && a.identity === "pending", "No pending request for this person");
    a.identity = approve ? "verified" : "rejected";
    notify(s, who, approve ? "Your identity has been verified" : "Your identity request was rejected", ctx.now);
  });
}

// ---------- Registration ----------
export interface ApplicationInput {
  parcelId: string; interest: Interest; holder: string; region: string; location: string;
  pillars: LatLng[]; docs: { type: string; name: string; hash: string }[];
}
export function validateBoundary(s: ChainState, pillars: LatLng[], ignoreId?: string): string | null {
  if (pillars.length < 3) return "A boundary needs at least 3 corner pillars";
  if (!pillars.every(insideGhana)) return "All pillars must be inside Ghana";
  const hit = s.parcels.find((p) => p.id !== ignoreId && p.status !== "rejected" && polygonsOverlap(pillars, p.pillars));
  if (hit) return `Boundary overlaps neighbouring parcel ${hit.id}`;
  return null;
}
export function submitApplication(st: ChainState, ctx: Ctx, input: ApplicationInput) {
  return run(st, ctx, "TitleRegistry", "submitApplication", `"${input.parcelId}", ${input.pillars.length} pillars`, (s) => {
    const a = account(s, ctx.from);
    req(a && a.identity === "verified", "Verify your identity before registering land");
    req(/^[A-Z]{2}-[A-Z]{3}-\d{4}$/.test(input.parcelId), "Parcel ID must look like GA-BRK-0015");
    req(!s.parcels.some((p) => p.id === input.parcelId), `Parcel ID ${input.parcelId} is already used`);
    const err = validateBoundary(s, input.pillars);
    req(!err, err ?? "");
    s.parcels.push({
      id: input.parcelId, interest: input.interest, holder: input.holder, region: input.region,
      location: input.location, acres: Math.round(areaAcres(input.pillars) * 100) / 100,
      status: "pending", owner: ctx.from, pillars: input.pillars, updatedAt: ctx.now, docs: input.docs,
    });
    s.applications.push({
      id: `APP-${s.applications.length + 1}`, parcelId: input.parcelId, applicant: ctx.from,
      survey: { status: "waiting" }, legal: { status: "waiting" }, registrar: { status: "waiting" }, createdAt: ctx.now,
    });
    notify(s, "role:Surveyor", `New title application ${input.parcelId} waiting for your review`, ctx.now);
  });
}

type StepKey = "survey" | "legal" | "registrar";
const STEP_ROLE: Record<StepKey, Role> = { survey: "Surveyor", legal: "Lawyer", registrar: "Registrar" };
const STEP_FN: Record<StepKey, string> = { survey: "approveSurvey", legal: "approveLegal", registrar: "finalise" };
export function currentStep(app: ChainState["applications"][number]): StepKey | null {
  if (app.survey.status !== "approved") return app.survey.status === "rejected" ? null : "survey";
  if (app.legal.status !== "approved") return app.legal.status === "rejected" ? null : "legal";
  if (app.registrar.status !== "approved") return app.registrar.status === "rejected" ? null : "registrar";
  return null;
}
export function reviewApplication(st: ChainState, ctx: Ctx, appId: string, step: StepKey, approve: boolean, reason?: string) {
  return run(st, ctx, "TitleRegistry", approve ? STEP_FN[step] : "rejectApplication", `${appId}${reason ? `, "${reason}"` : ""}`, (s, b) => {
    const app = s.applications.find((x) => x.id === appId);
    req(app, "Application not found");
    req(hasRole(s, ctx.from, STEP_ROLE[step]), `Only the ${STEP_ROLE[step].toLowerCase()} can sign this step`);
    req(currentStep(app) === step, "Steps must happen in order: survey → legal → registrar");
    req(approve || (reason && reason.trim().length > 0), "A reason is required to reject");
    const p = parcel(s, app.parcelId);
    app[step] = { status: approve ? "approved" : "rejected", by: ctx.from, at: ctx.now, reason };
    if (!approve) {
      p.status = "rejected"; p.updatedAt = ctx.now;
      notify(s, app.applicant, `Your application ${p.id} was rejected at ${step}: ${reason}`, ctx.now);
      return;
    }
    if (step === "registrar") {
      p.status = "verified"; p.token = s.nextToken++; p.titleNo = s.nextTitle++; p.updatedAt = ctx.now;
      s.history.push({ parcelId: p.id, type: "Registration", text: `Minted to ${p.owner}`, at: ctx.now, block: b });
      notify(s, app.applicant, `Title GLT #${p.titleNo} issued for ${p.id}`, ctx.now);
    } else {
      const next: StepKey = step === "survey" ? "legal" : "registrar";
      notify(s, app.applicant, `Your application ${p.id} passed ${step}`, ctx.now);
      notify(s, `role:${STEP_ROLE[next]}`, `Title application ${p.id} waiting for your review`, ctx.now);
    }
  });
}

// ---------- Market ----------
const SELLABLE = ["verified", "sold"];
export function listForSale(st: ChainState, ctx: Ctx, parcelId: string, price: number) {
  return run(st, ctx, "Marketplace", "listForSale", `"${parcelId}", ${price.toLocaleString("en-US")}`, (s, b) => {
    const p = parcel(s, parcelId);
    req(p.owner === ctx.from, "Only the owner can list this parcel");
    req(SELLABLE.includes(p.status), "Only verified titles that aren't already listed can be sold");
    req(price > 0, "Price must be greater than zero");
    p.status = "for_sale"; p.price = price; p.listedAt = ctx.now; p.updatedAt = ctx.now;
    s.history.push({ parcelId, type: "Listing", text: `Listed for GH₵ ${price.toLocaleString("en-US")}`, at: ctx.now, block: b });
  });
}
export function cancelListing(st: ChainState, ctx: Ctx, parcelId: string) {
  return run(st, ctx, "Marketplace", "cancelListing", `"${parcelId}"`, (s) => {
    const p = parcel(s, parcelId);
    req(p.owner === ctx.from, "Only the owner can cancel");
    req(p.status === "for_sale", "Parcel is not listed");
    p.status = "verified"; p.price = undefined; p.updatedAt = ctx.now;
  });
}
export function buyListed(st: ChainState, ctx: Ctx, parcelId: string) {
  return run(st, ctx, "Marketplace", "buyListed", `"${parcelId}"`, (s) => {
    const p = parcel(s, parcelId);
    const a = account(s, ctx.from);
    req(a && a.identity === "verified", "Verify your identity before buying land");
    req(p.status === "for_sale" && p.price, "Parcel is not for sale");
    req(p.owner !== ctx.from, "You already own this parcel");
    const w = (s.wallets[ctx.from] ??= { tghs: 0 });
    req(w.tghs >= p.price, "Not enough tGHS — claim from the faucet on My Balance");
    w.tghs -= p.price;
    s.sales.push({ id: `SALE-${s.sales.length + 1}`, parcelId, buyer: ctx.from, seller: p.owner, amount: p.price, status: "awaiting", since: ctx.now });
    p.status = "in_escrow"; p.updatedAt = ctx.now;
    notify(s, "role:Registrar", `Sale of ${parcelId} waiting for approval`, ctx.now);
    notify(s, p.owner, `${ctx.from} paid GH₵ ${p.price.toLocaleString("en-US")} into escrow for ${parcelId}`, ctx.now);
  });
}
function openSale(s: ChainState, saleId: string): Sale {
  const sale = s.sales.find((x) => x.id === saleId);
  req(sale, "Sale not found");
  return sale;
}
function completeSale(s: ChainState, sale: Sale, now: number, b: number) {
  const p = parcel(s, sale.parcelId);
  (s.wallets[sale.seller] ??= { tghs: 0 }).tghs += sale.amount;
  s.history.push({ parcelId: p.id, type: "Transfer", text: `${sale.seller} → ${sale.buyer} for GH₵ ${sale.amount.toLocaleString("en-US")}`, at: now, block: b });
  p.owner = sale.buyer; p.status = "sold"; p.price = undefined; p.updatedAt = now;
  sale.status = "approved";
  notify(s, sale.buyer, `Sale of ${p.id} approved — the title is now yours`, now);
  notify(s, sale.seller, `Sale of ${p.id} approved — GH₵ ${sale.amount.toLocaleString("en-US")} released to you`, now);
}
function refundSale(s: ChainState, sale: Sale, now: number, b: number) {
  const p = parcel(s, sale.parcelId);
  (s.wallets[sale.buyer] ??= { tghs: 0 }).tghs += sale.amount;
  s.history.push({ parcelId: p.id, type: "Refund", text: `Sale cancelled, ${sale.buyer} refunded`, at: now, block: b });
  p.status = "verified"; p.price = undefined; p.updatedAt = now;
  sale.status = "refunded";
  notify(s, sale.buyer, `Sale of ${p.id} rejected — you were refunded in full`, now);
  notify(s, sale.seller, `Sale of ${p.id} was rejected`, now);
}
export function approveSale(st: ChainState, ctx: Ctx, saleId: string) {
  return run(st, ctx, "Marketplace", "approveSale", saleId, (s, b) => {
    req(hasRole(s, ctx.from, "Registrar"), "Only the registrar can approve sales");
    const sale = openSale(s, saleId);
    req(sale.status === "awaiting", "Sale is not awaiting approval");
    completeSale(s, sale, ctx.now, b);
  });
}
export function rejectSale(st: ChainState, ctx: Ctx, saleId: string) {
  return run(st, ctx, "Marketplace", "rejectSale", saleId, (s, b) => {
    req(hasRole(s, ctx.from, "Registrar"), "Only the registrar can reject sales");
    const sale = openSale(s, saleId);
    req(sale.status === "awaiting", "Sale is not awaiting approval");
    refundSale(s, sale, ctx.now, b);
  });
}
export function raiseDispute(st: ChainState, ctx: Ctx, saleId: string, reason: string, evidenceHash?: string) {
  return run(st, ctx, "DisputeResolution", "raiseDispute", `${saleId}, "${reason}"`, (s, b) => {
    const sale = openSale(s, saleId);
    req(sale.buyer === ctx.from || sale.seller === ctx.from, "Only the buyer or seller can raise a dispute");
    req(sale.status === "awaiting", "Only a sale in escrow can be disputed");
    req(reason.trim().length > 0, "Give a reason for the dispute");
    sale.status = "disputed";
    s.disputes.push({ id: `DSP-${s.disputes.length + 1}`, saleId, raisedBy: ctx.from, reason, evidenceHash });
    s.history.push({ parcelId: sale.parcelId, type: "Dispute", text: `Dispute raised by ${ctx.from}`, at: ctx.now, block: b });
    notify(s, "role:Judge", `New dispute on ${sale.parcelId}`, ctx.now);
  });
}
export function resolveDispute(st: ChainState, ctx: Ctx, disputeId: string, favour: "buyer" | "seller") {
  return run(st, ctx, "DisputeResolution", "resolveDispute", `${disputeId}, ${favour}`, (s, b) => {
    req(hasRole(s, ctx.from, "Judge"), "Only a judge can resolve disputes");
    const d = s.disputes.find((x) => x.id === disputeId);
    req(d && !d.outcome, "Dispute not open");
    const sale = openSale(s, d.saleId);
    d.outcome = favour; d.judge = ctx.from;
    if (favour === "seller") completeSale(s, sale, ctx.now, b);
    else refundSale(s, sale, ctx.now, b);
  });
}

// ---------- Wallet ----------
export function faucetRemainingMs(s: ChainState, id: string, now: number) {
  const last = s.wallets[id]?.lastFaucet;
  return last ? Math.max(0, last + FAUCET_COOLDOWN_MS - now) : 0;
}
export function faucet(st: ChainState, ctx: Ctx) {
  return run(st, ctx, "TestCedi", "faucet", "", (s) => {
    const a = account(s, ctx.from);
    req(a && a.kind === "citizen", "Only citizen wallets can claim test cedis");
    req(faucetRemainingMs(s, ctx.from, ctx.now) === 0, "Faucet already claimed — try again later");
    const w = (s.wallets[ctx.from] ??= { tghs: 0 });
    w.tghs += FAUCET_AMOUNT; w.lastFaucet = ctx.now;
  });
}

// ---------- Reads ----------
export function getParcel(s: ChainState, id: string) {
  return s.parcels.find((p) => p.id.toLowerCase() === id.trim().toLowerCase());
}
export function getHistory(s: ChainState, id: string) {
  return s.history.filter((h) => h.parcelId === id).sort((a, b) => a.block - b.block);
}
export function issuesFor(s: ChainState, id: string): string[] {
  const p = getParcel(s, id);
  if (!p) return [];
  const out: string[] = [];
  if (p.status === "in_escrow") {
    const sale = s.sales.find((x) => x.parcelId === id && (x.status === "awaiting" || x.status === "disputed"));
    out.push(sale?.status === "disputed" ? "Sale under dispute" : "Sale in escrow awaiting registrar");
  }
  if (p.status === "frozen") out.push("Title frozen by court order");
  if (p.status === "pending") out.push("Application still under review");
  if (p.status === "rejected") out.push("Application rejected");
  return out;
}

// ---------- Sign-in (demo) ----------
export function login(st: ChainState, ctx: Ctx, cardHash: string, pinHash: string) {
  let who = "";
  const r = run(st, ctx, "IdentityRegistry", "signIn", `${cardHash.slice(0, 10)}…`, (s) => {
    const a = s.accounts.find((x) => x.cardHash === cardHash);
    req(a, "No profile is linked to this Ghana Card");
    req(a.pinHash === pinHash, "Wrong PIN");
    who = a.id;
  });
  return { ...r, accountId: who };
}
export function staffLogin(st: ChainState, ctx: Ctx, accountId: string, pinHash: string) {
  let who = "";
  const r = run(st, ctx, "IdentityRegistry", "staffSignIn", accountId, (s) => {
    const a = account(s, accountId);
    req(a && a.kind === "officer", "Not a Lands Commission account");
    req(a.pinHash === pinHash, "Wrong staff PIN");
    who = a.id;
  });
  return { ...r, accountId: who };
}
export function registerCard(st: ChainState, ctx: Ctx, name: string, cardHash: string, pinHash: string, citizenship: "citizen" | "non-citizen") {
  const id = "GH-" + fakeHash(cardHash + name).slice(2, 10);
  const r = run(st, ctx, "IdentityRegistry", "submitProfile", `${cardHash.slice(0, 10)}…, ${citizenship}`, (s) => {
    req(name.trim().length > 1, "Enter your name");
    req(!s.accounts.some((x) => x.cardHash === cardHash), "This Ghana Card is already registered — sign in instead");
    s.accounts.push({ id, name: name.trim(), kind: "citizen", roles: ["Citizen"], identity: "pending", citizenship, cardHash, pinHash });
    s.wallets[id] = { tghs: 0 };
    notify(s, "role:Identity officer", `New identity request from ${id}`, ctx.now);
  });
  return { ...r, accountId: r.ok ? id : "" };
}
