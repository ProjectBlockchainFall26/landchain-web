import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRightLeft, CheckCircle2, Clock, FileText, History, MapPin, ShieldCheck, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { landchain, useMe } from "@/lib/landchain/store";
import { account, applicationFor, getHistory, openTransfer } from "@/lib/landchain/engine";
import { blockNo, fmtDate, shortHash } from "@/lib/landchain/format";
import { toDMS } from "@/lib/landchain/geo";
import type { Parcel } from "@/lib/landchain/types";
import { Mono, Pill, Row, Section } from "./ui";

const BANNER = {
  registered: { tone: "ok", text: "Registered on the blockchain", sub: "Record locked" },
  transfer_pending: { tone: "info", text: "Transfer waiting for the registrar", sub: "Owner unchanged until approved" },
  pending: { tone: "warn", text: "Application under review", sub: "No title yet" },
  rejected: { tone: "bad", text: "Application rejected", sub: "No title issued" },
} as const;
const BANNER_CLS = { ok: "bg-ok-soft text-ok", info: "bg-info-soft text-info", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad" };

export function TitleHealth({ parcel: p, readOnly, showFullLink }: { parcel: Parcel; readOnly?: boolean | undefined; showFullLink?: boolean | undefined }) {
  const { s, me } = useMe();
  const app = applicationFor(s, p.id);
  const trf = openTransfer(s, p.id);
  const history = getHistory(s, p.id);
  const isOwner = me.id === p.owner && !readOnly;
  const isRegistrar = me.roles.includes("Registrar") && !readOnly;
  const [transferOpen, setTransferOpen] = useState(false);
  const name = (id?: string) => (id ? account(s, id)?.name ?? id : "—");
  const b = BANNER[p.status];

  return (
    <div className="space-y-2.5">
      <div className={`flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium ${BANNER_CLS[b.tone]}`}>
        {p.status === "registered" ? <CheckCircle2 className="size-4" /> : <Clock className="size-4" />}
        <span className="flex-1">{b.text}</span>
        <span className="font-normal">{b.sub}</span>
      </div>

      <Section icon={<ShieldCheck />} title="Registration" summary={p.titleNo ? `GLT #${p.titleNo}` : app?.decision === "rejected" ? "Rejected" : "In review"}
        summaryTone={p.titleNo ? "ok" : app?.decision === "rejected" ? "bad" : "warn"} defaultOpen={!p.titleNo}>
        <Row icon={<User />} label="Owner identity"><Pill tone={account(s, app?.applicant ?? p.owner)?.identity === "verified" ? "ok" : "warn"}>Ghana Card verified</Pill></Row>
        <Row icon={<ShieldCheck />} label={<>Registrar approval {app?.by && <span className="text-muted-foreground">· {name(app.by)}</span>}</>}>
          <Pill tone={app?.decision === "approved" ? "ok" : app?.decision === "rejected" ? "bad" : "warn"}>{app?.decision === "approved" ? "Approved" : app?.decision === "rejected" ? "Rejected" : "Waiting"}</Pill>
        </Row>
        {app?.reason && <p className="px-1 text-xs text-bad">Reason: {app.reason}</p>}
        {p.registeredAt && <Row icon={<Clock />} label="Registered on">{fmtDate(p.registeredAt)}</Row>}
        {p.docs.map((d) => (
          <div key={d.hash} className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
            <span>{d.type}: {d.name}</span><Mono>{d.hash.slice(0, 18)}…</Mono>
          </div>
        ))}
        {isRegistrar && app?.decision === "waiting" && (
          <Button asChild variant="outline" size="sm"><Link to="/review">Open in Review Queue</Link></Button>
        )}
      </Section>

      <Section icon={<Users />} title="Ownership" summary={trf ? "Transfer pending" : `${p.owners.length || 0} owner${p.owners.length === 1 ? "" : "s"}`}
        summaryTone={trf ? "info" : "neutral"} defaultOpen highlight>
        <Row icon={<User />} label="Current owner"><span>{name(p.owner)} <Mono className="text-muted-foreground">{p.owner}</Mono></span></Row>
        {p.owners.length > 0 && (
          <ol className="space-y-1 px-1 text-xs">
            {p.owners.map((o, i) => (
              <li key={i} className="flex justify-between"><span className="text-muted-foreground">{i === 0 ? "First registered owner" : `Owner ${i + 1}`}</span><span>{name(o)} <Mono className="text-muted-foreground">{o}</Mono></span></li>
            ))}
          </ol>
        )}
        {trf ? (
          <div className="space-y-2 rounded-lg bg-info-soft p-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-info">Transfer requested · {fmtDate(trf.requestedAt)}</div>
            <p>{name(trf.from)} → <b>{name(trf.to)}</b>. Nothing moves until the Lands Commission registrar approves.</p>
            <div className="flex flex-wrap gap-2">
              {isRegistrar && <>
                <Button size="sm" onClick={() => landchain.approveTransfer(trf.id)}>Approve transfer</Button>
                <Button size="sm" variant="outline" asChild><Link to="/review">Reject in Review Queue</Link></Button>
              </>}
              {isOwner && <Button size="sm" variant="outline" onClick={() => landchain.cancelTransfer(trf.id)}>Cancel request</Button>}
            </div>
          </div>
        ) : p.status === "registered" ? (
          <>
            <p className="px-1 text-sm text-muted-foreground">Ownership changes only when the owner asks <i>and</i> the registrar approves. Neither can do it alone.</p>
            {isOwner && <Button onClick={() => setTransferOpen(true)}><ArrowRightLeft className="size-4" />Transfer ownership</Button>}
          </>
        ) : <p className="px-1 text-sm text-muted-foreground">A title can be transferred once it's registered.</p>}
      </Section>

      <Section icon={<History />} title="On-chain history" summary={`${history.length} event${history.length === 1 ? "" : "s"}`} defaultOpen>
        {history.length === 0 && <p className="px-1 text-sm text-muted-foreground">No events yet.</p>}
        <ol className="space-y-3 px-1">
          {history.map((h, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${h.type === "Rejected" || h.type === "Transfer rejected" ? "bg-bad" : "bg-ok"}`} />
              <div>
                <div className="font-medium">{h.type}</div>
                <div>{h.text.split(/(GH-[0-9a-f]{8})/).map((t, j) => /^GH-/.test(t) ? <Mono key={j}>{t}</Mono> : t)}</div>
                <div className="text-xs text-muted-foreground">{fmtDate(h.at)} · block {blockNo(h.block)}{h.tx && <> · tx <Mono>{shortHash(h.tx)}</Mono></>}</div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section icon={<MapPin />} title="GPS Boundary" summary={`${p.pillars.length} pillars`}>
        {p.pillars.map(([lat, lng], i) => (
          <div key={i} className="flex justify-between rounded-lg border px-3 py-2 text-xs">
            <span className="text-muted-foreground">Pillar {i + 1}</span>
            <Mono>{toDMS(lat, "N", "S")}  {toDMS(lng, "E", "W")}</Mono>
          </div>
        ))}
      </Section>

      <Section icon={<FileText />} title="Smart contract" summary={`Record #${p.recordId}`}>
        <p className="px-1 text-xs text-muted-foreground">Stored in <Mono>TitleRegistry</Mono> as record #{p.recordId}{p.titleNo ? <>, ERC-721 token #{p.titleNo}</> : null}. Read with <Mono>getParcel({p.recordId})</Mono> and <Mono>ownerHistory({p.recordId})</Mono>.</p>
      </Section>

      {showFullLink && <Link to="/title/$parcelId" params={{ parcelId: p.id }} className="block px-1 text-sm font-medium text-primary hover:underline">See full record →</Link>}

      <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} parcel={p} />
    </div>
  );
}

function TransferDialog({ open, onOpenChange, parcel }: { open: boolean; onOpenChange: (o: boolean) => void; parcel: Parcel }) {
  const { s, me } = useMe();
  const [to, setTo] = useState("");
  const people = s.accounts.filter((a) => a.kind === "citizen" && a.id !== me.id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer {parcel.id}</DialogTitle>
          <DialogDescription>For a sale or gift already agreed off the platform. The registrar checks the indenture and approves.</DialogDescription>
        </DialogHeader>
        <label className="text-sm">New owner (must have a verified Ghana Card)</label>
        <Select value={to} onValueChange={setTo}>
          <SelectTrigger><SelectValue placeholder="Choose a person" /></SelectTrigger>
          <SelectContent>{people.map((a) => (
            <SelectItem key={a.id} value={a.id}>{a.name} · {a.id}{a.identity !== "verified" ? " (not verified)" : ""}</SelectItem>
          ))}</SelectContent>
        </Select>
        <ol className="space-y-1 rounded-lg bg-muted p-3 text-sm">
          <li>1. You send <Mono>requestTransfer</Mono>. The title is marked "transfer pending".</li>
          <li>2. The registrar sends <Mono>approveTransfer</Mono>. The NFT moves to the new owner.</li>
        </ol>
        <DialogFooter>
          <Button disabled={!to} onClick={async () => { const r = await landchain.requestTransfer(parcel.id, to); if (r.ok) onOpenChange(false); }}>Request transfer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
