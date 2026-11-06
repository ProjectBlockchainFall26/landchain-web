import { hashCard, hashPin } from "./engine";
import { fakeHash } from "./engine";
import { makeQuad } from "./geo";
import type { Account, ChainState, Interest, Parcel, ParcelStatus } from "./types";

export const AMA = "GH-7d4e894d";
export const YAW = "GH-90fdbccb";
export const KOFI = "GH-3a1c7e52";
export const AKOSUA = "GH-8f10fa27";
export const KWABENA = "GH-5b2d9e10";
export const REGISTRAR = "LC-registrar";
export const SURVEYOR = "LC-surveyor";
export const LAWYER = "LC-lawyer";
export const IDO = "LC-identity";
export const JUDGE = "LC-judge";
export const PUBLIC = "public";

export const DEMO_CARDS = [
  { name: "Ama Owusu", card: "GHA-700000001-1" },
  { name: "Yaw Boakye", card: "GHA-700000002-2" },
  { name: "Kofi Mensah", card: "GHA-700000003-3" },
  { name: "Akosua Darko", card: "GHA-700000004-4" },
  { name: "Kwabena Ofori", card: "GHA-700000005-5" },
  { name: "Efua Mensah", card: "GHA-700000006-6" },
];
export const DEMO_PIN = "1234";
export const STAFF_PIN = "0000";

const DAY = 86400000;
const T0 = Date.UTC(2026, 3, 3, 10, 0);

