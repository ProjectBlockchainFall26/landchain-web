import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  EyeOff,
  FileCheck2,
  FileText,
  History,
  Lock,
  Mail,
  MapPin,
  Receipt,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { landchain, sha256Hex, useMe } from "@/lib/landchain/store";
import {
  account,
  applicationFor,
  getHistory,
  openTransfer,
  paymentsFor,
} from "@/lib/landchain/engine";
import { blockNo, fmtDate, shortHash } from "@/lib/landchain/format";
import { cedi } from "@/lib/landchain/fees";
import { toDMS } from "@/lib/landchain/geo";
import { canSeePrivate, shownName } from "@/lib/landchain/privacy";
import {
  markEnquiry,
  sendEnquiry,
  useEnquiries,
} from "@/lib/landchain/enquiries";
import { openFile } from "@/lib/landchain/vault";
import type { Parcel } from "@/lib/landchain/types";
import { toast } from "sonner";
import { Mono, Pill, Row, Section } from "./ui";

const BANNER = {
  registered: {
    tone: "ok",
    text: "Registered on the blockchain",
    sub: "Record locked",
  },
  transfer_pending: {
    tone: "info",
    text: "Transfer waiting for the registrar",
    sub: "Owner unchanged until approved",
  },
  pending: {
    tone: "warn",
    text: "Application under review",
    sub: "No title yet",
  },
  rejected: {
    tone: "bad",
    text: "Application rejected",
    sub: "No title issued",
  },
} as const;
const BANNER_CLS = {
  ok: "bg-ok-soft text-ok",
  info: "bg-info-soft text-info",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
};

