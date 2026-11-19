import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/lc/Shell";
import { Card } from "@/components/lc/ui";

export const Route = createFileRoute("/assumptions")({
  head: () => ({
    meta: [
      { title: "Assumptions · LandChain Ghana" },
      { name: "description", content: "What LandChain assumes, what the blockchain guarantees, and what it doesn't." },
    ],
  }),
  component: Assumptions,
});

const GUARANTEES = [
  "Once the registrar approves a title, nobody can edit it, not even the Lands Commission. A change is a new transaction that everyone can see.",
  "A title moves only when the owner requests it and the registrar approves it. transferFrom is blocked, even for the owner.",
  "Every action records who signed it, when, and in which block. This history can't be deleted, so it can be used as evidence in court.",
  "Each document's SHA-256 fingerprint is on chain, so anyone holding a copy can prove whether it is the registered version.",
  "Only the registrar can approve, only an identity officer can verify a Ghana Card, and the registrar can't approve until the fee receipts are recorded. The contract enforces all of this, not just the app.",
];

const ASSUMPTIONS: [string, string][] = [
  ["The sale happens off the platform", "LandChain does not handle buying, negotiating or paying for land. The owner bought or inherited it the usual way (indenture, lawyer, family or stool). LandChain records the result once the Lands Commission accepts it."],
  ["The Lands Commission is trusted when a record is entered", "The blockchain guarantees a record isn't changed after it is entered. It can't prove the paperwork was genuine before it was entered: if a forged indenture is approved, the chain faithfully stores a forgery. This is the \"oracle problem\"."],
  ["The physical and legal checks happen off the platform", "The surveyor's site plan, the official search, the GRA stamp duty and stool or family consent are done in the real world before the registrar approves. LandChain stores proof that they happened (fingerprints and receipt references), not the checks themselves."],
  ["The identity officer stands in for the National Identification Authority", "Verifying a Ghana Card here represents a check against the NIA. One Ghana Card is linked to one wallet."],
  ["Your wallet is your identity", "Whoever holds the wallet's private key acts as the owner. If an owner loses their key, recovering the title through the registrar is future work."],
  ["No personal data or documents on chain", "The blockchain is public: anyone running a node can read everything in a contract. So only pseudonymous IDs (GH-…) and fingerprints go on chain. Names, files, Ghana Card numbers and enquiry messages stay off chain with the Lands Commission."],
  ["Fees are paid in cedis outside LandChain", "The owner pays the Lands Commission and the GRA as usual. The registrar records each official receipt in the FeeLedger contract; suggested amounts come from published schedules and may be out of date."],
  ["Whole parcels only", "First registration and transfer of whole parcels. No subdivision, leases, mortgages, ground rent or inheritance yet."],
  ["Boundary accuracy depends on the surveyor", "The app checks that a boundary doesn't overlap a neighbour; the contract checks it is inside Ghana and not already registered. Whether the pillars are really where the plan says is the surveyor's responsibility."],
  ["Courts decide disputes outside the system", "LandChain provides the evidence (who owned it, when, who approved). A court order would be carried out by the registrar; a court role on chain is future work."],
  ["The registrar's key is trusted and safe", "A single registrar role approves. A real deployment would need multi-signature approval, hardware key storage and the Django backend signing officer actions."],
  ["Test network only", "The demo runs on a local Ganache chain (or Sepolia) with test ETH that has no value. Gas costs on the receipt are real numbers but not real money."],
];

function Assumptions() {
  return (
    <Shell title="Assumptions">
      <div className="mx-auto max-w-3xl space-y-4">
        <Card title="What the blockchain guarantees">
          <ul className="space-y-2 text-sm">{GUARANTEES.map((g) => <li key={g} className="flex gap-2"><span className="text-ok">✓</span>{g}</li>)}</ul>
        </Card>
        <Card title="What we assume" right={`${ASSUMPTIONS.length} assumptions`}>
          <ol className="space-y-3 text-sm">
            {ASSUMPTIONS.map(([t, d], i) => (
              <li key={t} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                <div><div className="font-medium">{t}</div><p className="text-muted-foreground">{d}</p></div></li>
            ))}
          </ol>
        </Card>
      </div>
    </Shell>
  );
}
