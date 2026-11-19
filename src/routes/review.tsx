import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/lc/Shell";
import { ParcelMap } from "@/components/lc/ParcelMap";
import { FeeRecorder } from "@/components/lc/FeeRecorder";
import { openFile } from "@/lib/landchain/vault";
import { toast } from "sonner";
import { Card, Empty, Mono, Td, Th } from "@/components/lc/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { landchain, useMe } from "@/lib/landchain/store";
import { account, isFeePaid } from "@/lib/landchain/engine";
import { queueItems } from "@/lib/landchain/queue";
import { fmtDate } from "@/lib/landchain/format";
import type { Application, TransferRequest } from "@/lib/landchain/types";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Review Queue · LandChain Ghana" },
      { name: "description", content: "Lands Commission queue: identity requests, land registrations and ownership transfers." },
      { property: "og:title", content: "Review Queue · LandChain Ghana" },
      { property: "og:description", content: "Everything waiting for Lands Commission sign-off in one place." },
    ],
  }),
  component: Review,
});

function Review() {
  const { s, me } = useMe();
  const q = queueItems(s);
  const has = (r: string) => me.roles.includes(r as never);
  const [app, setApp] = useState<Application>();
  const [trf, setTrf] = useState<TransferRequest>();
  const hint = (r: string) => (has(r) ? null : <span className="text-xs text-muted-foreground">Only the {r.toLowerCase()} can act</span>);
  const name = (id: string) => account(s, id)?.name ?? id;

  return (
    <Shell title="Review Queue">
      <p className="mb-4 text-sm text-muted-foreground">
        Acting as <b className="text-foreground">{me.name}</b>{me.kind === "officer" ? ` · ${me.roles.join(", ")}` : ""}. Everyone can see the queue; only the matching role can act, and the smart contract checks that too.
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

        <Card title="Land registrations" badge={q.applications.length} right="Registrar">
          {q.applications.length === 0 ? <Empty>Nothing waiting.</Empty> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b"><tr><Th>Parcel</Th><Th>Owner</Th><Th>Size</Th><Th>Applied</Th><Th /></tr></thead>
              <tbody>{q.applications.map((a) => {
                const p = s.parcels.find((x) => x.id === a.parcelId)!;
                return (
                  <tr key={a.id} className="border-b last:border-0">
                    <Td><Link to="/title/$parcelId" params={{ parcelId: p.id }} className="font-medium text-primary">{p.id}</Link><div className="text-muted-foreground">{p.holder}</div></Td>
                    <Td>{name(a.applicant)}</Td><Td>{p.acres} ac</Td><Td>{fmtDate(a.createdAt)}</Td>
                    <Td className="text-right"><Button size="sm" variant="outline" onClick={() => setApp(a)}>Review</Button></Td>
                  </tr>);
              })}</tbody></table></div>
          )}
        </Card>

        <Card title="Ownership transfers" badge={q.transfers.length} right="Registrar">
          {q.transfers.length === 0 ? <Empty>Nothing waiting.</Empty> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b"><tr><Th>Parcel</Th><Th>From</Th><Th>To</Th><Th>Requested</Th><Th /></tr></thead>
              <tbody>{q.transfers.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <Td><Link to="/title/$parcelId" params={{ parcelId: t.parcelId }} className="font-medium text-primary">{t.parcelId}</Link></Td>
                  <Td>{name(t.from)}</Td><Td>{name(t.to)}</Td><Td>{fmtDate(t.requestedAt)}</Td>
                  <Td className="text-right"><Button size="sm" variant="outline" onClick={() => setTrf(t)}>Review</Button></Td>
                </tr>))}</tbody></table></div>
          )}
        </Card>
      </div>

      {app && <ApplicationDialog app={app} onClose={() => setApp(undefined)} />}
      {trf && <TransferDialog trf={trf} onClose={() => setTrf(undefined)} />}
    </Shell>
  );
}

