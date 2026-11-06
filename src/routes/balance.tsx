import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Coins, Droplets, LandPlot, Lock, Ruler } from "lucide-react";
import { Shell } from "@/components/lc/Shell";
import { Card, Empty, Mono, Pill, Stat, Td, Th } from "@/components/lc/ui";
import { Button } from "@/components/ui/button";
import { landchain, useMe } from "@/lib/landchain/store";
import { escrowHeldBy, faucetRemainingMs, wallet } from "@/lib/landchain/engine";
import { blockNo, cedi, shortHash } from "@/lib/landchain/format";

export const Route = createFileRoute("/balance")({
  head: () => ({
    meta: [
      { title: "My Balance · LandChain Ghana" },
      { name: "description", content: "Your test-cedi wallet, money held in escrow and transaction history." },
      { property: "og:title", content: "My Balance · LandChain Ghana" },
      { property: "og:description", content: "Test cedi balance, escrow and transactions for your LandChain wallet." },
    ],
  }),
  component: Balance,
});

function Balance() {
  const { s, me } = useMe();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const w = wallet(s, me.id);
  const mine = s.parcels.filter((p) => p.owner === me.id && p.titleNo);
  const remaining = now ? faucetRemainingMs(s, me.id, now) : 0;
  const txs = s.txs.filter((t) => t.from === me.id);
  const mm = Math.floor(remaining / 60000), ss = Math.floor((remaining % 60000) / 1000);

  if (me.kind !== "citizen") {
    return <Shell title="My Balance"><div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center text-sm"><p className="font-medium">No wallet for this account.</p><p className="mt-1 text-muted-foreground">Switch to a citizen to hold test cedis.</p></div></Shell>;
  }
  return (
    <Shell title="My Balance">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<Coins className="size-4" />} label="tGHS balance" value={cedi(w.tghs)} sub="Test cedis — play money" />
        <Stat icon={<Lock className="size-4" />} label="Your money in escrow" value={cedi(escrowHeldBy(s, me.id))} />
        <Stat icon={<LandPlot className="size-4" />} label="Titles held" value={mine.length} />
        <Stat icon={<Ruler className="size-4" />} label="Land held" value={`${mine.reduce((a, p) => a + p.acres, 0).toFixed(2)} ac`} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5">
        <span className="grid size-10 place-items-center rounded-lg bg-info-soft text-info"><Droplets className="size-5" /></span>
        <div className="flex-1">
          <h2 className="font-semibold">Test cedi faucet</h2>
          <p className="text-sm text-muted-foreground">tGHS is play money for the test network — no real payments. One claim per hour.</p>
        </div>
        <Button disabled={remaining > 0} onClick={() => landchain.faucet()}>
          {remaining > 0 ? `Next claim in ${mm}:${String(ss).padStart(2, "0")}` : "Get GH₵ 1,000,000 tGHS"}
        </Button>
      </div>
      <Card title="Your transactions" className="mt-4">
        {txs.length === 0 ? <Empty>No transactions yet.</Empty> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b"><tr><Th>Contract call</Th><Th>Block</Th><Th>Status</Th><Th>Hash</Th></tr></thead>
            <tbody>{txs.map((t) => (
              <tr key={t.hash} className="border-b last:border-0">
                <Td><Mono>{t.contract}.{t.fn}({t.args})</Mono>{t.error && <div className="text-xs text-bad">{t.error}</div>}</Td>
                <Td>{blockNo(t.block)}</Td>
                <Td><Pill tone={t.status === "Success" ? "ok" : "bad"}>{t.status}</Pill></Td>
                <Td><Mono className="text-muted-foreground">{shortHash(t.hash)}</Mono></Td>
              </tr>))}</tbody></table></div>
        )}
      </Card>
    </Shell>
  );
}