export function makeSeed(): ChainState {
  const accounts: Account[] = [
    { id: AMA, name: "Ama Owusu", kind: "citizen", roles: ["Citizen"], identity: "verified", citizenship: "citizen", cardHash: hashCard(DEMO_CARDS[0]!.card), pinHash: hashPin("1234") },
    { id: YAW, name: "Yaw Boakye", kind: "citizen", roles: ["Citizen"], identity: "verified", citizenship: "citizen", cardHash: hashCard(DEMO_CARDS[1]!.card), pinHash: hashPin("1234") },
    { id: KOFI, name: "Kofi Mensah", kind: "citizen", roles: ["Citizen"], identity: "verified", citizenship: "citizen", cardHash: hashCard(DEMO_CARDS[2]!.card), pinHash: hashPin("1234") },
    { id: AKOSUA, name: "Akosua Darko", kind: "citizen", roles: ["Citizen"], identity: "verified", citizenship: "non-citizen", cardHash: hashCard(DEMO_CARDS[3]!.card), pinHash: hashPin("1234") },
    { id: KWABENA, name: "Kwabena Ofori", kind: "citizen", roles: ["Citizen"], identity: "pending", citizenship: "citizen", cardHash: hashCard(DEMO_CARDS[4]!.card), pinHash: hashPin("1234") },
    { id: "GH-c41e07ab", name: "Efua Mensah", kind: "citizen", roles: ["Citizen"], identity: "none", cardHash: hashCard(DEMO_CARDS[5]!.card), pinHash: hashPin("1234") },
    { id: REGISTRAR, name: "Lands Commission", kind: "officer", roles: ["Registrar"], identity: "verified", pinHash: hashPin(STAFF_PIN) },
    { id: SURVEYOR, name: "Kwame Asante", kind: "officer", roles: ["Surveyor"], identity: "verified", pinHash: hashPin(STAFF_PIN) },
    { id: LAWYER, name: "Esi Quaye, Esq.", kind: "officer", roles: ["Lawyer"], identity: "verified", pinHash: hashPin(STAFF_PIN) },
    { id: IDO, name: "Abena Sarpong", kind: "officer", roles: ["Identity officer"], identity: "verified", pinHash: hashPin(STAFF_PIN) },
    { id: JUDGE, name: "Justice Ansah", kind: "officer", roles: ["Judge"], identity: "verified", pinHash: hashPin(STAFF_PIN) },
    { id: PUBLIC, name: "Public visitor", kind: "public", roles: [], identity: "none", cardHash: hashCard(DEMO_CARDS[5]!.card), pinHash: hashPin("1234") },
  ];

  type Row = [string, string, number, Interest, string, ParcelStatus, number, number, number, number?];
  // id, owner, acres, interest, holder, status, cx, cy, angle, price
  const rows: Row[] = [
    ["GA-BRK-0001", KOFI, 6.2, "Customary freehold", "Berekuso Stool", "sold", -620, 380, 8],
    ["GA-BRK-0002", AMA, 8.4, "Common-law freehold", "Owusu Family", "verified", -880, -60, -6],
    ["GA-BRK-0003", YAW, 15.36, "Customary freehold", "Agyeman Family", "for_sale", 230, -260, 12, 799000],
    ["GA-BRK-0004", KOFI, 7.1, "Customary freehold", "Berekuso Stool", "for_sale", 560, 330, -10, 300000],
    ["GA-BRK-0005", AMA, 9.1, "Customary freehold", "Berekuso Stool", "for_sale", -420, -480, 4, 386000],
    ["GA-BRK-0006", YAW, 8.3, "Allodial", "Agyeman Family", "in_escrow", 780, -620, 18, 399000],
    ["GA-BRK-0007", KOFI, 5.4, "Leasehold", "Berekuso Stool", "for_sale", -980, 520, -14, 240000],
    ["GA-BRK-0008", YAW, 3.9, "Common-law freehold", "Boakye Family", "sold", 960, 40, 6],
    ["GA-BRK-0009", AMA, 7.88, "Allodial", "Owusu Family", "verified", -120, 640, -4],
    ["GA-BRK-0010", AKOSUA, 6.6, "Customary freehold", "Berekuso Stool", "for_sale", 1180, 560, 10, 280000],
    ["GA-BRK-0011", KOFI, 10.2, "Customary freehold", "Mensah Family", "frozen", -1200, -560, 20],
    ["GA-BRK-0012", AMA, 4.92, "Leasehold", "Berekuso Stool", "in_escrow", -230, 80, 28, 275000],
    ["GA-BRK-0013", YAW, 5.8, "Customary freehold", "Berekuso Stool", "pending", -680, -60 - 300, -8],
    ["GA-BRK-0014", KOFI, 4.4, "Customary freehold", "Agyeman Family", "pending", 1240, -260, 4],
  ];

  let block = 18450100;
  const history: ChainState["history"] = [];
  const txs: ChainState["txs"] = [];
  let token = 1, title = 1;
  const tx = (contract: string, fn: string, args: string, from: string, at: number) => {
    block += 3;
    txs.unshift({ hash: fakeHash(`${block}${fn}${args}`), contract, fn, args, from, block, at, status: "Success" });
    return block;
  };

  const parcels: Parcel[] = rows.map(([id, owner, acres, interest, holder, status, cx, cy, angle, price], i) => {
    const pillars = makeQuad(cx, cy, acres, angle, 1.1 + (i % 3) * 0.15, (i % 4) * 0.05);
    const at = T0 + i * DAY * 0.5;
    const p: Parcel = {
      id, owner, acres, interest, holder, status, pillars, region: "Eastern", location: "Berekuso, Eastern Region",
      updatedAt: at, docs: [
        { type: "Indenture", name: `${id}-indenture.pdf`, hash: fakeHash(id + "ind") },
        { type: "Site plan", name: `${id}-site-plan.pdf`, hash: fakeHash(id + "site") },
      ],
    };
    if (status !== "pending") {
      p.token = token++; p.titleNo = title++;
      const originalOwner = status === "sold" ? (owner === KOFI ? YAW : KOFI) : owner;
      const b = tx("TitleRegistry", "finalise", `"${id}"`, REGISTRAR, at);
      history.push({ parcelId: id, type: "Registration", text: `Minted to ${originalOwner}`, at, block: b });
      if (status === "sold") {
        const b2 = tx("Marketplace", "approveSale", `"${id}"`, REGISTRAR, at + 3 * DAY);
        history.push({ parcelId: id, type: "Transfer", text: `${originalOwner} → ${owner} for GH₵ 210,000`, at: at + 3 * DAY, block: b2 });
      }
      if (status === "frozen") {
        const b3 = tx("DisputeResolution", "freezeTitle", `"${id}"`, JUDGE, at + 2 * DAY);
        history.push({ parcelId: id, type: "Freeze", text: "Frozen by court order (boundary case)", at: at + 2 * DAY, block: b3 });
      }
    }
    if (price) { p.price = price; p.listedAt = at + DAY; }
    return p;
  });

  const apps: ChainState["applications"] = [
    { id: "APP-1", parcelId: "GA-BRK-0013", applicant: YAW, createdAt: T0 + 6 * DAY,
      survey: { status: "approved", by: SURVEYOR, at: T0 + 7 * DAY }, legal: { status: "waiting" }, registrar: { status: "waiting" } },
    { id: "APP-2", parcelId: "GA-BRK-0014", applicant: KOFI, createdAt: T0 + 8 * DAY,
      survey: { status: "waiting" }, legal: { status: "waiting" }, registrar: { status: "waiting" } },
  ];
  tx("TitleRegistry", "submitApplication", `"GA-BRK-0013", 4 pillars`, YAW, T0 + 6 * DAY);
  tx("TitleRegistry", "approveSurvey", "APP-1", SURVEYOR, T0 + 7 * DAY);
  tx("TitleRegistry", "submitApplication", `"GA-BRK-0014", 4 pillars`, KOFI, T0 + 8 * DAY);
  tx("TestCedi", "faucet", "", AKOSUA, T0 + 8 * DAY);
  tx("Marketplace", "buyListed", `"GA-BRK-0012"`, AKOSUA, T0 + 9 * DAY);
  tx("Marketplace", "buyListed", `"GA-BRK-0006"`, KOFI, T0 + 9 * DAY);
  txs.unshift({ hash: fakeHash("rev1"), contract: "Marketplace", fn: "buyListed", args: `"GA-BRK-0011"`, from: KOFI, block: block + 1, at: T0 + 9.5 * DAY, status: "Reverted", error: "Parcel is not for sale" });
  block += 2;
  tx("DisputeResolution", "raiseDispute", `SALE-2, "Boundary differs from site plan"`, KOFI, T0 + 10 * DAY);

  return {
    block: 18450209,
    accounts,
    parcels,
    applications: apps,
    sales: [
      { id: "SALE-1", parcelId: "GA-BRK-0012", buyer: AKOSUA, seller: AMA, amount: 275000, status: "awaiting", since: T0 + 9 * DAY },
      { id: "SALE-2", parcelId: "GA-BRK-0006", buyer: KOFI, seller: YAW, amount: 399000, status: "disputed", since: T0 + 9 * DAY },
    ],
    disputes: [{ id: "DSP-1", saleId: "SALE-2", raisedBy: KOFI, reason: "Boundary pillars on site differ from the site plan", evidenceHash: fakeHash("evidence") }],
    history,
    txs,
    wallets: {
      [AMA]: { tghs: 420000 }, [YAW]: { tghs: 150000 }, [KOFI]: { tghs: 601000 },
      [AKOSUA]: { tghs: 725000, lastFaucet: T0 + 8 * DAY }, [KWABENA]: { tghs: 0 },
    },
    notifications: [
      { to: "role:Registrar", text: "Sale of GA-BRK-0012 waiting for approval", at: T0 + 9 * DAY },
      { to: "role:Lawyer", text: "Title application GA-BRK-0013 waiting for your review", at: T0 + 7 * DAY },
      { to: "role:Surveyor", text: "New title application GA-BRK-0014 waiting for your review", at: T0 + 8 * DAY },
      { to: "role:Judge", text: "New dispute on GA-BRK-0006", at: T0 + 10 * DAY },
      { to: "role:Identity officer", text: `New identity request from ${KWABENA}`, at: T0 + 10 * DAY },
      { to: AMA, text: "GH-8f10fa27 paid GH₵ 275,000 into escrow for GA-BRK-0012", at: T0 + 9 * DAY },
      { to: YAW, text: "Your application GA-BRK-0013 passed survey", at: T0 + 7 * DAY },
    ],
    nextToken: token,
    nextTitle: title,
  };
}
