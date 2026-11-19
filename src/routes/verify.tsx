import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { Shell } from "@/components/lc/Shell";
import { Card, Mono, StatusPill, Td, Th } from "@/components/lc/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe } from "@/lib/landchain/store";
import { account, getParcel } from "@/lib/landchain/engine";
import { toast } from "sonner";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "Verify a Title · LandChain Ghana" },
      { name: "description", content: "Check any Ghana land title for free: owner, status and full history, no wallet needed." },
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
            <p className="text-sm text-muted-foreground">Anyone can read the register straight from the blockchain: no wallet, no fees. You see the owner, the boundary and every change ever made, but you can't edit any of it.</p></div></div>
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
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b"><tr><Th>Parcel</Th><Th>Status</Th><Th>Owner</Th><Th>Size</Th><Th>Owners so far</Th><Th /></tr></thead>
          <tbody>{titles.map((p) => (
            <tr key={p.id} className="border-b last:border-0">
              <Td><div className="font-medium">{p.id}</div><div className="text-xs text-muted-foreground">{p.titleNo ? `GLT #${p.titleNo}` : "No title yet"}</div></Td>
              <Td><StatusPill status={p.status} /></Td>
              <Td>{account(s, p.owner)?.name ?? ""} <Mono className="text-muted-foreground">{p.owner}</Mono></Td><Td>{p.acres} ac</Td><Td>{p.owners.length}</Td>
              <Td className="text-right"><Button size="sm" variant="outline" asChild><Link to="/title/$parcelId" params={{ parcelId: p.id }}>View record</Link></Button></Td>
            </tr>))}</tbody></table></div>
      </Card>
    </Shell>
  );
}