export function TitleHealth({
  parcel: p,
  readOnly,
  showFullLink,
}: {
  parcel: Parcel;
  readOnly?: boolean | undefined;
  showFullLink?: boolean | undefined;
}) {
  const { s, me } = useMe();
  const app = applicationFor(s, p.id);
  const trf = openTransfer(s, p.id);
  const history = getHistory(s, p.id);
  const priv = canSeePrivate(me, p);
  const fees = paymentsFor(s, p.id);
  const isOwner = me.id === p.owner && !readOnly;
  const isRegistrar = me.roles.includes("Registrar") && !readOnly;
  const [transferOpen, setTransferOpen] = useState(false);
  const [enquireOpen, setEnquireOpen] = useState(false);
  const name = (id?: string) => (id ? shownName(s, me, id) : "—");
  const b = BANNER[p.status];

  return (
    <div className="space-y-2.5">
      <div
        className={`flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium ${BANNER_CLS[b.tone]}`}
      >
        {p.status === "registered" ? (
          <CheckCircle2 className="size-4" />
        ) : (
          <Clock className="size-4" />
        )}
        <span className="flex-1">{b.text}</span>
        <span className="font-normal">{b.sub}</span>
      </div>
      {!priv && (
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <EyeOff className="mt-0.5 size-3.5 shrink-0" />
          Public view. The owner's identity, documents and fees are visible only
          to the owner and the Lands Commission.
        </p>
      )}

      <Section
        icon={<ShieldCheck />}
        title="Registration"
        summary={
          p.titleNo
            ? `GLT #${p.titleNo}`
            : app?.decision === "rejected"
              ? "Rejected"
              : "In review"
        }
        summaryTone={
          p.titleNo ? "ok" : app?.decision === "rejected" ? "bad" : "warn"
        }
        defaultOpen={!p.titleNo}
      >
        <Row icon={<User />} label="Owner identity">
          <Pill
            tone={
              account(s, app?.applicant ?? p.owner)?.identity === "verified"
                ? "ok"
                : "warn"
            }
          >
            Ghana Card verified
          </Pill>
        </Row>
        <Row
          icon={<ShieldCheck />}
          label={
            <>
              Registrar approval{" "}
              {app?.by && (
                <span className="text-muted-foreground">· {name(app.by)}</span>
              )}
            </>
          }
        >
          <Pill
            tone={
              app?.decision === "approved"
                ? "ok"
                : app?.decision === "rejected"
                  ? "bad"
                  : "warn"
            }
          >
            {app?.decision === "approved"
              ? "Approved"
              : app?.decision === "rejected"
                ? "Rejected"
                : "Waiting"}
          </Pill>
        </Row>
        {app?.reason && (
          <p className="px-1 text-xs text-bad">Reason: {app.reason}</p>
        )}
        {p.registeredAt && (
          <Row icon={<Clock />} label="Registered on">
            {fmtDate(p.registeredAt)}
          </Row>
        )}
        <Row icon={<FileText />} label="Regional / plan number">
          <Mono>{p.planNumber}</Mono>
        </Row>
        {p.gpsAddress && (
          <Row icon={<MapPin />} label="GhanaPostGPS">
            <Mono>{p.gpsAddress}</Mono>
          </Row>
        )}
        <Row icon={<FileText />} label="Interest · allodial holder">
          {p.interest} · {p.holder}
        </Row>
        {isRegistrar && app?.decision === "waiting" && (
          <Button asChild variant="outline" size="sm">
            <Link to="/review">Open in Review Queue</Link>
          </Button>
        )}
      </Section>

      <Section
        icon={<Users />}
        title="Ownership"
        summary={
          trf
            ? "Transfer pending"
            : `${p.owners.length || 0} owner${p.owners.length === 1 ? "" : "s"}`
        }
        summaryTone={trf ? "info" : "neutral"}
        defaultOpen
        highlight
      >
        <Row icon={<User />} label="Current owner">
          <span>
            {priv ? (
              <>
                {name(p.owner)}{" "}
                <Mono className="text-muted-foreground">{p.owner}</Mono>
              </>
            ) : (
              <Mono>{p.owner}</Mono>
            )}
          </span>
        </Row>
        {p.owners.length > 0 && (
          <ol className="space-y-1 px-1 text-xs">
            {p.owners.map((o, i) => (
              <li key={i} className="flex justify-between">
                <span className="text-muted-foreground">
                  {i === 0 ? "First registered owner" : `Owner ${i + 1}`}
                </span>
                <span>
                  {priv ? <>{name(o)} </> : null}
                  <Mono className="text-muted-foreground">{o}</Mono>
                </span>
              </li>
            ))}
          </ol>
        )}
        {trf ? (
          <div className="space-y-2 rounded-lg bg-info-soft p-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-info">
              Transfer requested · {fmtDate(trf.requestedAt)}
            </div>
            <p>
              {name(trf.from)} → <b>{name(trf.to)}</b>. Nothing moves until the
              Lands Commission registrar approves.
            </p>
            <div className="flex flex-wrap gap-2">
              {isRegistrar && (
                <Button size="sm" variant="outline" asChild>
                  <Link to="/review">Review in queue</Link>
                </Button>
              )}
              {isOwner && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => landchain.cancelTransfer(trf.id)}
                >
                  Cancel request
                </Button>
              )}
            </div>
          </div>
        ) : p.status === "registered" ? (
          <>
            <p className="px-1 text-sm text-muted-foreground">
              Ownership changes only when the owner asks <i>and</i> the
              registrar approves. Neither can do it alone.
            </p>
            {isOwner && (
              <Button onClick={() => setTransferOpen(true)}>
                <ArrowRightLeft className="size-4" />
                Transfer ownership
              </Button>
            )}
          </>
        ) : (
          <p className="px-1 text-sm text-muted-foreground">
            A title can be transferred once it's registered.
          </p>
        )}
        {!priv && p.status !== "rejected" && me.kind !== "officer" && (
          <Button variant="outline" onClick={() => setEnquireOpen(true)}>
            <Mail className="size-4" />
            Enquire about this land
          </Button>
        )}
      </Section>

      <DocumentsSection parcel={p} priv={priv} />

      {priv && (
        <Section
          icon={<Receipt />}
          title="Fees & receipts"
          summary={
            fees.length
              ? cedi(fees.reduce((a, x) => a + x.amount, 0))
              : "None recorded"
          }
          summaryTone={fees.length ? "neutral" : "warn"}
        >
          {fees.length === 0 && (
            <p className="px-1 text-sm text-muted-foreground">
              No receipts recorded yet. The registrar records them from the
              official payment receipts.
            </p>
          )}
          {fees.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-2 px-1 text-sm"
            >
              <span>
                {f.kind}
                <span className="block text-xs text-muted-foreground">
                  {fmtDate(f.at)} · receipt{" "}
                  <Mono>{f.receiptHash.slice(0, 10)}…</Mono>
                </span>
              </span>
              <span className="font-medium">{cedi(f.amount)}</span>
            </div>
          ))}
          <Button variant="outline" size="sm" asChild>
            <Link to="/receipt/$parcelId" params={{ parcelId: p.id }}>
              <Receipt className="size-4" />
              Full receipt with blockchain costs
            </Link>
          </Button>
        </Section>
      )}

      {isOwner && <EnquiriesSection parcelId={p.id} />}

      <Section
        icon={<History />}
        title="On-chain history"
        summary={`${history.length} event${history.length === 1 ? "" : "s"}`}
        defaultOpen
      >
        {history.length === 0 && (
          <p className="px-1 text-sm text-muted-foreground">No events yet.</p>
        )}
        <ol className="space-y-3 px-1">
          {history.map((h, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${h.type === "Rejected" || h.type === "Transfer rejected" ? "bg-bad" : "bg-ok"}`}
              />
              <div>
                <div className="font-medium">{h.type}</div>
                <div>
                  {h.text
                    .split(/(GH-[0-9a-f]{8})/)
                    .map((t, j) =>
                      /^GH-/.test(t) ? <Mono key={j}>{t}</Mono> : t,
                    )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {fmtDate(h.at)} · block {blockNo(h.block)}
                  {h.tx && (
                    <>
                      {" "}
                      · tx <Mono>{shortHash(h.tx)}</Mono>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        icon={<MapPin />}
        title="GPS Boundary"
        summary={`${p.pillars.length} pillars`}
      >
        {p.pillars.map(([lat, lng], i) => (
          <div
            key={i}
            className="flex justify-between rounded-lg border px-3 py-2 text-xs"
          >
            <span className="text-muted-foreground">Pillar {i + 1}</span>
            <Mono>
              {toDMS(lat, "N", "S")} {toDMS(lng, "E", "W")}
            </Mono>
          </div>
        ))}
      </Section>

      <Section
        icon={<FileText />}
        title="Smart contract"
        summary={`Record #${p.recordId}`}
      >
        <p className="px-1 text-xs text-muted-foreground">
          Stored in <Mono>TitleRegistry</Mono> as record #{p.recordId}
          {p.titleNo ? <>, ERC-721 token #{p.titleNo}</> : null}. Read with{" "}
          <Mono>getParcel({p.recordId})</Mono> and{" "}
          <Mono>ownerHistory({p.recordId})</Mono>; fees with{" "}
          <Mono>FeeLedger.paymentsOf({p.recordId})</Mono>.
        </p>
      </Section>

      {showFullLink && (
        <Link
          to="/title/$parcelId"
          params={{ parcelId: p.id }}
          className="block px-1 text-sm font-medium text-primary hover:underline"
        >
          See full record →
        </Link>
      )}

      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        parcel={p}
      />
      <EnquiryDialog
        open={enquireOpen}
        onOpenChange={setEnquireOpen}
        parcel={p}
      />
    </div>
  );
}

/** Officers and the owner can open the files; everyone can see the fingerprints and check a copy they hold. */
function DocumentsSection({
  parcel: p,
  priv,
}: {
  parcel: Parcel;
  priv: boolean;
}) {
  const [check, setCheck] = useState<{
    name: string;
    match?: string | undefined;
  }>();
  return (
    <Section
      icon={<FileCheck2 />}
      title="Documents"
      summary={`${p.docs.length} on file`}
    >
      {!priv && (
        <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
          <Lock className="size-3" />
          Files are held by the Lands Commission. Only their fingerprints are
          public.
        </p>
      )}
      {p.docs.map((d) => (
        <div
          key={d.hash}
          className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
        >
          <span>
            <span className="font-medium">{d.type}</span>
            <Mono className="block text-muted-foreground">
              {d.hash.slice(0, 22)}…
            </Mono>
          </span>
          {priv && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (!(await openFile(d.hash, p.id)))
                  toast.info("This file isn't in the vault", {
                    description:
                      "Seeded demo parcels have fingerprints only. Files you upload when registering can be opened here.",
                  });
              }}
            >
              Open
            </Button>
          )}
        </div>
      ))}
      <label className="block px-1 pt-1 text-xs text-muted-foreground">
        Have a copy? Check it against the register:
        <Input
          className="mt-1"
          type="file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return setCheck(undefined);
            const h = await sha256Hex(await f.arrayBuffer());
            setCheck({
              name: f.name,
              match: p.docs.find(
                (d) => d.hash.toLowerCase() === h.toLowerCase(),
              )?.type,
            });
          }}
        />
      </label>
      {check &&
        (check.match ? (
          <p className="px-1 text-xs text-ok">
            ✓ "{check.name}" matches the registered {check.match}. It hasn't
            been changed.
          </p>
        ) : (
          <p className="px-1 text-xs text-bad">
            ✗ "{check.name}" doesn't match any document registered for this
            parcel.
          </p>
        ))}
    </Section>
  );
}

