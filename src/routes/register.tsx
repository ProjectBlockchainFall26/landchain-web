import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  FileText,
  Grid3x3,
  LocateFixed,
  Plus,
  Ruler,
  ShieldAlert,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { Shell } from "@/components/lc/Shell";
import { MapChip, ParcelMap } from "@/components/lc/ParcelMap";
import { Mono, Pill } from "@/components/lc/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { landchain, sha256Hex, useMe } from "@/lib/landchain/store";
import { validateBoundary } from "@/lib/landchain/engine";
import {
  areaAcres,
  parsePillars,
  SAMPLE_PILLARS_CSV,
  type LatLng,
} from "@/lib/landchain/geo";
import type { Interest } from "@/lib/landchain/types";
import { putFile } from "@/lib/landchain/vault";
import { API_MODE } from "@/lib/landchain/api/config";
import { uploadDocument } from "@/lib/landchain/api/actions";
import { errorMessage } from "@/lib/landchain/api/http";
import { apiWrites } from "@/lib/landchain/store";
import { toast } from "sonner";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register Land · LandChain Ghana" },
      {
        name: "description",
        content:
          "Upload your surveyor's coordinates and documents and apply for a digital land title.",
      },
      { property: "og:title", content: "Register Land · LandChain Ghana" },
      {
        property: "og:description",
        content:
          "Apply for a LandChain title: upload the surveyor's coordinates and documents, get it registered on the blockchain.",
      },
    ],
  }),
  component: Register,
});

const INTERESTS: Interest[] = [
  "Allodial",
  "Customary freehold",
  "Common-law freehold",
  "Leasehold",
];

/** What the Lands Commission asks for (Ministry of Lands FAQ; Lands Commission service charter). */
const DOC_TYPES = [
  {
    type: "Site plan",
    note: "Prepared by a licensed surveyor, approved by Survey & Mapping",
    required: true,
  },
  {
    type: "Indenture",
    note: "Proof of ownership: indenture, family declaration or deed of gift",
    required: true,
  },
  {
    type: "Search report",
    note: "Official search from the Lands Commission",
    required: true,
  },
  {
    type: "Consent / concurrence",
    note: "Only for stool or family land",
    required: false,
  },
] as const;
interface PickedDoc {
  type: string;
  name: string;
  hash: string;
  file: File;
}
const GPS_RE = /^[A-Z]{2}-\d{3,4}-\d{4}$/;
const PLOT_ACRES = (100 * 70 * 0.092903) / 4046.8564;