function ApplicationDialog({ app: initial, onClose }: { app: Application; onClose: () => void }) {
  const { s, me } = useMe();
  const app = s.applications.find((a) => a.id === initial.id) ?? initial;
  const p = s.parcels.find((x) => x.id === app.parcelId)!;
  const canAct = app.decision === "waiting" && me.roles.includes("Registrar");
  const feesReady = isFeePaid(s, p.id, "Stamp duty") && isFeePaid(s, p.id, "First registration");
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{p.id} · {p.acres} acres</DialogTitle>
          <DialogDescription>Owner <Mono>{app.applicant}</Mono> ({account(s, app.applicant)?.name}) · {p.interest} · {p.holder}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-64"><ParcelMap parcels={s.parcels} focusId={p.id} defaultSatellite showToggle="dropdown" className="min-h-0" /></div>
          <div className="space-y-3 text-sm">
            <div><span className="text-muted-foreground">Location</span> · {p.location}</div>
            <div><span className="text-muted-foreground">Plan number</span> · <Mono>{p.planNumber}</Mono>{p.gpsAddress && <> · GPS <Mono>{p.gpsAddress}</Mono></>}</div>
            <div><span className="text-muted-foreground">Boundary</span> · {p.pillars.length} corner pillars</div>
            <div className="space-y-1 pt-2">
              <div className="font-medium">Documents (hashes on chain)</div>
              {p.docs.length === 0 && <p className="text-muted-foreground">No documents uploaded.</p>}
              {p.docs.map((d) => (
                <div key={d.hash} className="flex items-center justify-between gap-2 text-xs">
                  <span>{d.type}<br /><Mono className="text-muted-foreground">{d.hash.slice(0, 26)}…</Mono></span>
                  <Button size="sm" variant="ghost" onClick={async () => { if (!(await openFile(d.hash))) toast.info("File not in this device's vault", { description: "Seeded parcels have fingerprints only." }); }}>Open</Button>
                </div>
              ))}
            </div>
          </div>
        </div>
        {app.decision === "waiting" && <div className="border-t pt-3"><FeeRecorder parcel={p} kinds={["Official search", "Stamp duty", "First registration"]} /></div>}
        {app.decision !== "waiting" ? <p className="text-sm text-muted-foreground">Already {app.decision}.</p> : canAct ? (
          <div className="space-y-2 border-t pt-3">
            {!feesReady && <p className="text-sm text-warn">Record the stamp duty and registration fee receipts first. The contract refuses approval without them.</p>}
            <p className="text-sm">Approving mints title NFT <b>GLT</b> to the owner. After that, this record can't be edited.</p>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required to reject)" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={!reason.trim()} onClick={async () => { const r = await landchain.rejectApplication(app.id, reason); if (r.ok) onClose(); }}>Reject</Button>
              <Button disabled={!feesReady} onClick={async () => { const r = await landchain.approveApplication(app.id); if (r.ok) onClose(); }}>Approve & register</Button>
            </div>
          </div>
        ) : <p className="border-t pt-3 text-sm text-muted-foreground">Waiting on the <b>registrar</b>. Switch account to act.</p>}
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ trf: initial, onClose }: { trf: TransferRequest; onClose: () => void }) {
  const { s, me } = useMe();
  const t = s.transfers.find((x) => x.id === initial.id) ?? initial;
  const p = s.parcels.find((x) => x.id === t.parcelId)!;
  const canAct = t.decision === "waiting" && me.roles.includes("Registrar");
  const [reason, setReason] = useState("");
  const who = (id: string) => <>{account(s, id)?.name ?? id} <Mono className="text-muted-foreground">{id}</Mono></>;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transfer {p.id}</DialogTitle>
          <DialogDescription>Title GLT #{p.titleNo} · {p.acres} acres · {p.holder}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div><span className="text-muted-foreground">From</span> · {who(t.from)}</div>
          <div><span className="text-muted-foreground">To</span> · {who(t.to)} · identity {account(s, t.to)?.identity}</div>
          <div><span className="text-muted-foreground">Requested</span> · {fmtDate(t.requestedAt)}</div>
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">Check the signed indenture before approving. Approving moves the title NFT to the new owner and adds them to the on-chain owner history.</p>
        </div>
        {t.decision === "waiting" && <div className="border-t pt-3"><FeeRecorder parcel={p} kinds={["Transfer"]} transferId={t.id} /></div>}
        {t.decision !== "waiting" ? <p className="text-sm text-muted-foreground">Already {t.decision}.</p> : canAct ? (
          <div className="space-y-2 border-t pt-3">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required to reject)" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={!reason.trim()} onClick={async () => { const r = await landchain.rejectTransfer(t.id, reason); if (r.ok) onClose(); }}>Reject</Button>
              <Button disabled={!isFeePaid(s, p.id, "Transfer", t.id)} onClick={async () => { const r = await landchain.approveTransfer(t.id); if (r.ok) onClose(); }}>Approve transfer</Button>
            </div>
          </div>
        ) : <p className="border-t pt-3 text-sm text-muted-foreground">Waiting on the <b>registrar</b>. Switch account to act.</p>}
      </DialogContent>
    </Dialog>
  );
}