function EnquiriesSection({ parcelId }: { parcelId: string }) {
  const { me } = useMe();
  const mine = useEnquiries().filter(
    (e) => e.parcelId === parcelId && e.to === me.id,
  );
  const unread = mine.filter((e) => e.status === "new").length;
  return (
    <Section
      icon={<Mail />}
      title="Enquiries"
      summary={unread ? `${unread} new` : `${mine.length}`}
      summaryTone={unread ? "warn" : "neutral"}
      defaultOpen={unread > 0}
    >
      {mine.length === 0 && (
        <p className="px-1 text-sm text-muted-foreground">
          No enquiries. People who look this parcel up can send you a message
          without learning who you are.
        </p>
      )}
      {mine.map((e) => (
        <div
          key={e.id}
          className="space-y-1 rounded-lg border p-3 text-sm"
          onMouseEnter={() => e.status === "new" && markEnquiry(e.id, "read")}
        >
          <div className="flex justify-between">
            <b>{e.name}</b>
            <span className="text-xs text-muted-foreground">
              {fmtDate(e.at)}
            </span>
          </div>
          <p>{e.message}</p>
          <p className="text-xs">
            Contact: <Mono>{e.contact}</Mono>
          </p>
          <p className="text-xs text-muted-foreground">
            Your identity stays private until you contact them yourself.
          </p>
          {e.status !== "answered" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => markEnquiry(e.id, "answered")}
            >
              Mark as answered
            </Button>
          )}
        </div>
      ))}
    </Section>
  );
}

