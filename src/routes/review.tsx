import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/lc/Shell";
import { ParcelMap } from "@/components/lc/ParcelMap";
import { Card, Empty, Mono, Pill, Td, Th } from "@/components/lc/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { landchain, useMe } from "@/lib/landchain/store";
import { account, currentStep } from "@/lib/landchain/engine";
import { queueItems } from "@/lib/landchain/queue";
import { cedi, fmtDate } from "@/lib/landchain/format";
import type { Application, Step } from "@/lib/landchain/types";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Review Queue · LandChain Ghana" },
      { name: "description", content: "Lands Commission queue: identity requests, title applications, sales and disputes." },
      { property: "og:title", content: "Review Queue · LandChain Ghana" },
      { property: "og:description", content: "Everything waiting for Lands Commission sign-off in one place." },
    ],
  }),
  component: Review,
});

const STEP_ROLE = { survey: "Surveyor", legal: "Lawyer", registrar: "Registrar" } as const;
function SP({ st }: { st: Step }) {
  return <Pill tone={st.status === "approved" ? "ok" : st.status === "rejected" ? "bad" : "warn"}>{st.status === "approved" ? "Approved" : st.status === "rejected" ? "Rejected" : "Waiting"}</Pill>;
}

function Review() {
  const { s, me } = useMe();
  const q = queueItems(s);
  const has = (r: string) => me.roles.includes(r as never);
  const [open, setOpen] = useState<Application>();
  const [disputeId, setDisputeId] = useState<string>();
  const hint = (r: string) => (has(r) ? null : <span className="text-xs text-muted-foreground">Only the {r.toLowerCase()} can act</span>);

  return (
    <Shell title="Review Queue">
      <p className="mb-4 text-sm text-muted-foreground">
        Acting as <b className="text-foreground">{me.name}</b>{me.kind === "officer" ? ` · ${me.roles.join(", ")}` : ""}. Everyone can see the queue; only the matching role can act.
      </p>
      <div className="space-y-4">
        <Card title="Identity requests" badge={q.identities.length} right="Identity officer">
          {q.identities.length === 0 ? <Empty>Nothing waiting.</Empty> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b"><tr><Th>Public ID</Th><Th>Name</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>{q.identities.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <Td><Mono>{a.id}</Mono></Td><Td>{a.name}</Td><Td>{a.citizenship}</Td>
                  <Td className="text-right">{has("Identity officer") ? <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => landchain.verifyIdentity(a.id, false)}>Reject</Button>
                    <Button size="sm" onClick={() => landchain.verifyIdentity(a.id, true)}>Verify</Button></div> : hint("Identity officer")}</Td>
                </tr>))}</tbody></table></div>
          )}
        </Card>

        <Card title="Title applications" badge={q.applications.length} right="Surveyor → Lawyer → Registrar">
          {q.applications.length === 0 ? <Empty>Nothing waiting.</Empty> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b"><tr><Th>Parcel</Th><Th>Size</Th><Th>Survey</Th><Th>Legal</Th><Th>Registrar</Th><Th /></tr></thead>
              <tbody>{q.applications.map((a) => {
                const p = s.parcels.find((x) => x.id === a.parcelId)!;
                return (
                  <tr key={a.id} className="border-b last:border-0">
                    <Td><Link to="/title/$parcelId" params={{ parcelId: p.id }} className="font-medium text-primary">{p.id}</Link><div className="text-muted-foreground">{p.holder}</div></Td>
                    <Td>{p.acres} ac</Td><Td><SP st={a.survey} /></Td><Td><SP st={a.legal} /></Td><Td><SP st={a.registrar} /></Td>
                    <Td className="text-right"><Button size="sm" variant="outline" onClick={() => setOpen(a)}>Review</Button></Td>
                  </tr>);
              })}</tbody></table></div>
          )}
        </Card>

        <Card title="Sales awaiting approval" badge={q.sales.length} right="Registrar">
          {q.sales.length === 0 ? <Empty>Nothing waiting.</Empty> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b"><tr><Th>Parcel</Th><Th>Price in escrow</Th><Th>Since</Th><Th /></tr></thead>
              <tbody>{q.sales.map((x) => (
                <tr key={x.id} className="border-b last:border-0">
                  <Td><Link to="/title/$parcelId" params={{ parcelId: x.parcelId }} className="font-medium text-primary">{x.parcelId}</Link></Td>
                  <Td className="font-semibold">{cedi(x.amount)}</Td><Td>{fmtDate(x.since)}</Td>
                  <Td className="text-right">{has("Registrar") ? <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => landchain.rejectSale(x.id)}>Reject & refund</Button>
                    <Button size="sm" onClick={() => landchain.approveSale(x.id)}>Approve</Button></div> : hint("Registrar")}</Td>
                </tr>))}</tbody></table></div>
          )}
        </Card>

        <Card title="Disputes" badge={q.disputes.length} right="Judge">
          {q.disputes.length === 0 ? <Empty>Nothing waiting.</Empty> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b"><tr><Th>Parcel</Th><Th>Amount</Th><Th>Raised by</Th><Th /></tr></thead>
              <tbody>{q.disputes.map((d) => {
                const sale = s.sales.find((x) => x.id === d.saleId)!;
                return (
                  <tr key={d.id} className="border-b last:border-0">
                    <Td><Link to="/title/$parcelId" params={{ parcelId: sale.parcelId }} className="font-medium text-primary">{sale.parcelId}</Link></Td>
                    <Td>{cedi(sale.amount)}</Td><Td>{d.raisedBy === sale.buyer ? "Buyer" : "Seller"} · <Mono>{d.raisedBy}</Mono></Td>
                    <Td className="text-right"><Button size="sm" variant="outline" onClick={() => setDisputeId(d.id)}>Open case</Button></Td>
                  </tr>);
              })}</tbody></table></div>
          )}
        </Card>
      </div>

      {open && <ApplicationDialog app={open} onClose={() => setOpen(undefined)} />}
      {disputeId && <DisputeCase id={disputeId} onClose={() => setDisputeId(undefined)} />}
    </Shell>
  );
}

