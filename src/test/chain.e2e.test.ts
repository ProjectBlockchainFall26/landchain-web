// End-to-end: drives the real service layer (the same landchain.* calls the screens make) against a
// running local chain with the LandChain contracts deployed and seeded.
//
//   cd ../landchain-contracts && npm run chain        (terminal 1)
//   npm run setup:local && cd ../landchain-web-main && npm run contracts:sync
//   LANDCHAIN_E2E=1 npm test
//
// Skipped otherwise, so `npm test` works without a chain.
import { beforeAll, describe, expect, it } from "vitest";
import { chainSnapshot, hashCard, landchain, reloadChain, signInAs } from "@/lib/landchain/store";
import { areaAcres, makeQuad } from "@/lib/landchain/geo";

const run = process.env["LANDCHAIN_E2E"] === "1";

const stateNow = () => chainSnapshot().state;
const byName = (name: string) => stateNow().accounts.find((a) => a.name === name)!;
const parcel = (id: string) => stateNow().parcels.find((p) => p.id === id)!;
const as = (name: string) => signInAs(byName(name).id);

describe.runIf(run)("LandChain against the deployed contracts", () => {
  beforeAll(async () => {
    await reloadChain();
    expect(chainSnapshot().status.kind).toBe("ok");
  }, 60_000);

  it("reads the seeded world from the chain", () => {
    const s = stateNow();
    expect(s.block).toBeGreaterThan(0);
    expect(parcel("GA-BRK-0011").status).toBe("frozen");
    expect(parcel("GA-BRK-0012").status).toBe("in_escrow");
    expect(parcel("GA-BRK-0013").status).toBe("pending");
    expect(parcel("GA-BRK-0001").owner).toBe(byName("Kofi Mensah").id);
    expect(s.applications.find((a) => a.parcelId === "GA-BRK-0013")!.survey.status).toBe("approved");
    expect(s.disputes.filter((d) => !d.outcome)).toHaveLength(1);
    expect(s.history.some((h) => h.parcelId === "GA-BRK-0001" && h.type === "Transfer")).toBe(true);
    expect(s.txs.some((t) => t.contract === "TitleRegistry" && t.fn === "finalise")).toBe(true);
  });

  it("a refused call comes back with the contract's message and is logged as reverted", async () => {
    as("Kofi Mensah");
    const r = await landchain.buyListed("GA-BRK-0011");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Parcel is not for sale");
    expect(stateNow().txs.find((t) => t.status === "Reverted")?.error).toContain("Parcel is not for sale");
  });

  it("officers can only sign their own step", async () => {
    as("Esi Quaye, Esq.");
    const app = stateNow().applications.find((a) => a.parcelId === "GA-BRK-0014")!;
    const r = await landchain.approveLegal(app.id);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Steps must happen in order");
  });

  it("runs the whole life of a parcel: identity → apply → 3 sign-offs → title → list → escrow → transfer", async () => {
    const efua = byName("Efua Mensah");
    as("Efua Mensah");
    expect((await landchain.submitIdentity(hashCard("GHA-700000006-6"), "citizen")).ok).toBe(true);
    as("Abena Sarpong");
    expect((await landchain.verifyIdentity(efua.id, true)).ok).toBe(true);

    as("Efua Mensah");
    const id = `GA-BRK-${String(9000 + (Date.now() % 900)).padStart(4, "0")}`;
    const pillars = makeQuad(-1500 - (Date.now() % 7) * 140, 1100, 3.2, 5);
    const applied = await landchain.submitApplication({ parcelId: id, interest: "Customary freehold", holder: "Berekuso Stool", region: "Eastern", location: "Berekuso, Eastern Region", pillars, docs: [] });
    expect(applied).toEqual({ ok: true });
    expect(parcel(id).status).toBe("pending");
    expect(parcel(id).acres).toBeCloseTo(areaAcres(pillars), 2);
    const app = stateNow().applications.find((a) => a.parcelId === id)!;

    as("Kwame Asante");
    expect((await landchain.approveSurvey(app.id)).ok).toBe(true);
    as("Esi Quaye, Esq.");
    expect((await landchain.approveLegal(app.id)).ok).toBe(true);
    as("Lands Commission");
    expect((await landchain.finalise(app.id)).ok).toBe(true);
    expect(parcel(id).status).toBe("verified");
    expect(parcel(id).titleNo).toBeGreaterThan(0);

    as("Efua Mensah");
    expect((await landchain.listForSale(id, 150000)).ok).toBe(true);
    expect(parcel(id).price).toBe(150000);

    as("Ama Owusu");
    const amaBefore = stateNow().wallets[byName("Ama Owusu").id]!.tghs;
    expect((await landchain.buyListed(id)).ok).toBe(true); // approve + buyListed
    expect(parcel(id).status).toBe("in_escrow");
    expect(stateNow().wallets[byName("Ama Owusu").id]!.tghs).toBe(amaBefore - 150000);

    as("Lands Commission");
    const sale = stateNow().sales.find((x) => x.parcelId === id && x.status === "awaiting")!;
    expect((await landchain.approveSale(sale.id)).ok).toBe(true);
    expect(parcel(id).owner).toBe(byName("Ama Owusu").id);
    expect(parcel(id).status).toBe("sold");
    expect(stateNow().wallets[efua.id]!.tghs).toBe(150000);
    expect(stateNow().history.filter((h) => h.parcelId === id).map((h) => h.type)).toEqual(["Registration", "Listing", "Transfer"]);
  }, 120_000);

  it("the judge settles the seeded dispute", async () => {
    as("Justice Ansah");
    const d = stateNow().disputes.find((x) => !x.outcome)!;
    expect((await landchain.resolveDispute(d.id, "buyer")).ok).toBe(true);
    expect(parcel("GA-BRK-0006").status).toBe("verified");
  }, 60_000);
});
