import { Clock, FileText, Ruler, ShieldCheck, User } from "lucide-react";
import { useMe } from "@/lib/landchain/store";
import { fmtDate } from "@/lib/landchain/format";
import type { Parcel } from "@/lib/landchain/types";
import { MapChip, ParcelMap } from "./ParcelMap";
import { TitleHealth } from "./TitleHealth";
import { StatusPill } from "./ui";

export function TitleView({ parcel: p, readOnly, showFullLink }: { parcel: Parcel; readOnly?: boolean | undefined; showFullLink?: boolean | undefined }) {
  const { s } = useMe();
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(340px,400px)_1fr]">
      <div className="rounded-xl border bg-card p-3">
        <div className="mb-3 flex items-center justify-between border-b px-1 pb-3">
          <h2 className="font-semibold">Title Health</h2>
        </div>
        <TitleHealth parcel={p} readOnly={readOnly} showFullLink={showFullLink} />
      </div>
      <div className="h-[460px] lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
        <ParcelMap parcels={s.parcels} focusId={p.id} defaultSatellite showToggle="dropdown"
          label={<><div className="flex items-center gap-2 font-semibold">{p.id} <StatusPill status={p.status} /></div><div className="text-xs text-muted-foreground">{p.acres} ac · {p.interest}</div></>}
          overlay={<>
            <MapChip icon={<Ruler />} label="Size" value={`${p.acres} acres`} />
            <MapChip icon={<FileText />} label="Interest" value={p.interest} />
            <MapChip icon={<ShieldCheck />} label="Status" value={<StatusPill status={p.status} />} />
            <MapChip icon={<User />} label="Owner" value={<span className="font-mono text-xs">{p.owner}</span>} />
            <MapChip icon={<Clock />} label="Last update" value={fmtDate(p.updatedAt)} />
          </>} />
      </div>
    </div>
  );
}
