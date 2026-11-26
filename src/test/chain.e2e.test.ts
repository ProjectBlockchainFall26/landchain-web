// End-to-end: drives the real service layer (the same landchain.* calls the screens make) against a
// running local chain with the LandChain contracts deployed and seeded (identity, registration, fees, transfers).
//
//   cd ../landchain-contracts && npm run chain        (terminal 1)
//   npm run setup:local && cd ../landchain-web-main && npm run contracts:sync
//   npm run test:e2e
//
// Skipped otherwise, so `npm test` works without a chain.
//
// The same suite runs through the Django backend (task J4) when VITE_API_URL is set:
//   cd ../landchain-backend && python manage.py run_indexer --once && python manage.py runserver
//   VITE_API_URL=http://127.0.0.1:8000/api/v1 npm run test:e2e
import { beforeAll, describe, expect, it } from "vitest";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { createHash } from "node:crypto";
import {
  apiWrites,
  lookupPerson,
  chainSnapshot,
  hashCard,
  landchain,
  reloadChain,
  signInAs,
} from "@/lib/landchain/store";
import { uploadDocument } from "@/lib/landchain/api/actions";
import { areaAcres, makeQuad } from "@/lib/landchain/geo";
import { API_MODE } from "@/lib/landchain/api/config";
import type { ApplicationInput } from "@/lib/landchain/engine";

const run = process.env["LANDCHAIN_E2E"] === "1";

const stateNow = () => chainSnapshot().state;
const byName = (name: string) =>
  stateNow().accounts.find((a) => a.name === name)!;
const parcel = (id: string) => stateNow().parcels.find((p) => p.id === id)!;
const as = (name: string) => signInAs(byName(name).id);