function ApplicationDialog({ app: initial, onClose }: { app: Application; onClose: () => void }) {
  const { s, me } = useMe();
  const app = s.applications.find((a) => a.id === initial.id)!;
  const p = s.parcels.find((x) => x.id === app.parcelId)!;
  const step = currentStep(app);
  const canAct = step && me.roles.includes(STEP_ROLE[step]);
  const [reason, setReason] = useState("");
  const approve = { survey: landchain.approveSurvey, legal: landchain.approveLegal, registrar: landchain.finalise };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{p.id} · {p.acres} acres</DialogTitle>
          <DialogDescription>Applicant <Mono>{app.applicant}</Mono> ({account(s, app.applicant)?.name}) · {p.interest} · {p.holder}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-64"><ParcelMap parcels={s.parcels} focusId={p.id} defaultSatellite showToggle="dropdown" className="min-h-0" /></div>
          <div className="space-y-3 text-sm">
            <div className="flex gap-2"><span className="w-20 text-muted-foreground">Survey</span><SP st={app.survey} /></div>
            <div className="flex gap-2"><span className="w-20 text-muted-foreground">Legal</span><SP st={app.legal} /></div>
            <div className="flex gap-2"><span className="w-20 text-muted-foreground">Registrar</span><SP st={app.registrar} /></div>
            <div className="space-y-1 pt-2">
              <div className="font-medium">Documents</div>
              {p.docs.length === 0 && <p className="text-muted-foreground">No documents uploaded.</p>}
              {p.docs.map((d) => <div key={d.hash} className="text-xs">{d.name}<br /><Mono className="text-muted-foreground">{d.hash.slice(0, 30)}…</Mono></div>)}
            </div>
          </div>
        </div>
        {step === null ? <p className="text-sm text-muted-foreground">No steps remaining.</p> : canAct ? (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm">You're signing the <b>{step}</b> step.</p>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required to reject)" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={!reason.trim()} onClick={async () => { const r = await landchain.rejectApplication(app.id, step, reason); if (r.ok) onClose(); }}>Reject</Button>
              <Button onClick={async () => { const r = await approve[step](app.id); if (r.ok) onClose(); }}>{step === "registrar" ? "Finalise & mint title" : "Approve"}</Button>
            </div>
          </div>
        ) : <p className="border-t pt-3 text-sm text-muted-foreground">Waiting on the <b>{STEP_ROLE[step].toLowerCase()}</b>. Switch account to act.</p>}
      </DialogContent>
    </Dialog>
  );
}

function DisputeCase({ id, onClose }: { id: string; onClose: () => void }) {
  const { s, me } = useMe();
  const d = s.disputes.find((x) => x.id === id)!;
  const sale = s.sales.find((x) => x.id === d.saleId)!;
  const judge = me.roles.includes("Judge");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dispute on {sale.parcelId}</DialogTitle>
          <DialogDescription>{cedi(sale.amount)} held in escrow</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div>Buyer <Mono>{sale.buyer}</Mono> · Seller <Mono>{sale.seller}</Mono></div>
          <div>Raised by <Mono>{d.raisedBy}</Mono>: "{d.reason}"</div>
          {d.evidenceHash && <div className="text-xs text-muted-foreground">Evidence <Mono>{d.evidenceHash.slice(0, 30)}…</Mono></div>}
        </div>
        {judge ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={async () => { const r = await landchain.resolveDispute(d.id, "buyer"); if (r.ok) onClose(); }}>Rule for buyer (refund)</Button>
            <Button onClick={async () => { const r = await landchain.resolveDispute(d.id, "seller"); if (r.ok) onClose(); }}>Rule for seller (complete sale)</Button>
          </div>
        ) : <p className="text-sm text-muted-foreground">Only a judge can resolve disputes.</p>}
      </DialogContent>
    </Dialog>
  );
}
