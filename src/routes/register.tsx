import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, FileText, Grid3x3, LocateFixed, Plus, Ruler, ShieldAlert, ShieldCheck, Undo2 } from "lucide-react";
import { Shell } from "@/components/lc/Shell";
import { MapChip, ParcelMap } from "@/components/lc/ParcelMap";
import { Mono, Pill } from "@/components/lc/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { landchain, sha256Hex, useMe } from "@/lib/landchain/store";
import { validateBoundary } from "@/lib/landchain/engine";
import { areaAcres, type LatLng } from "@/lib/landchain/geo";
import type { Doc, Interest } from "@/lib/landchain/types";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register Land · LandChain Ghana" },
      { name: "description", content: "Draw your parcel boundary and apply for a digital land title." },
      { property: "og:title", content: "Register Land · LandChain Ghana" },
      { property: "og:description", content: "Apply for a LandChain title: draw the boundary, add documents, track sign-offs." },
    ],
  }),
  component: Register,
});

const INTERESTS: Interest[] = ["Allodial", "Customary freehold", "Common-law freehold", "Leasehold"];
const PLOT_ACRES = (100 * 70 * 0.092903) / 4046.8564;

function Register() {
  const { s, me } = useMe();
  const nextId = useMemo(() => {
    let n = 15;
    while (s.parcels.some((p) => p.id === `GA-BRK-${String(n).padStart(4, "0")}`)) n++;
    return `GA-BRK-${String(n).padStart(4, "0")}`;
  }, [s.parcels]);
  const [pts, setPts] = useState<LatLng[]>([]);
  const [pid, setPid] = useState("");
  const [interest, setInterest] = useState<Interest>("Leasehold");
  const [holder, setHolder] = useState("Berekuso Stool");
  const [region, setRegion] = useState("Eastern");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [done, setDone] = useState<string>();

  const area = areaAcres(pts);
  const boundaryErr = pts.length >= 3 ? validateBoundary(s, pts) : null;
  const overlap = boundaryErr?.startsWith("Boundary overlaps");
  const parcelId = pid || nextId;

  if (me.kind !== "citizen" || me.identity !== "verified") {
    return (
      <Shell title="Register Land">
        <div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center">
          <ShieldAlert className="mx-auto size-8 text-warn" />
          <p className="mt-2 font-medium">{me.kind !== "citizen" ? "Only citizens can register land." : "Verify your identity first"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{me.kind !== "citizen" ? "Switch to a citizen account in the top-right menu." : "Registering land needs a verified Ghana Card profile."}</p>
          {me.kind === "citizen" && <Button asChild className="mt-4"><Link to="/identity">Complete verification</Link></Button>}
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell title="Register Land">
        <div className="mx-auto max-w-lg rounded-xl border bg-card p-6">
          <CheckCircle2 className="size-8 text-ok" />
          <h2 className="mt-2 text-lg font-semibold">Application {done} submitted</h2>
          <p className="mt-1 text-sm text-muted-foreground">It's now <b>Pending</b>. No title exists yet — it's created only after three sign-offs:</p>
          <ol className="mt-3 space-y-2 text-sm">
            <li>1. <b>Surveyor</b> checks the boundary pillars on site</li>
            <li>2. <b>Lawyer</b> reviews the indenture and search report</li>
            <li>3. <b>Registrar</b> finalises and mints your digital title</li>
          </ol>
          <div className="mt-5 flex gap-2">
            <Button asChild><Link to="/title/$parcelId" params={{ parcelId: done }}>Track progress</Link></Button>
            <Button variant="outline" onClick={() => { setDone(undefined); setPts([]); setPid(""); setDocs([]); }}>Register another</Button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Register Land">
      <div className="grid gap-4 lg:grid-cols-[minmax(340px,400px)_1fr]">
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-semibold">New title application</h2>
            <Pill>TitleRegistry</Pill>
          </div>
          <div className="space-y-3 p-3">
            <div className="rounded-xl border border-ok/40 p-3">
              <div className="flex items-center gap-2 font-medium"><span className="grid size-7 place-items-center rounded-md bg-warn-soft text-warn"><Ruler className="size-4" /></span><span className="flex-1">1 · Boundary</span><span className="text-sm text-ok">{area.toFixed(2)} acres</span></div>
              <p className="mt-2 text-sm text-muted-foreground">Click each corner pillar from your surveyor's site plan on the map. Overlaps with neighbours are checked before submitting.</p>
              {boundaryErr && <p className="mt-2 text-sm text-bad">{boundaryErr}</p>}
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPts([])}><Plus className="size-4" />Redraw boundary</Button>
                {pts.length > 0 && <Button variant="ghost" size="sm" onClick={() => setPts(pts.slice(0, -1))}><Undo2 className="size-4" />Undo</Button>}
              </div>
            </div>
            <div className="space-y-3 rounded-xl border border-ok/40 p-3">
              <div className="flex items-center gap-2 font-medium"><span className="grid size-7 place-items-center rounded-md bg-ok-soft text-ok"><FileText className="size-4" /></span>2 · Parcel details</div>
              <label className="block text-sm text-muted-foreground">Parcel ID (Lands Commission)
                <Input className="mt-1 text-foreground" value={pid} placeholder={nextId} onChange={(e) => setPid(e.target.value.toUpperCase())} /></label>
              <label className="block text-sm text-muted-foreground">Interest
                <Select value={interest} onValueChange={(v) => setInterest(v as Interest)}>
                  <SelectTrigger className="mt-1 text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent>{INTERESTS.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                </Select></label>
              <label className="block text-sm text-muted-foreground">Allodial holder (stool, skin or family)
                <Input className="mt-1 text-foreground" value={holder} onChange={(e) => setHolder(e.target.value)} /></label>
              <label className="block text-sm text-muted-foreground">Region
                <Input className="mt-1 text-foreground" value={region} onChange={(e) => setRegion(e.target.value)} /></label>
              <label className="block text-sm text-muted-foreground">Indenture, site plan, search report
                <Input className="mt-1" type="file" multiple onChange={async (e) => {
                  const files = [...(e.target.files ?? [])];
                  const out: Doc[] = [];
                  for (const f of files) out.push({ type: /site/i.test(f.name) ? "Site plan" : /search/i.test(f.name) ? "Search report" : "Indenture", name: f.name, hash: await sha256Hex(await f.arrayBuffer()) });
                  setDocs(out);
                }} /></label>
              {docs.map((d) => <div key={d.hash} className="text-xs text-muted-foreground">{d.name} · <Mono>{d.hash.slice(0, 22)}…</Mono></div>)}
            </div>
            <Button disabled={pts.length < 3 || !!boundaryErr || !holder.trim()} onClick={async () => {
              const r = await landchain.submitApplication({ parcelId, interest, holder, region, location: `Berekuso, ${region} Region`, pillars: pts, docs });
              if (r.ok) setDone(parcelId);
            }}>Submit application</Button>
            {pts.length < 3 && <p className="text-xs text-muted-foreground">Add at least 3 corner pillars to submit.</p>}
          </div>
        </div>
        <div className="h-[520px] lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
          <ParcelMap parcels={s.parcels.filter((p) => p.status !== "rejected")} draft={pts} onMapClick={(ll) => setPts([...pts, ll])} defaultSatellite showToggle="dropdown"
            overlay={<>
              <MapChip icon={<LocateFixed />} label="Corner pillars" value={pts.length} />
              <MapChip icon={<Ruler />} label="Area" value={`${area.toFixed(2)} acres`} />
              <MapChip icon={<Grid3x3 />} label="Plots (100×70 ft)" value={(area / PLOT_ACRES).toFixed(1)} />
              <MapChip icon={overlap ? <ShieldAlert /> : <ShieldCheck />} label="Overlap check" value={pts.length < 3 ? "—" : overlap ? "Overlaps a neighbour" : "Clear"} />
            </>} />
        </div>
      </div>
    </Shell>
  );
}
