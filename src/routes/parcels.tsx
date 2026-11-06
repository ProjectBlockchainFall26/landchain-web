import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { Shell } from "@/components/lc/Shell";
import { TitleView } from "@/components/lc/TitleView";
import { Dot, Mono } from "@/components/lc/ui";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/landchain/store";
import { STATUS_TONE } from "@/lib/landchain/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/parcels")({
  head: () => ({
    meta: [
      { title: "My Parcels · LandChain Ghana" },
      { name: "description", content: "See the health of your land titles, list parcels for sale and track escrow." },
      { property: "og:title", content: "My Parcels · LandChain Ghana" },
      { property: "og:description", content: "Your land titles, their verification, sales and ownership history." },
    ],
  }),
  component: MyParcels,
});

function MyParcels() {
  const { s, me } = useMe();
  const mine = s.parcels.filter((p) => p.owner === me.id);
  const [sel, setSel] = useState<string>();
  const p = (mine.find((x) => x.id === sel) ?? mine[0])!;

  if (me.kind !== "citizen") {
    return (
      <Shell title="My Parcels">
        <div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center">
          <p className="font-medium">{me.kind === "public" ? "Public visitors don't own parcels." : "Lands Commission accounts don't hold parcels."}</p>
          <p className="mt-1 text-sm text-muted-foreground">Switch to a citizen in the account menu, or look up any title.</p>
          <Button asChild className="mt-4"><Link to="/verify">Verify a title</Link></Button>
        </div>
      </Shell>
    );
  }
  const total = mine.reduce((a, x) => a + x.acres, 0);
  return (
    <Shell title="My Parcels">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold">{me.name}</span>
        <Mono className="text-muted-foreground">{me.id}</Mono>
        <span className="flex items-center gap-1 text-muted-foreground"><MapPin className="size-3.5" />Berekuso, Eastern Region</span>
        <span className="text-muted-foreground">{mine.length} parcels · {total.toFixed(1)} acres</span>
      </div>
      {mine.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-center">
          <p className="font-medium">You don't own any parcels yet.</p>
          <Button asChild className="mt-4"><Link to="/register">Register land</Link></Button>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {mine.map((x) => (
              <button key={x.id} onClick={() => setSel(x.id)} className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm", x.id === p.id ? "border-primary bg-accent font-medium text-accent-foreground" : "bg-card")}>
                <Dot tone={x.status === "for_sale" ? "ok" : STATUS_TONE[x.status]} />{x.id}
              </button>
            ))}
          </div>
          <TitleView parcel={p} showFullLink />
        </>
      )}
    </Shell>
  );
}
