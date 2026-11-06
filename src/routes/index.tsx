import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, CircleDollarSign, Layers, LandPlot, Plus, X } from "lucide-react";
import { Shell } from "@/components/lc/Shell";
import { ParcelMap } from "@/components/lc/ParcelMap";
import { BuyDialog } from "@/components/lc/TitleHealth";
import { Dot, Mono, Pill, StatusPill } from "@/components/lc/ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useMe } from "@/lib/landchain/store";
import { cedi, cediShort, STATUS_TONE } from "@/lib/landchain/format";
import type { ParcelStatus } from "@/lib/landchain/types";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Land Map · LandChain Ghana" },
      { name: "description", content: "Browse registered land parcels in Berekuso, see what's for sale and check any title." },
      { property: "og:title", content: "Land Map · LandChain Ghana" },
      { property: "og:description", content: "Browse registered land parcels, listings and escrow status on the LandChain map." },
    ],
  }),
  component: LandMap,
});

const FILTERS: { key: ParcelStatus; label: string }[] = [
  { key: "for_sale", label: "For sale" }, { key: "in_escrow", label: "In escrow" },
  { key: "sold", label: "Sold" }, { key: "pending", label: "Pending" },
  { key: "frozen", label: "Frozen" }, { key: "verified", label: "Not listed" },
];

