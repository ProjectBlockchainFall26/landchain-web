import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronRight,
  LandPlot,
  Layers,
  List,
  Map as MapIcon,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import { Shell } from "@/components/lc/Shell";
import { ParcelMap } from "@/components/lc/ParcelMap";
import { Card, Dot, Mono, Pill, StatusPill, Td, Th } from "@/components/lc/ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useMe } from "@/lib/landchain/store";
import { STATUS_TONE } from "@/lib/landchain/format";
import { shownName } from "@/lib/landchain/privacy";
import type { ParcelStatus } from "@/lib/landchain/types";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): { view?: "map" | "list" } =>
    s["view"] === "list" ? { view: "list" } : {},
  head: () => ({
    meta: [
      { title: "Land Register · LandChain Ghana" },
      {
        name: "description",
        content:
          "Find any land parcel on the map or in the list and check its title for free.",
      },
      { property: "og:title", content: "Land Register · LandChain Ghana" },
      {
        property: "og:description",
        content: "Free, read-only public lookup of every LandChain title.",
      },
    ],
  }),
  component: LandRegister,
});

/** One public page to find and check any parcel: the map, or the list of titles. */
function LandRegister() {
  const { view } = Route.useSearch();
  const navigate = Route.useNavigate();
  const toggle = (
    <div
      className="inline-flex rounded-lg border bg-card p-0.5 text-sm shadow-float"
      role="tablist"
      aria-label="View"
    >
      {(
        [
          ["map", "Map", MapIcon],
          ["list", "List", List],
        ] as const
      ).map(([k, label, Icon]) => {
        const on = (view ?? "map") === k;
        return (
          <button
            key={k}
            role="tab"
            aria-selected={on}
            onClick={() =>
              navigate({
                search: k === "list" ? { view: "list" } : {},
                replace: true,
              })
            }
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
  return view === "list" ? (
    <RegisterList toggle={toggle} />
  ) : (
    <LandMap toggle={toggle} />
  );
}

function RegisterList({ toggle }: { toggle: React.ReactNode }) {
  const { s, me } = useMe();
  const [q, setQ] = useState("");
  const t = q.trim().toLowerCase();
  const titles = s.parcels.filter(
    (p) =>
      p.status !== "rejected" &&
      (!t ||
        p.id.toLowerCase().includes(t) ||
        p.owner.toLowerCase().includes(t) ||
        String(p.titleNo ?? "") === t.replace("#", "")),
  );
  return (
    <Shell title="Land Register">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {toggle}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by parcel ID, owner ID or title #"
          className="h-10 min-w-64 flex-1 rounded-lg border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-4 text-ok" />
        Anyone can check a title here, read straight from the blockchain: no
        wallet, no fees.
      </p>
      <Card title="Titles on the register">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <Th>Parcel</Th>
                <Th>Status</Th>
                <Th>Owner</Th>
                <Th>Size</Th>
                <Th>Owners so far</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {titles.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <Td>
                    <div className="font-medium">{p.id}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.titleNo ? `GLT #${p.titleNo}` : "No title yet"}
                    </div>
                  </Td>
                  <Td>
                    <StatusPill status={p.status} />
                  </Td>
                  <Td>
                    {shownName(s, me, p.owner) !== p.owner && (
                      <>{shownName(s, me, p.owner)} </>
                    )}
                    <Mono className="text-muted-foreground">{p.owner}</Mono>
                  </Td>
                  <Td>{p.acres} ac</Td>
                  <Td>{p.owners.length}</Td>
                  <Td className="text-right">
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/title/$parcelId" params={{ parcelId: p.id }}>
                        View record
                      </Link>
                    </Button>
                  </Td>
                </tr>
              ))}
              {titles.length === 0 && (
                <tr>
                  <Td>No parcel matches “{q}”.</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Shell>
  );
}

const FILTERS: { key: ParcelStatus; label: string }[] = [
  { key: "registered", label: "Registered" },
  { key: "transfer_pending", label: "Transfer pending" },
  { key: "pending", label: "Pending" },
];

function LandMap({ toggle }: { toggle: React.ReactNode }) {
  const { s, me } = useMe();
  const [selected, setSelected] = useState<string | undefined>("GA-BRK-0003");
  const [show, setShow] = useState<Set<ParcelStatus>>(
    new Set(FILTERS.map((f) => f.key)),
  );
  const [panel, setPanel] = useState(true);
  const [q, setQ] = useState("");
  const visible = s.parcels.filter(
    (p) => show.has(p.status) && p.status !== "rejected",
  );
  const sel = s.parcels.find((p) => p.id === selected);

  const snap = useMemo(
    () => ({
      titles: s.parcels.filter((p) => p.titleNo).length,
      pending: s.parcels.filter((p) => p.status === "pending").length,
      // From each title's owner history, so it counts every completed transfer whoever is signed in.
      transfers: s.parcels.reduce(
        (n, p) => n + Math.max(0, p.owners.length - 1),
        0,
      ),
      owners: new Set(s.parcels.filter((p) => p.titleNo).map((p) => p.owner))
        .size,
    }),
    [s],
  );

  const search = () => {
    const t = q.trim().toLowerCase();
    const p =
      s.parcels.find(
        (x) =>
          x.id.toLowerCase() === t ||
          x.owner.toLowerCase() === t ||
          String(x.titleNo) === t.replace("#", ""),
      ) ??
      s.parcels.find(
        (x) =>
          x.id.toLowerCase().includes(t) || x.owner.toLowerCase().includes(t),
      );
    if (p) {
      setSelected(p.id);
      setPanel(true);
    } else toast.error("No matching parcel");
  };

  return (
    <Shell title="Land Register" full>
      <div className="relative h-[calc(100vh-6.5rem)] min-h-[560px]">
        <ParcelMap
          parcels={visible}
          selectedId={selected}
          onSelect={(id) => {
            setSelected(id);
            setPanel(true);
          }}
          className="h-full"
        />
        <div className="absolute left-1/2 top-3 z-[500] -translate-x-1/2">
          {toggle}
        </div>
        {!panel && (
          <button
            onClick={() => setPanel(true)}
            className="absolute right-3 top-3 flex items-center gap-1 rounded-lg border bg-card px-3 py-1.5 text-sm shadow-float"
          >
            Show panel
          </button>
        )}
        {panel && (
          <div className="absolute inset-x-2 bottom-2 max-h-[60%] overflow-y-auto sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:max-h-[calc(100%-1.5rem)] sm:w-[300px]">
            <div className="space-y-2.5">
              <div className="flex gap-2">
                <button
                  onClick={() => setPanel(false)}
                  className="grid place-items-center rounded-lg border bg-card px-2 text-[10px] text-muted-foreground shadow-float"
                  aria-label="Hide panel"
                >
                  <ChevronRight className="size-3" />
                  Hide
                </button>
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    search();
                  }}
                >
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Parcel ID, owner ID or token #"
                    className="h-10 min-w-0 flex-1 rounded-lg border bg-card px-3 text-sm shadow-float outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Button type="submit" className="h-10">
                    Go
                  </Button>
                </form>
              </div>
              {me.kind === "public" && (
                <p className="rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground shadow-float">
                  Click any parcel to check its owner and history. Read straight
                  from the blockchain: no wallet, no fees.
                </p>
              )}

              {sel && (
                <div className="rounded-xl border bg-card shadow-float">
                  <div className="flex items-center justify-between border-b px-4 py-3">
                    <span className="flex items-center gap-2 font-semibold">
                      <LandPlot className="size-4" />
                      {sel.id}
                    </span>
                    <button
                      onClick={() => setSelected(undefined)}
                      aria-label="Close"
                    >
                      <X className="size-4 text-primary" />
                    </button>
                  </div>
                  <div className="space-y-3 p-4">
                    <div>
                      <div className="text-2xl font-semibold">
                        {sel.titleNo ? `GLT #${sel.titleNo}` : "Pending title"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {sel.acres} acres
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusPill status={sel.status} />
                      <Pill>{sel.interest}</Pill>
                    </div>
                    <dl className="space-y-2 pt-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Owner</dt>
                        <dd>
                          {shownName(s, me, sel.owner) === sel.owner ? (
                            <Mono>{sel.owner}</Mono>
                          ) : (
                            shownName(s, me, sel.owner)
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">
                          Allodial holder
                        </dt>
                        <dd>{sel.holder}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Location</dt>
                        <dd>Berekuso, {sel.region}</dd>
                      </div>
                    </dl>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button variant="outline" asChild>
                        <Link
                          to="/title/$parcelId"
                          params={{ parcelId: sel.id }}
                        >
                          Open title record
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-xl border bg-card shadow-float">
                <div className="flex items-center gap-2 border-b px-4 py-3 font-semibold">
                  <Layers className="size-4" />
                  Show on map
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 p-4 text-sm">
                  {FILTERS.map((f) => (
                    <label key={f.key} className="flex items-center gap-2">
                      <Checkbox
                        checked={show.has(f.key)}
                        onCheckedChange={(c) => {
                          const n = new Set(show);
                          if (c) n.add(f.key);
                          else n.delete(f.key);
                          setShow(n);
                        }}
                      />
                      <Dot tone={STATUS_TONE[f.key]} />
                      {f.label}{" "}
                      <span className="text-muted-foreground">
                        {s.parcels.filter((p) => p.status === f.key).length}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border bg-card shadow-float">
                <div className="flex items-center gap-2 border-b px-4 py-3 font-semibold">
                  <ShieldCheck className="size-4" />
                  Register snapshot
                </div>
                <dl className="divide-y text-sm">
                  {[
                    ["Registered titles", snap.titles],
                    ["Applications pending", snap.pending],
                    ["Completed transfers", snap.transfers],
                    ["Title holders", snap.owners],
                  ].map(([k, v]) => (
                    <div
                      key={k as string}
                      className="flex justify-between px-4 py-2.5"
                    >
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="p-3">
                  <Button asChild className="w-full">
                    <Link to="/register">
                      <Plus className="size-4" />
                      Register a parcel
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
