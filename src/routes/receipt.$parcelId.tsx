import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Printer } from "lucide-react";
import { Shell } from "@/components/lc/Shell";
import { Card, Empty, Mono, Td, Th } from "@/components/lc/ui";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/landchain/store";
import { getHistory, getParcel, paymentsFor } from "@/lib/landchain/engine";
import { cedi, FEE_INFO } from "@/lib/landchain/fees";
import { blockNo, fmtDate, shortHash } from "@/lib/landchain/format";
import { canSeePrivate, shownName } from "@/lib/landchain/privacy";
import { chainName } from "@/lib/landchain/chain/config";
import { gasCost, type GasCost } from "@/lib/landchain/chain/gas";
import { API_MODE } from "@/lib/landchain/api/config";
import { loadReceipt } from "@/lib/landchain/api/actions";

export const Route = createFileRoute("/receipt/$parcelId")({
  head: ({ params }) => ({
    meta: [
      { title: `Receipt · ${params.parcelId} · LandChain Ghana` },
      {
        name: "description",
        content:
          "What the owner paid to register this land: official fees and blockchain costs.",
      },
    ],
  }),
  component: ReceiptPage,
});

function ReceiptPage() {
  const { parcelId } = Route.useParams();
  const { s, me } = useMe();
  const p = getParcel(s, parcelId);
  const fees = p ? paymentsFor(s, p.id) : [];
  const steps = p
    ? [
        ...getHistory(s, p.id)
          .filter((h) => h.tx)
          .map((h) => ({ label: h.type, tx: h.tx, at: h.at })),
        ...fees
          .filter((f) => f.tx)
          .map((f) => ({
            label: `Record ${f.kind.toLowerCase()} receipt`,
            tx: f.tx,
            at: f.at,
          })),
      ]
    : [];
  // One transaction can emit several events (approval also mints): show it once.
  const unique = [...new Map(steps.map((x) => [x.tx, x])).values()].sort(
    (a, b) => a.at - b.at,
  );
  const [gas, setGas] = useState<Record<string, GasCost | null>>({});
  const key = unique.map((u) => u.tx).join(",");
  useEffect(() => {
    let live = true;
    if (API_MODE) {
      // Backend mode: gas used x price for every transaction of this record, read from receipts by the backend.
      if (p)
        void loadReceipt(p.id)
          .then((r) => {
            if (!live) return;
            setGas(
              Object.fromEntries(
                r.transactions.items.map((t) => [
                  t.tx_hash,
                  {
                    hash: t.tx_hash,
                    from: t.signed_by?.public_id ?? "",
                    gasUsed: t.gas_used,
                    gasPriceGwei: Number(t.gas_price_gwei),
                    costEth: Number(t.cost_eth),
                    block: t.block,
                  } satisfies GasCost,
                ]),
              ),
            );
          })
          .catch(() => undefined);
      return () => {
        live = false;
      };
    }
    void Promise.all(
      unique.map(async (u) => [u.tx, await gasCost(u.tx)] as const),
    ).then((all) => {
      if (live) setGas(Object.fromEntries(all));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!p)
    return (
      <Shell title="Receipt">
        <Empty>No parcel called {parcelId}.</Empty>
      </Shell>
    );
  if (!canSeePrivate(me, p)) {
    return (
      <Shell title="Receipt">
        <div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center">
          <p className="font-medium">Receipts are private.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Only the owner and the Lands Commission can see what was paid for{" "}
            {p.id}.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/title/$parcelId" params={{ parcelId: p.id }}>
              Back to the title
            </Link>
          </Button>
        </div>
      </Shell>
    );
  }
  const totalFees = fees.reduce((a, f) => a + f.amount, 0);
  const costs = unique.map((u) => gas[u.tx]).filter(Boolean) as GasCost[];
  const totalEth = costs.reduce((a, g) => a + g.costEth, 0);
  const ownerEth = costs
    .filter((g) => p.owners.includes(g.from))
    .reduce((a, g) => a + g.costEth, 0);

  return (
    <Shell title={`Receipt · ${p.id}`}>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          to="/title/$parcelId"
          params={{ parcelId: p.id }}
          className="flex items-center gap-1 text-sm font-medium text-primary"
        >
          <ChevronLeft className="size-4" />
          Back to title
        </Link>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" />
          Print
        </Button>
      </div>

      <div className="mb-4 rounded-xl border bg-card p-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          LandChain Ghana · statement of costs
        </div>
        <h2 className="mt-1 text-xl font-semibold">
          {p.id}
          {p.titleNo ? ` · Title GLT #${p.titleNo}` : " · application"}
        </h2>
        <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Owner</span> ·{" "}
            {shownName(s, me, p.owner)}{" "}
            <Mono className="text-muted-foreground">{p.owner}</Mono>
          </div>
          <div>
            <span className="text-muted-foreground">Plan number</span> ·{" "}
            <Mono>{p.planNumber}</Mono>
          </div>
          <div>
            <span className="text-muted-foreground">Area</span> · {p.acres}{" "}
            acres · {p.interest}
          </div>
          <div>
            <span className="text-muted-foreground">Location</span> ·{" "}
            {p.location}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-muted p-3">
            <div className="text-xs text-muted-foreground">
              Official fees paid (cedis)
            </div>
            <div className="text-2xl font-semibold">{cedi(totalFees)}</div>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <div className="text-xs text-muted-foreground">
              Blockchain costs (gas, {chainName})
            </div>
            <div className="text-2xl font-semibold">
              {totalEth.toFixed(6)} ETH
            </div>
            <div className="text-xs text-muted-foreground">
              of which the owner signed {ownerEth.toFixed(6)} ETH
            </div>
          </div>
        </div>
      </div>

      <Card
        title="1 · Official fees"
        right="Paid in cedis outside LandChain, recorded by the registrar"
      >
        {fees.length === 0 ? (
          <Empty>No receipts recorded yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <Th>Fee</Th>
                  <Th>Paid to</Th>
                  <Th>Recorded</Th>
                  <Th>Receipt fingerprint</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {fees.map((f) => (
                  <tr key={f.id} className="border-b last:border-0">
                    <Td>
                      {f.kind}
                      {f.transferId && (
                        <span className="block text-xs text-muted-foreground">
                          {f.transferId}
                        </span>
                      )}
                    </Td>
                    <Td>{FEE_INFO[f.kind].paidTo}</Td>
                    <Td>
                      {fmtDate(f.at)}
                      <span className="block text-xs text-muted-foreground">
                        by {shownName(s, me, f.recordedBy)}
                      </span>
                    </Td>
                    <Td>
                      <Mono>{shortHash(f.receiptHash)}</Mono>
                      <span className="block text-xs text-muted-foreground">
                        tx <Mono>{shortHash(f.tx)}</Mono>
                      </span>
                    </Td>
                    <Td className="text-right font-medium">{cedi(f.amount)}</Td>
                  </tr>
                ))}
                <tr>
                  <Td className="font-semibold">Total</Td>
                  <Td />
                  <Td />
                  <Td />
                  <Td className="text-right font-semibold">
                    {cedi(totalFees)}
                  </Td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="h-4" />
      <Card
        title="2 · Blockchain transactions"
        right="Gas used × gas price, read from each transaction receipt"
      >
        {unique.length === 0 ? (
          <Empty>No transactions yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <Th>Step</Th>
                  <Th>Signed by</Th>
                  <Th>Block</Th>
                  <Th>Gas used</Th>
                  <Th>Gas price</Th>
                  <Th className="text-right">Cost</Th>
                </tr>
              </thead>
              <tbody>
                {unique.map((u) => {
                  const g = gas[u.tx];
                  return (
                    <tr key={u.tx} className="border-b last:border-0">
                      <Td>
                        {u.label}
                        <Mono className="block text-xs text-muted-foreground">
                          {shortHash(u.tx)}
                        </Mono>
                      </Td>
                      <Td>{g ? shownName(s, me, g.from) : "…"}</Td>
                      <Td>{g ? blockNo(g.block) : "…"}</Td>
                      <Td>{g ? g.gasUsed.toLocaleString("en-US") : "…"}</Td>
                      <Td>{g ? `${g.gasPriceGwei} gwei` : "…"}</Td>
                      <Td className="text-right">
                        {g ? `${g.costEth.toFixed(6)} ETH` : "…"}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          On {chainName} this is test ETH with no real value. Officer
          transactions would be paid by the Lands Commission's own wallet.
        </p>
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">
        Fee amounts are what the registrar recorded from the official receipts.
        Suggested amounts come from published schedules and may be out of date;
        the Lands Commission and the GRA set the actual fees.
      </p>
    </Shell>
  );
}