function LandMap() {
  const { s, me } = useMe();
  const [selected, setSelected] = useState<string | undefined>("GA-BRK-0003");
  const [show, setShow] = useState<Set<ParcelStatus>>(new Set(FILTERS.map((f) => f.key)));
  const [panel, setPanel] = useState(true);
  const [q, setQ] = useState("");
  const [buyOpen, setBuyOpen] = useState(false);
  const visible = s.parcels.filter((p) => show.has(p.status) && p.status !== "rejected");
  const sel = s.parcels.find((p) => p.id === selected);

  const snap = useMemo(() => {
    const listed = s.parcels.filter((p) => p.status === "for_sale");
    const ppa = listed.map((p) => p.price! / p.acres).sort((a, b) => a - b);
    const median = ppa.length ? (ppa.length % 2 ? ppa[(ppa.length - 1) / 2]! : (ppa[ppa.length / 2 - 1]! + ppa[ppa.length / 2]!) / 2) : 0;
    const escrow = s.sales.filter((x) => x.status === "awaiting" || x.status === "disputed").reduce((a, x) => a + x.amount, 0);
    return { listed: listed.length, median, escrow, titles: s.parcels.filter((p) => p.titleNo).length };
  }, [s]);

  const search = () => {
    const t = q.trim().toLowerCase();
    const p = s.parcels.find((x) => x.id.toLowerCase() === t || x.owner.toLowerCase() === t || String(x.token) === t.replace("#", ""))
      ?? s.parcels.find((x) => x.id.toLowerCase().includes(t) || x.owner.toLowerCase().includes(t));
    if (p) { setSelected(p.id); setPanel(true); } else toast.error("No matching parcel");
  };

  return (
    <Shell title="Land Map" full>
      <div className="relative h-[calc(100vh-6.5rem)] min-h-[560px]">
        <ParcelMap parcels={visible} selectedId={selected} onSelect={(id) => { setSelected(id); setPanel(true); }} className="h-full" />
        {!panel && (
          <button onClick={() => setPanel(true)} className="absolute right-3 top-3 flex items-center gap-1 rounded-lg border bg-card px-3 py-1.5 text-sm shadow-float">Show panel</button>
        )}
        {panel && (
          <div className="absolute inset-x-2 bottom-2 max-h-[60%] overflow-y-auto sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:max-h-[calc(100%-1.5rem)] sm:w-[300px]">
            <div className="space-y-2.5">
              <div className="flex gap-2">
                <button onClick={() => setPanel(false)} className="grid place-items-center rounded-lg border bg-card px-2 text-[10px] text-muted-foreground shadow-float" aria-label="Hide panel"><ChevronRight className="size-3" />Hide</button>
                <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); search(); }}>
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Parcel ID, owner ID or token #" className="h-10 min-w-0 flex-1 rounded-lg border bg-card px-3 text-sm shadow-float outline-none focus:ring-2 focus:ring-ring" />
                  <Button type="submit" className="h-10">Go</Button>
                </form>
              </div>

              {sel && (
                <div className="rounded-xl border bg-card shadow-float">
                  <div className="flex items-center justify-between border-b px-4 py-3">
                    <span className="flex items-center gap-2 font-semibold"><LandPlot className="size-4" />{sel.id}</span>
                    <button onClick={() => setSelected(undefined)} aria-label="Close"><X className="size-4 text-primary" /></button>
                  </div>
                  <div className="space-y-3 p-4">
                    <div>
                      <div className="text-2xl font-semibold">{sel.price ? cedi(sel.price) : sel.titleNo ? `GLT #${sel.titleNo}` : "Pending title"}</div>
                      <div className="text-sm text-muted-foreground">{sel.acres} acres{sel.price ? ` · ${cedi(sel.price! / sel.acres)} per acre` : ""}</div>
                    </div>
                    <div className="flex flex-wrap gap-2"><StatusPill status={sel.status} /><Pill>{sel.interest}</Pill></div>
                    <dl className="space-y-2 pt-2 text-sm">
                      <div className="flex justify-between"><dt className="text-muted-foreground">Owner ID</dt><dd><Mono>{sel.owner}</Mono></dd></div>
                      <div className="flex justify-between"><dt className="text-muted-foreground">Allodial holder</dt><dd>{sel.holder}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted-foreground">Location</dt><dd>Berekuso, {sel.region}</dd></div>
                    </dl>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {sel.status === "for_sale" && me.kind === "citizen" && me.id !== sel.owner && <Button onClick={() => setBuyOpen(true)}>Buy for {cediShort(sel.price!)}</Button>}
                      <Button variant="outline" asChild><Link to="/title/$parcelId" params={{ parcelId: sel.id }}>Open title record</Link></Button>
                    </div>
                    {sel.status === "for_sale" && me.kind !== "citizen" && <p className="text-xs text-muted-foreground">Switch to a citizen account to buy.</p>}
                  </div>
                  <BuyDialog open={buyOpen} onOpenChange={setBuyOpen} parcel={sel} />
                </div>
              )}

              <div className="rounded-xl border bg-card shadow-float">
                <div className="flex items-center gap-2 border-b px-4 py-3 font-semibold"><Layers className="size-4" />Show on map</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 p-4 text-sm">
                  {FILTERS.map((f) => (
                    <label key={f.key} className="flex items-center gap-2">
                      <Checkbox checked={show.has(f.key)} onCheckedChange={(c) => { const n = new Set(show); if (c) n.add(f.key); else n.delete(f.key); setShow(n); }} />
                      <Dot tone={f.key === "for_sale" ? "ok" : STATUS_TONE[f.key]} />
                      {f.label} <span className="text-muted-foreground">{s.parcels.filter((p) => p.status === f.key).length}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border bg-card shadow-float">
                <div className="flex items-center gap-2 border-b px-4 py-3 font-semibold"><CircleDollarSign className="size-4" />Market snapshot</div>
                <dl className="divide-y text-sm">
                  {[["Active listings", snap.listed], ["Median price per acre", cedi(snap.median)], ["Held in escrow", cedi(snap.escrow)], ["Registered titles", snap.titles]].map(([k, v]) => (
                    <div key={k as string} className="flex justify-between px-4 py-2.5"><dt className="text-muted-foreground">{k}</dt><dd className="font-semibold">{v}</dd></div>
                  ))}
                </dl>
                <div className="p-3"><Button asChild className="w-full"><Link to="/register"><Plus className="size-4" />Register a parcel</Link></Button></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