function Register() {
  const { s, me } = useMe();
  const nextId = useMemo(() => {
    let n = 15;
    while (
      s.parcels.some((p) => p.id === `GA-BRK-${String(n).padStart(4, "0")}`)
    )
      n++;
    return `GA-BRK-${String(n).padStart(4, "0")}`;
  }, [s.parcels]);
  const [pts, setPts] = useState<LatLng[]>([]);
  const [pillarFile, setPillarFile] = useState<string>();
  const [pid, setPid] = useState("");
  const [interest, setInterest] = useState<Interest>("Leasehold");
  const [holder, setHolder] = useState("Berekuso Stool");
  const [region, setRegion] = useState("Eastern");
  const [docs, setDocs] = useState<PickedDoc[]>([]);
  const [plan, setPlan] = useState("");
  const [gps, setGps] = useState("");
  const [done, setDone] = useState<string>();
  const [busy, setBusy] = useState(false);

  const area = areaAcres(pts);
  const boundaryErr = pts.length >= 3 ? validateBoundary(s, pts) : null;
  const overlap = boundaryErr?.startsWith("Boundary overlaps");
  const parcelId = pid || nextId;
  const missingDocs = DOC_TYPES.filter(
    (t) => t.required && !docs.some((d) => d.type === t.type),
  );

  if (me.kind !== "citizen" || me.identity !== "verified") {
    return (
      <Shell title="Register Land">
        <div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center">
          <ShieldAlert className="mx-auto size-8 text-warn" />
          <p className="mt-2 font-medium">
            {me.kind !== "citizen"
              ? "Only citizens can register land."
              : "Verify your identity first"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {me.kind !== "citizen"
              ? "Switch to a citizen account in the top-right menu."
              : "Registering land needs a verified Ghana Card profile."}
          </p>
          {me.kind === "citizen" && (
            <Button asChild className="mt-4">
              <Link to="/identity">Complete verification</Link>
            </Button>
          )}
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell title="Register Land">
        <div className="mx-auto max-w-lg rounded-xl border bg-card p-6">
          <CheckCircle2 className="size-8 text-ok" />
          <h2 className="mt-2 text-lg font-semibold">
            Application {done} submitted
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            It's on the blockchain as <b>Pending</b>. No title exists yet:
          </p>
          <ol className="mt-3 space-y-2 text-sm">
            <li>
              1. The <b>Lands Commission registrar</b> checks your boundary and
              documents
            </li>
            <li>
              2. The registrar records your <b>stamp duty</b> and{" "}
              <b>registration fee</b> receipts. The contract won't approve
              without them
            </li>
            <li>
              3. On approval, the contract <b>mints your title as an NFT</b> to
              your wallet
            </li>
            <li>
              4. From then on the record is locked: no one can edit it or move
              it without your request and the registrar's approval
            </li>
          </ol>
          <div className="mt-5 flex gap-2">
            <Button asChild>
              <Link to="/title/$parcelId" params={{ parcelId: done }}>
                Track progress
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDone(undefined);
                setPts([]);
                setPid("");
                setDocs([]);
                setPlan("");
                setGps("");
              }}
            >
              Register another
            </Button>
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
              <div className="flex items-center gap-2 font-medium">
                <span className="grid size-7 place-items-center rounded-md bg-warn-soft text-warn">
                  <Ruler className="size-4" />
                </span>
                <span className="flex-1">1 · Boundary</span>
                <span className="text-sm text-ok">{area.toFixed(2)} acres</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Upload the corner-pillar coordinates from your surveyor (one
                pillar per line: latitude, longitude). The boundary appears on
                the map and is checked against your neighbours.
              </p>
              <Input
                className="mt-2"
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                aria-label="Surveyor's coordinates file"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    setPts(parsePillars(await f.text()));
                    setPillarFile(f.name);
                  } catch (err) {
                    setPts([]);
                    setPillarFile(undefined);
                    toast.error(
                      err instanceof Error
                        ? err.message
                        : "Couldn't read that file",
                    );
                  }
                }}
              />
              {pillarFile && pts.length > 0 && (
                <p className="mt-2 text-sm text-ok">
                  {pts.length} corner pillars read from {pillarFile}
                </p>
              )}
              {boundaryErr && (
                <p className="mt-2 text-sm text-bad">{boundaryErr}</p>
              )}
              <a
                className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_PILLARS_CSV)}`}
                download="sample-pillars.csv"
              >
                Download a sample coordinates file (demo)
              </a>
            </div>
            <div className="space-y-3 rounded-xl border border-ok/40 p-3">
              <div className="flex items-center gap-2 font-medium">
                <span className="grid size-7 place-items-center rounded-md bg-ok-soft text-ok">
                  <FileText className="size-4" />
                </span>
                2 · Parcel details
              </div>
              <label className="block text-sm text-muted-foreground">
                Parcel ID (Lands Commission)
                <Input
                  className="mt-1 text-foreground"
                  value={pid}
                  placeholder={nextId}
                  onChange={(e) => setPid(e.target.value.toUpperCase())}
                />
              </label>
              <label className="block text-sm text-muted-foreground">
                Interest
                <Select
                  value={interest}
                  onValueChange={(v) => setInterest(v as Interest)}
                >
                  <SelectTrigger className="mt-1 text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERESTS.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="block text-sm text-muted-foreground">
                Allodial holder (stool, skin or family)
                <Input
                  className="mt-1 text-foreground"
                  value={holder}
                  onChange={(e) => setHolder(e.target.value)}
                />
              </label>
              <label className="block text-sm text-muted-foreground">
                Region
                <Input
                  className="mt-1 text-foreground"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                />
              </label>
              <label className="block text-sm text-muted-foreground">
                Regional / plan number (from the site plan)
                <Input
                  className="mt-1 text-foreground"
                  value={plan}
                  placeholder="SER B4115/26"
                  onChange={(e) => setPlan(e.target.value.toUpperCase())}
                />
              </label>
              <label className="block text-sm text-muted-foreground">
                GhanaPostGPS address (optional)
                <Input
                  className="mt-1 text-foreground"
                  value={gps}
                  placeholder="EA-1805-5795"
                  onChange={(e) => setGps(e.target.value.toUpperCase())}
                />
                {gps && !GPS_RE.test(gps) && (
                  <span className="text-xs text-bad">
                    Format: two letters, then numbers, e.g. EA-1805-5795
                  </span>
                )}
              </label>
            </div>
            <div className="space-y-3 rounded-xl border border-ok/40 p-3">
              <div className="flex items-center gap-2 font-medium">
                <span className="grid size-7 place-items-center rounded-md bg-ok-soft text-ok">
                  <FileText className="size-4" />
                </span>
                3 · Documents
              </div>
              <p className="text-xs text-muted-foreground">
                Only each file's SHA-256 <b>fingerprint</b> goes on the
                blockchain, which anyone can read. The files stay with the Lands
                Commission and only officers and you can open them.
              </p>
              {DOC_TYPES.map((t) => {
                const picked = docs.find((d) => d.type === t.type);
                return (
                  <label
                    key={t.type}
                    className="block rounded-lg border p-2 text-sm"
                  >
                    <span className="flex items-center justify-between">
                      <span className="font-medium">
                        {t.type}
                        {t.required && <span className="text-bad"> *</span>}
                      </span>
                      {picked && <CheckCircle2 className="size-4 text-ok" />}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t.note}
                    </span>
                    <Input
                      className="mt-1"
                      type="file"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        const rest = docs.filter((d) => d.type !== t.type);
                        if (!f) {
                          setDocs(rest);
                          return;
                        }
                        setDocs([
                          ...rest,
                          {
                            type: t.type,
                            name: f.name,
                            file: f,
                            hash: await sha256Hex(await f.arrayBuffer()),
                          },
                        ]);
                      }}
                    />
                    {picked && (
                      <Mono className="mt-1 block text-xs text-muted-foreground">
                        {picked.hash.slice(0, 26)}…
                      </Mono>
                    )}
                  </label>
                );
              })}
            </div>
            <Button
              disabled={
                busy ||
                pts.length < 3 ||
                !!boundaryErr ||
                !holder.trim() ||
                !plan.trim() ||
                (!!gps && !GPS_RE.test(gps)) ||
                missingDocs.length > 0
              }
              onClick={async () => {
                const input = {
                  parcelId,
                  interest,
                  holder,
                  region,
                  location: `Berekuso, ${region} Region`,
                  planNumber: plan,
                  gpsAddress: gps,
                  pillars: pts,
                  docs: docs.map(({ type, hash }) => ({ type, hash })),
                };
                if (API_MODE) {
                  // Backend mode: the files go to the Lands Commission's vault first; the application refers to them.
                  setBusy(true);
                  try {
                    const ids: string[] = [];
                    for (const d of docs)
                      ids.push(
                        (await uploadDocument(d.file, d.type, d.hash)).id,
                      );
                    const r = await apiWrites.submitApplicationWithDocs(
                      input,
                      ids,
                    );
                    if (r.ok) setDone(parcelId);
                  } catch (e) {
                    toast.error("Couldn't upload the documents", {
                      description: errorMessage(e),
                    });
                  } finally {
                    setBusy(false);
                  }
                  return;
                }
                const r = await landchain.submitApplication(input);
                if (!r.ok) return;
                // The files go to the Lands Commission's vault (off chain), keyed by their fingerprint.
                for (const d of docs)
                  await putFile({
                    hash: d.hash,
                    name: d.name,
                    type: d.type,
                    mime: d.file.type,
                    size: d.file.size,
                    data: d.file,
                    parcelId,
                  });
                setDone(parcelId);
              }}
            >
              {busy ? "Uploading and submitting…" : "Submit application"}
            </Button>
            {missingDocs.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Still needed: {missingDocs.map((d) => d.type).join(", ")}.
              </p>
            )}
            {pts.length < 3 && (
              <p className="text-xs text-muted-foreground">
                Add at least 3 corner pillars to submit.
              </p>
            )}
          </div>
        </div>
        <div className="h-[520px] lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
          <ParcelMap
            parcels={s.parcels.filter((p) => p.status !== "rejected")}
            draft={pts}
            defaultSatellite
            showToggle="dropdown"
            overlay={
              <>
                <MapChip
                  icon={<LocateFixed />}
                  label="Corner pillars"
                  value={pts.length}
                />
                <MapChip
                  icon={<Ruler />}
                  label="Area"
                  value={`${area.toFixed(2)} acres`}
                />
                <MapChip
                  icon={<Grid3x3 />}
                  label="Plots (100×70 ft)"
                  value={(area / PLOT_ACRES).toFixed(1)}
                />
                <MapChip
                  icon={overlap ? <ShieldAlert /> : <ShieldCheck />}
                  label="Overlap check"
                  value={
                    pts.length < 3
                      ? "—"
                      : overlap
                        ? "Overlaps a neighbour"
                        : "Clear"
                  }
                />
              </>
            }
          />
        </div>
      </div>
    </Shell>
  );
}