function EnquiryDialog({
  open,
  onOpenChange,
  parcel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  parcel: Parcel;
}) {
  const { me } = useMe();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enquire about {parcel.id}</DialogTitle>
          <DialogDescription>
            Your message goes to the registered owner (
            <Mono>{parcel.owner}</Mono>). Their identity isn't shown to you; if
            they're interested, they'll contact you.
          </DialogDescription>
        </DialogHeader>
        <label className="text-sm">
          Your name
          <Input
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kojo Appiah"
          />
        </label>
        <label className="text-sm">
          Phone or email
          <Input
            className="mt-1"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="024 000 0000"
          />
        </label>
        <label className="text-sm">
          Message
          <Textarea
            className="mt-1"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="I'm interested in buying this plot. Is it available?"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Kept off the blockchain: contact details must never be public.
        </p>
        <DialogFooter>
          <Button
            disabled={!name.trim() || !contact.trim() || !message.trim()}
            onClick={async () => {
              const sent = await sendEnquiry({
                parcelId: parcel.id,
                to: parcel.owner,
                from: me.id,
                name: name.trim(),
                contact: contact.trim(),
                message: message.trim(),
              });
              if (!sent) return;
              toast.success("Enquiry sent to the owner");
              setMessage("");
              onOpenChange(false);
            }}
          >
            Send enquiry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({
  open,
  onOpenChange,
  parcel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  parcel: Parcel;
}) {
  const { s, me } = useMe();
  const [to, setTo] = useState("");
  const people = s.accounts.filter(
    (a) => a.kind === "citizen" && a.id !== me.id,
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer {parcel.id}</DialogTitle>
          <DialogDescription>
            For a sale or gift already agreed off the platform. The registrar
            checks the indenture, records the transfer fee and approves.
          </DialogDescription>
        </DialogHeader>
        <label className="text-sm">
          New owner (must have a verified Ghana Card)
        </label>
        <Select value={to} onValueChange={setTo}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a person" />
          </SelectTrigger>
          <SelectContent>
            {people.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} · {a.id}
                {a.identity !== "verified" ? " (not verified)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ol className="space-y-1 rounded-lg bg-muted p-3 text-sm">
          <li>
            1. You send <Mono>requestTransfer</Mono>. The title is marked
            "transfer pending".
          </li>
          <li>
            2. The registrar records the transfer fee receipt in{" "}
            <Mono>FeeLedger</Mono>.
          </li>
          <li>
            3. The registrar sends <Mono>approveTransfer</Mono>. The NFT moves
            to the new owner.
          </li>
        </ol>
        <DialogFooter>
          <Button
            disabled={!to}
            onClick={async () => {
              const r = await landchain.requestTransfer(parcel.id, to);
              if (r.ok) onOpenChange(false);
            }}
          >
            Request transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
