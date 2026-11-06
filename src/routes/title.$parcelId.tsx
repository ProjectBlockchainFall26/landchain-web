import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft, KeyRound, MapPin, User } from "lucide-react";
import { Shell } from "@/components/lc/Shell";
import { TitleView } from "@/components/lc/TitleView";
import { useMe } from "@/lib/landchain/store";
import { getParcel } from "@/lib/landchain/engine";

export const Route = createFileRoute("/title/$parcelId")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.parcelId} · Title Record · LandChain Ghana` },
      { name: "description", content: `Ownership, verification and history for land parcel ${params.parcelId}.` },
      { property: "og:title", content: `${params.parcelId} · LandChain title record` },
      { property: "og:description", content: `Check who owns ${params.parcelId} and whether the title is clean.` },
    ],
  }),
  component: TitleRecord,
});

function TitleRecord() {
  const { parcelId } = Route.useParams();
  const { s, me } = useMe();
  const router = useRouter();
  const p = getParcel(s, parcelId);
  return (
    <Shell title={parcelId}>
      {!p ? (
        <div className="rounded-xl border bg-card p-6 text-center">
          <p className="font-medium">No parcel called {parcelId}.</p>
          <Link to="/verify" className="mt-2 inline-block text-sm text-primary">Search titles</Link>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
            <button onClick={() => router.history.back()} className="flex items-center gap-1 font-medium text-primary"><ChevronLeft className="size-4" />Back</button>
            <span className="font-semibold text-foreground">{p.id}</span>
            <span className="flex items-center gap-1"><MapPin className="size-3.5" />{p.location}</span>
            {p.titleNo && <span className="flex items-center gap-1"><KeyRound className="size-3.5" />GLT #{p.titleNo}</span>}
            <span className="flex items-center gap-1"><User className="size-3.5" />{p.holder}</span>
          </div>
          {me.kind === "public" && <p className="mb-3 rounded-lg bg-info-soft px-3 py-2 text-sm text-info">Read-only public record. No wallet or fees needed.</p>}
          <TitleView parcel={p} readOnly={me.kind === "public"} />
        </>
      )}
    </Shell>
  );
}
