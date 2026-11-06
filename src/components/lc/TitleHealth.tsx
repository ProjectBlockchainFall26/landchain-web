import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle, CheckCircle2, CircleDollarSign, FileText, Gavel, History, MapPin, Ruler, ShieldCheck, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { landchain, useMe, sha256Hex } from "@/lib/landchain/store";
import { account, getHistory, issuesFor, wallet } from "@/lib/landchain/engine";
import { blockNo, cedi, cediShort, fmtDate } from "@/lib/landchain/format";
import { toDMS } from "@/lib/landchain/geo";
import type { Parcel, Step } from "@/lib/landchain/types";
import { Mono, Pill, Row, Section } from "./ui";

function StepPill({ step }: { step?: Step | undefined }) {
  if (!step || step.status === "approved") return <Pill tone="ok">Approved</Pill>;
  if (step.status === "rejected") return <Pill tone="bad">Rejected</Pill>;
  return <Pill tone="warn">Waiting</Pill>;
}

export function TitleHealth({ parcel: p, readOnly, showFullLink }: { parcel: Parcel; readOnly?: boolean | undefined; showFullLink?: boolean | undefined }) {
  const { s, me } = useMe();
  const issues = issuesFor(s, p.id);
  const app = s.applications.find((a) => a.parcelId === p.id);
  const sale = s.sales.find((x) => x.parcelId === p.id && (x.status === "awaiting" || x.status === "disputed"));
  const dispute = sale && s.disputes.find((d) => d.saleId === sale.id && !d.outcome);
  const history = getHistory(s, p.id);
  const owner = account(s, p.owner);
  const isOwner = me.id === p.owner && !readOnly;
  const isRegistrar = me.roles.includes("Registrar") && !readOnly;
  const isParty = sale && (sale.buyer === me.id || sale.seller === me.id) && !readOnly;
  const [listOpen, setListOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const name = (id?: string) => (id ? account(s, id)?.name ?? id : "—");

  const verSummary = p.status === "pending" ? "In review" : p.status === "rejected" ? "Rejected" : "Verified";
  const saleSummary = p.status === "in_escrow" ? (dispute ? "Disputed" : "In escrow") : p.status === "for_sale" ? `Listed · ${cediShort(p.price!)}` : "Not listed";

  return (
    <div className="space-y-2.5">
      <div className={issues.length ? "flex items-center gap-2 rounded-lg bg-bad-soft px-3 py-3 text-sm font-medium text-bad" : "flex items-center gap-2 rounded-lg bg-ok-soft px-3 py-3 text-sm font-medium text-ok"}>
        {issues.length ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
        <span className="flex-1">{issues.length ? "Needs attention" : "Title in good standing"}</span>
        <span className="font-normal">{issues.length ? `${issues.length} issue${issues.length > 1 ? "s" : ""} detected` : "No issues"}</span>
      </div>
      {issues.length > 0 && <ul className="px-1 text-xs text-muted-foreground">{issues.map((i) => <li key={i}>• {i}</li>)}</ul>}

      <Section icon={<ShieldCheck />} title="Verification" summary={verSummary} summaryTone={verSummary === "Verified" ? "ok" : verSummary === "Rejected" ? "bad" : "warn"} defaultOpen={p.status === "pending"}>
        <Row icon={<User />} label="Applicant identity"><Pill tone={owner?.identity === "verified" ? "ok" : "warn"}>{owner?.identity === "verified" ? "Verified" : "Pending"}</Pill></Row>
        <Row icon={<Ruler />} label={<>Survey sign-off <span className="text-muted-foreground">· {name(app?.survey.by ?? "LC-surveyor")}</span></>}><StepPill step={app?.survey} /></Row>
        <Row icon={<FileText />} label={<>Legal sign-off <span className="text-muted-foreground">· {name(app?.legal.by ?? "LC-lawyer")}</span></>}><StepPill step={app?.legal} /></Row>
        <Row icon={<ShieldCheck />} label={<>Registrar approval {p.titleNo && <span className="text-muted-foreground">· GLT #{p.titleNo}</span>}</>}><StepPill step={app?.registrar} /></Row>
        {p.docs.map((d) => (
          <div key={d.hash} className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
            <span>{d.type}: {d.name}</span><Mono>{d.hash.slice(0, 18)}…</Mono>
          </div>
        ))}
      </Section>

      <Section icon={<CircleDollarSign />} title="Sale & Escrow" summary={saleSummary} summaryTone={p.status === "in_escrow" ? "warn" : p.status === "for_sale" ? "ok" : "neutral"} defaultOpen={p.status === "in_escrow" || p.status === "for_sale"} highlight>
        {sale ? (
          <>
            <Row icon={<CircleDollarSign />} label={<span className="flex items-center gap-2">Held in escrow <Pill tone="warn">{dispute ? "Disputed · awaiting judge" : "Awaiting registrar"}</Pill></span>}>{cedi(sale.amount)}</Row>
            <Row icon={<User />} label="Buyer"><Mono>{sale.buyer}</Mono></Row>
            <Row icon={<User />} label="Seller"><Mono>{sale.seller}</Mono></Row>
            <div className="rounded-lg bg-ok-soft p-3 text-sm">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ok">What happens next</div>
              {dispute
                ? <p>A judge will review the dispute ("{dispute.reason}"). Ruling for the seller completes the sale; ruling for the buyer refunds them in full.</p>
                : <p>When the registrar approves, the title moves to the buyer and the escrowed money moves to the seller in the same transaction. If the registrar rejects, the buyer is refunded in full.</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {isRegistrar && sale.status === "awaiting" && <>
                <Button onClick={() => landchain.approveSale(sale.id)}>Approve sale</Button>
                <Button variant="outline" className="border-bad/40 text-bad hover:bg-bad-soft hover:text-bad" onClick={() => landchain.rejectSale(sale.id)}>Reject & refund</Button>
              </>}
              {isParty && sale.status === "awaiting" && <Button variant="outline" onClick={() => setDisputeOpen(true)}>Raise dispute</Button>}
            </div>
          </>
        ) : p.status === "for_sale" ? (
          <>
            <Row icon={<CircleDollarSign />} label="Asking price">{cedi(p.price!)} <span className="text-xs">· {cedi(p.price! / p.acres)}/acre</span></Row>
            {p.listedAt && <p className="px-1 text-xs text-muted-foreground">Listed {fmtDate(p.listedAt)}</p>}
            {isOwner && <Button variant="outline" onClick={() => landchain.cancelListing(p.id)}>Cancel listing</Button>}
            {!readOnly && !isOwner && me.kind === "citizen" && <Button onClick={() => setBuyOpen(true)}>Buy for {cediShort(p.price!)}</Button>}
          </>
        ) : (
          <>
            <p className="px-1 text-sm text-muted-foreground">
              {p.status === "pending" ? "This parcel can't be sold until its title is issued." : p.status === "frozen" ? "Frozen titles can't be sold." : p.status === "rejected" ? "Rejected applications can't be sold." : "Not listed for sale."}
            </p>
            {isOwner && (p.status === "verified" || p.status === "sold") && <Button onClick={() => setListOpen(true)}>List for sale</Button>}
          </>
        )}
      </Section>

      <Section icon={<FileText />} title="Lease & Ground Rent" summary="No leases" />
      <Section icon={<Gavel />} title="Succession & Court" summary={p.status === "frozen" ? "Court order" : "None"} summaryTone={p.status === "frozen" ? "info" : "neutral"} />

      <Section icon={<History />} title="Ownership History" summary={`${history.length} record${history.length === 1 ? "" : "s"}`} defaultOpen>
        {history.length === 0 && <p className="px-1 text-sm text-muted-foreground">No records yet — the title hasn't been minted.</p>}
        <ol className="space-y-3 px-1">
          {history.map((h, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-ok" />
              <div>
                <div className="font-medium">{h.type}</div>
                <div>{h.text.split(/(GH-[0-9a-f]{8})/).map((t, j) => /^GH-/.test(t) ? <Mono key={j}>{t}</Mono> : t)}</div>
                <div className="text-xs text-muted-foreground">{fmtDate(h.at)} · block {blockNo(h.block)}</div>
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

      {showFullLink && <Link to="/title/$parcelId" params={{ parcelId: p.id }} className="block px-1 text-sm font-medium text-primary hover:underline">See full record →</Link>}

      <ListDialog open={listOpen} onOpenChange={setListOpen} parcel={p} />
      <BuyDialog open={buyOpen} onOpenChange={setBuyOpen} parcel={p} />
      {sale && <DisputeDialog open={disputeOpen} onOpenChange={setDisputeOpen} saleId={sale.id} />}
    </div>
  );
}

function ListDialog({ open, onOpenChange, parcel }: { open: boolean; onOpenChange: (o: boolean) => void; parcel: Parcel }) {
  const [price, setPrice] = useState("");
  const n = Number(price.replace(/[^0-9]/g, ""));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>List {parcel.id} for sale</DialogTitle>
          <DialogDescription>Buyers pay into escrow. You receive the money when the registrar approves the sale.</DialogDescription>
        </DialogHeader>
        <label className="text-sm">Asking price (GH₵)</label>
        <Input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="350,000" />
        {n > 0 && <p className="text-sm text-muted-foreground">{cedi(n / parcel.acres)} per acre</p>}
        <DialogFooter>
          <Button disabled={!n} onClick={async () => { const r = await landchain.listForSale(parcel.id, n); if (r.ok) onOpenChange(false); }}>List for sale</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BuyDialog({ open, onOpenChange, parcel }: { open: boolean; onOpenChange: (o: boolean) => void; parcel: Parcel }) {
  const { s, me } = useMe();
  const bal = wallet(s, me.id).tghs;
  const price = parcel.price ?? 0;
  const short = bal < price;
  const unverified = me.identity !== "verified";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buy {parcel.id}</DialogTitle>
          <DialogDescription>Money held safely in escrow until the registrar approves.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span className="font-semibold">{cedi(price)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Your tGHS balance</span><span className={short ? "text-bad" : ""}>{cedi(bal)}</span></div>
          <ol className="mt-3 space-y-2 rounded-lg bg-muted p-3">
            <li>1. Approve spending {cediShort(price)} of test cedis</li>
            <li>2. Pay into escrow — the seller can't touch it until the registrar approves</li>
          </ol>
          {unverified && <p className="text-bad">You need a verified identity first. <Link to="/identity" className="underline">Verify now</Link></p>}
          {short && !unverified && <p className="text-bad">Not enough tGHS. <Link to="/balance" className="underline">Get test cedis</Link></p>}
        </div>
        <DialogFooter>
          <Button disabled={short || unverified || me.kind !== "citizen"} onClick={async () => { const r = await landchain.buyListed(parcel.id); if (r.ok) onOpenChange(false); }}>Approve & pay into escrow</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisputeDialog({ open, onOpenChange, saleId }: { open: boolean; onOpenChange: (o: boolean) => void; saleId: string }) {
  const [reason, setReason] = useState("");
  const [hash, setHash] = useState<string>();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raise a dispute</DialogTitle>
          <DialogDescription>The money stays in escrow and the case goes to a judge.</DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What's wrong with this sale?" />
        <Input type="file" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setHash(await sha256Hex(await f.arrayBuffer())); }} />
        {hash && <Mono className="break-all text-muted-foreground">Evidence hash {hash}</Mono>}
        <DialogFooter>
          <Button disabled={!reason.trim()} onClick={async () => { const r = await landchain.raiseDispute(saleId, reason, hash); if (r.ok) onOpenChange(false); }}>Raise dispute</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