describe.runIf(run)("LandChain against the deployed contracts", () => {
  beforeAll(async () => {
    if (API_MODE) {
      // jsdom's FormData/File can't go through Node's fetch (the upload never leaves); use Node's own.
      const fd = await new Response(new URLSearchParams("a=1")).formData();
      Object.assign(globalThis, {
        FormData: fd.constructor,
        File: NodeFile,
        Blob: NodeBlob,
      });
    }
    await reloadChain();
    expect(chainSnapshot().status.kind).toBe("ok");
    // Through the backend, fees are private: read the register as the registrar, who sees everything.
    if (API_MODE) await as("Lands Commission");
  }, 60_000);

  it("reads the seeded register from the chain", () => {
    const s = stateNow();
    expect(parcel("GA-BRK-0002").planNumber).toMatch(/^SER B/);
    expect(parcel("GA-BRK-0002").docs.map((d) => d.type)).toEqual([
      "Site plan",
      "Indenture",
      "Search report",
    ]);
    expect(
      s.payments.filter((p) => p.parcelId === "GA-BRK-0002").map((p) => p.kind),
    ).toEqual(["Official search", "Stamp duty", "First registration"]);
    expect(s.block).toBeGreaterThan(0);
    expect(parcel("GA-BRK-0002").status).toBe("registered");
    expect(parcel("GA-BRK-0006").status).toBe("transfer_pending");
    expect(parcel("GA-BRK-0013").status).toBe("pending");
    expect(parcel("GA-BRK-0001").owner).toBe(byName("Kofi Mensah").id);
    expect(parcel("GA-BRK-0001").owners).toEqual([
      byName("Yaw Boakye").id,
      byName("Kofi Mensah").id,
    ]);
    expect(
      s.history.some(
        (h) => h.parcelId === "GA-BRK-0001" && h.type === "Transfer",
      ),
    ).toBe(true);
    expect(
      s.txs.some(
        (t) => t.contract === "TitleRegistry" && t.fn === "approveApplication",
      ),
    ).toBe(true);
  });

  it("a refused call comes back with the contract's message and is logged as reverted", async () => {
    await as("Kofi Mensah");
    const r = await landchain.requestTransfer(
      "GA-BRK-0002",
      byName("Yaw Boakye").id,
    ); // Ama's land
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Only the owner can transfer this title");
    expect(
      stateNow().txs.find((t) => t.status === "Reverted")?.error,
    ).toContain("Only the owner can transfer this title");
  });

  it("only the registrar can approve a registration", async () => {
    await as("Kofi Mensah"); // a citizen, not the registrar
    const app = stateNow().applications.find(
      (a) => a.parcelId === "GA-BRK-0014",
    )!;
    const r = await landchain.approveApplication(app.id);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Only the registrar can approve a registration");
  });

  it("runs the whole life of a parcel: identity → apply → registrar → title NFT → transfer", async () => {
    const efua = byName("Efua Mensah");
    await as("Efua Mensah");
    expect(
      (await landchain.submitIdentity(hashCard("GHA-700000006-6"), "citizen"))
        .ok,
    ).toBe(true);
    await as("Lands Commission");
    expect((await landchain.verifyIdentity(efua.id, true)).ok).toBe(true);

    await as("Efua Mensah");
    const id = `GA-BRK-${String(9000 + (Date.now() % 900)).padStart(4, "0")}`;
    const pillars = makeQuad(-1500 - (Date.now() % 7) * 140, 1100, 3.2, 5);
    const input: Omit<ApplicationInput, "docs"> = {
      parcelId: id,
      interest: "Customary freehold",
      holder: "Berekuso Stool",
      region: "Eastern",
      location: "Berekuso, Eastern Region",
      planNumber: "SER B9001/26",
      gpsAddress: "EA-1805-5795",
      pillars,
    };
    let applied;
    if (API_MODE) {
      // Through the backend each document goes to the vault first; the application then carries their ids.
      const docs: { type: string; hash: string }[] = [];
      const ids: string[] = [];
      for (const type of ["Site plan", "Indenture", "Search report"]) {
        const bytes = new TextEncoder().encode(`%PDF-1.4 ${type} for ${id}`);
        const sha = "0x" + createHash("sha256").update(bytes).digest("hex");
        const doc = await uploadDocument(
          new File([bytes], `${type}.pdf`, { type: "application/pdf" }),
          type,
          sha,
        );
        docs.push({ type, hash: sha });
        ids.push(doc.id);
      }
      applied = await apiWrites.submitApplicationWithDocs(
        { ...input, docs },
        ids,
      );
    } else {
      applied = await landchain.submitApplication({
        ...input,
        docs: [{ type: "Site plan", hash: "0x" + "ab".repeat(32) }],
      });
    }
    expect(applied).toEqual({ ok: true });
    expect(parcel(id).status).toBe("pending");
    expect(parcel(id).acres).toBeCloseTo(areaAcres(pillars), 2);
    const app = stateNow().applications.find((a) => a.parcelId === id)!;

    await as("Lands Commission");
    const early = await landchain.approveApplication(app.id);
    expect(early.error).toContain(
      "Record the stamp duty receipt before approving",
    );
    const rcpt = `E2E-${Date.now()}`;
    expect(
      (await landchain.recordPayment(id, "Stamp duty", 1920, `${rcpt}-SD`)).ok,
    ).toBe(true);
    expect(
      (
        await landchain.recordPayment(
          id,
          "First registration",
          4712,
          `${rcpt}-REG`,
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await landchain.recordPayment(
          id,
          "First registration",
          4712,
          `${rcpt}-REG`,
        )
      ).error,
    ).toContain("already been recorded");
    expect((await landchain.approveApplication(app.id)).ok).toBe(true);
    expect(
      stateNow()
        .payments.filter((p) => p.parcelId === id)
        .map((p) => p.amount),
    ).toEqual([1920, 4712]);
    expect(parcel(id).status).toBe("registered");
    expect(parcel(id).titleNo).toBeGreaterThan(0);
    expect(parcel(id).owners).toEqual([efua.id]);

    await as("Efua Mensah");
    // Transfer by public ID: the dialog looks the buyer up before sending.
    expect(await lookupPerson(byName("Ama Owusu").id)).toEqual({ exists: true, verified: true, isYou: false });
    expect((await lookupPerson("GH-00000000")).exists).toBe(false);
    expect((await lookupPerson(efua.id)).isYou).toBe(true);
    expect(
      (await landchain.requestTransfer(id, byName("Ama Owusu").id)).ok,
    ).toBe(true);
    expect(parcel(id).status).toBe("transfer_pending");
    expect(parcel(id).owner).toBe(efua.id);

    await as("Lands Commission");
    const trf = stateNow().transfers.find(
      (t) => t.parcelId === id && t.decision === "waiting",
    )!;
    expect((await landchain.approveTransfer(trf.id)).error).toContain(
      "Record the transfer fee before approving",
    );
    expect(
      (await landchain.recordPayment(id, "Transfer", 3892, `${rcpt}-TRF`)).ok,
    ).toBe(true);
    expect((await landchain.approveTransfer(trf.id)).ok).toBe(true);
    expect(parcel(id).owner).toBe(byName("Ama Owusu").id);
    expect(parcel(id).owners).toEqual([efua.id, byName("Ama Owusu").id]);
    expect(
      stateNow()
        .history.filter((h) => h.parcelId === id)
        .map((h) => h.type),
    ).toEqual([
      "Application",
      "Registration",
      "Transfer requested",
      "Transfer",
    ]);
  }, 120_000);

  it("the registrar settles the seeded transfer request", async () => {
    await as("Lands Commission");
    const t = stateNow().transfers.find(
      (x) => x.parcelId === "GA-BRK-0006" && x.decision === "waiting",
    )!;
    expect(
      (
        await landchain.recordPayment(
          "GA-BRK-0006",
          "Transfer",
          8757,
          `E2E-${Date.now()}-0006`,
        )
      ).ok,
    ).toBe(true);
    expect((await landchain.approveTransfer(t.id)).ok).toBe(true);
    expect(parcel("GA-BRK-0006").owner).toBe(byName("Kofi Mensah").id);
  }, 60_000);
});
