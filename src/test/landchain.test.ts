import { describe, expect, it } from "vitest";
import * as E from "@/lib/landchain/engine";
import { makeSeed, AMA, AKOSUA, KOFI, REGISTRAR, SURVEYOR, LAWYER, JUDGE } from "@/lib/landchain/seed";
import { makeQuad } from "@/lib/landchain/geo";

const at = (from: string, now = 1e12) => ({ from, now });

describe("LandChain rules", () => {
  it("application steps must go survey → legal → registrar, each by its role", () => {
    let s = makeSeed();
    const app = "APP-2"; // GA-BRK-0014, nothing approved
    expect(E.reviewApplication(s, at(LAWYER), app, "legal", true).ok).toBe(false);
    expect(E.reviewApplication(s, at(LAWYER), app, "survey", true).ok).toBe(false);
    s = E.reviewApplication(s, at(SURVEYOR), app, "survey", true).state;
    s = E.reviewApplication(s, at(LAWYER), app, "legal", true).state;
    const r = E.reviewApplication(s, at(REGISTRAR), app, "registrar", true);
    expect(r.ok).toBe(true);
    const p = r.state.parcels.find((x) => x.id === "GA-BRK-0014")!;
    expect(p.status).toBe("verified");
    expect(p.titleNo).toBeGreaterThan(0);
  });

  it("rejecting an application needs a reason", () => {
    const s = makeSeed();
    expect(E.reviewApplication(s, at(SURVEYOR), "APP-2", "survey", false, "").ok).toBe(false);
    expect(E.reviewApplication(s, at(SURVEYOR), "APP-2", "survey", false, "Pillars missing").ok).toBe(true);
  });

  it("approving a sale moves the title to the buyer and money to the seller", () => {
    const s = makeSeed();
    const before = E.wallet(s, AMA).tghs;
    expect(E.approveSale(s, at(KOFI), "SALE-1").ok).toBe(false);
    const r = E.approveSale(s, at(REGISTRAR), "SALE-1");
    expect(r.state.parcels.find((p) => p.id === "GA-BRK-0012")!.owner).toBe(AKOSUA);
    expect(E.wallet(r.state, AMA).tghs).toBe(before + 275000);
  });

  it("rejecting a sale refunds the buyer in full", () => {
    const s = makeSeed();
    const before = E.wallet(s, AKOSUA).tghs;
    const r = E.rejectSale(s, at(REGISTRAR), "SALE-1");
    expect(E.wallet(r.state, AKOSUA).tghs).toBe(before + 275000);
    expect(r.state.parcels.find((p) => p.id === "GA-BRK-0012")!.owner).toBe(AMA);
  });

  it("buying moves the price into escrow; unverified parcels can't be listed", () => {
    let s = makeSeed();
    s = E.faucet(s, at(AMA)).state;
    const r = E.buyListed(s, at(AMA), "GA-BRK-0003");
    expect(r.ok).toBe(true);
    expect(E.escrowHeldBy(r.state, AMA)).toBe(799000);
    expect(E.listForSale(s, at(KOFI), "GA-BRK-0011", 1000).ok).toBe(false); // frozen
  });

  it("judge ruling for buyer refunds; for seller completes the sale", () => {
    const s = makeSeed();
    expect(E.resolveDispute(s, at(REGISTRAR), "DSP-1", "buyer").ok).toBe(false);
    const buyer = E.resolveDispute(s, at(JUDGE), "DSP-1", "buyer");
    expect(E.wallet(buyer.state, KOFI).tghs).toBe(E.wallet(s, KOFI).tghs + 399000);
    const seller = E.resolveDispute(s, at(JUDGE), "DSP-1", "seller");
    expect(seller.state.parcels.find((p) => p.id === "GA-BRK-0006")!.owner).toBe(KOFI);
  });

  it("faucet gives 1,000,000 tGHS once per hour", () => {
    let s = makeSeed();
    const b = E.wallet(s, AMA).tghs;
    s = E.faucet(s, at(AMA, 1e12)).state;
    expect(E.wallet(s, AMA).tghs).toBe(b + 1_000_000);
    expect(E.faucet(s, at(AMA, 1e12 + 59 * 60000)).ok).toBe(false);
    expect(E.faucet(s, at(AMA, 1e12 + 61 * 60000)).ok).toBe(true);
  });

  it("boundaries must have 3+ pillars, be inside Ghana and not overlap", () => {
    const s = makeSeed();
    expect(E.validateBoundary(s, [[5.7, -0.2], [5.71, -0.2]])).toMatch(/at least 3/);
    expect(E.validateBoundary(s, [[51, 0], [51.1, 0], [51, 0.1]])).toMatch(/inside Ghana/);
    const p3 = s.parcels.find((p) => p.id === "GA-BRK-0003")!;
    expect(E.validateBoundary(s, p3.pillars)).toMatch(/overlaps/);
    expect(E.validateBoundary(s, makeQuad(3000, 3000, 3, 0))).toBeNull();
  });
});

describe("Ghana Card sign-in", () => {
  it("correct card + PIN signs in as that person; wrong PIN fails", () => {
    const s = makeSeed();
    const ok = E.login(s, at("anonymous"), E.hashCard("gha-700000001-1"), E.hashPin("1234"));
    expect(ok.ok).toBe(true);
    expect(ok.accountId).toBe(AMA);
    expect(E.login(s, at("anonymous"), E.hashCard("GHA-700000001-1"), E.hashPin("9999")).ok).toBe(false);
    expect(E.login(s, at("anonymous"), E.hashCard("GHA-999999999-9"), E.hashPin("1234")).ok).toBe(false);
  });
  it("a Ghana Card can only be registered once; new profiles start pending", () => {
    const s = makeSeed();
    expect(E.registerCard(s, at("anonymous"), "Ama Again", E.hashCard("GHA-700000001-1"), E.hashPin("1111"), "citizen").ok).toBe(false);
    const r = E.registerCard(s, at("anonymous"), "Kojo Annan", E.hashCard("GHA-123456789-0"), E.hashPin("1111"), "citizen");
    expect(r.ok).toBe(true);
    expect(E.account(r.state, r.accountId)!.identity).toBe("pending");
  });
  it("staff sign in with the staff PIN only", () => {
    const s = makeSeed();
    expect(E.staffLogin(s, at(REGISTRAR), REGISTRAR, E.hashPin("0000")).ok).toBe(true);
    expect(E.staffLogin(s, at(REGISTRAR), REGISTRAR, E.hashPin("1234")).ok).toBe(false);
  });
});
