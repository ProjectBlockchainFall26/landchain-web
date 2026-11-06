import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { Shell } from "@/components/lc/Shell";
import { Card, Mono, Pill, Td, Th } from "@/components/lc/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe } from "@/lib/landchain/store";
import { getHistory, getParcel } from "@/lib/landchain/engine";
import { toast } from "sonner";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "Verify a Title · LandChain Ghana" },
      { name: "description", content: "Check any Ghana land title for free — owner ID, status and full history, no wallet needed." },
      { property: "og:title", content: "Verify a Title · LandChain Ghana" },
      { property: "og:description", content: "Free, read-only public lookup of any LandChain title." },
    ],
  }),
  component: Verify,
});

function Verify() {
  const { s } = useMe();
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const titles = s.parcels.filter((p) => p.status !== "rejected");
  return (
    <Shell title="Verify a Title">
      <div className="mb-5 rounded-xl border bg-card p-6">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-ok-soft text-ok"><ShieldCheck className="size-5" /></span>
          <div><h2 className="text-xl font-semibold">Check any title, free</h2>
            <p className="text-sm text-muted-foreground">Reading the record needs no wallet and no fees. You can see the owner ID, status and full history, but never edit.</p></div></div>
        <form className="mt-4 flex max-w-lg gap-2" onSubmit={(e) => {
          e.preventDefault();
          const p = getParcel(s, q);
          if (p) navigate({ to: "/title/$parcelId", params: { parcelId: p.id } }); else toast.error(`No title found for "${q}"`);
        }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Parcel ID, e.g. GA-BRK-0003" />
          <Button type="submit">Verify</Button>
        </form>
      </div>
      <Card title="Registered titles">
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b"><tr><Th>Parcel</Th><Th>Status</Th><Th>Owner ID</Th><Th>Size</Th><Th>Records</Th><Th /></tr></thead>
          <tbody>{titles.map((p) => (
            <tr key={p.id} className="border-b last:border-0">
              <Td><div className="font-medium">{p.id}</div><div className="text-xs text-muted-foreground">{p.titleNo ? `GLT #${p.titleNo}` : "No title yet"}</div></Td>
              <Td><Pill tone={p.status === "frozen" ? "info" : p.status === "pending" ? "warn" : "ok"}>{p.status === "frozen" ? "Frozen" : p.status === "pending" ? "Pending" : "Verified"}</Pill></Td>
              <Td><Mono>{p.owner}</Mono></Td><Td>{p.acres} ac</Td><Td>{getHistory(s, p.id).length}</Td>
              <Td className="text-right"><Button size="sm" variant="outline" asChild><Link to="/title/$parcelId" params={{ parcelId: p.id }}>View record</Link></Button></Td>
            </tr>))}</tbody></table></div>
      </Card>
    </Shell>
  );
}
