import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/lc/Shell";
import { Card, Empty, Mono, Pill, Td, Th } from "@/components/lc/ui";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMe } from "@/lib/landchain/store";
import { account } from "@/lib/landchain/engine";
import { blockNo, fmtDate, shortHash } from "@/lib/landchain/format";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity Log · LandChain Ghana" },
      { name: "description", content: "Every LandChain contract call, including reverted ones, newest first." },
      { property: "og:title", content: "Activity Log · LandChain Ghana" },
      { property: "og:description", content: "A tamper-proof history of every action on the LandChain registry." },
    ],
  }),
  component: Activity,
});

function Activity() {
  const { s } = useMe();
  const [parcel, setParcel] = useState("");
  const [person, setPerson] = useState("all");
  const [contract, setContract] = useState("all");
  const [status, setStatus] = useState("all");
  const contracts = [...new Set(s.txs.map((t) => t.contract))];
  const rows = s.txs.filter((t) =>
    (!parcel || t.args.toLowerCase().includes(parcel.toLowerCase())) &&
    (person === "all" || t.from === person) && (contract === "all" || t.contract === contract) && (status === "all" || t.status === status));
  return (
    <Shell title="Activity Log">
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <Input placeholder="Filter by parcel" value={parcel} onChange={(e) => setParcel(e.target.value)} />
        <Select value={person} onValueChange={setPerson}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Everyone</SelectItem>{s.accounts.filter((a) => a.kind !== "public").map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
        <Select value={contract} onValueChange={setContract}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All contracts</SelectItem>{contracts.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Any status</SelectItem><SelectItem value="Success">Success</SelectItem><SelectItem value="Reverted">Reverted</SelectItem></SelectContent></Select>
      </div>
      <Card title="All contract calls" right={`${rows.length} calls`}>
        {rows.length === 0 ? <Empty>No calls match these filters.</Empty> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b"><tr><Th>Function call</Th><Th>From</Th><Th>Block</Th><Th>Date</Th><Th>Status</Th><Th>Tx hash</Th></tr></thead>
            <tbody>{rows.map((t) => (
              <tr key={t.hash + t.block} className="border-b last:border-0">
                <Td><Mono>{t.contract}.{t.fn}({t.args})</Mono>{t.error && <div className="text-xs text-bad">{t.error}</div>}</Td>
                <Td>{account(s, t.from)?.name ?? t.from}</Td><Td>{blockNo(t.block)}</Td><Td>{fmtDate(t.at)}</Td>
                <Td><Pill tone={t.status === "Success" ? "ok" : "bad"}>{t.status}</Pill></Td>
                <Td><Mono className="text-muted-foreground">{shortHash(t.hash)}</Mono></Td>
              </tr>))}</tbody></table></div>
        )}
      </Card>
    </Shell>
  );
}
