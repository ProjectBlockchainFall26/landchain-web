import { useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { landchain, useMe } from "@/lib/landchain/store";
import { isFeePaid } from "@/lib/landchain/engine";
import { cedi, estimateFee, FEE_INFO } from "@/lib/landchain/fees";
import type { FeeKind, Parcel } from "@/lib/landchain/types";

/** The registrar's checklist: record each official receipt in the FeeLedger contract. */
export function FeeRecorder({ parcel, kinds, transferId }: { parcel: Parcel; kinds: FeeKind[]; transferId?: string | undefined }) {
  const { s, me } = useMe();
  const registrar = me.roles.includes("Registrar");
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Fee receipts <span className="font-normal text-muted-foreground">· the contract won't approve until the required ones are recorded</span></div>
      {kinds.map((k) => {
        const paid = s.payments.find((p) => p.parcelId === parcel.id && p.kind === k && (k !== "Transfer" || p.transferId === transferId));
        return paid || isFeePaid(s, parcel.id, k, transferId)
          ? <div key={k} className="flex items-center justify-between rounded-lg bg-ok-soft px-3 py-2 text-sm"><span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-ok" />{k}</span><span>{paid ? cedi(paid.amount) : "Recorded"}</span></div>
          : <FeeRow key={k} parcel={parcel} kind={k} canRecord={registrar} />;
      })}
    </div>
  );
}

function FeeRow({ parcel, kind, canRecord }: { parcel: Parcel; kind: FeeKind; canRecord: boolean }) {
  const [price, setPrice] = useState("");
  const consideration = Number(price.replace(/[^0-9.]/g, "")) || 0;
  const suggested = estimateFee(kind, parcel.acres, consideration);
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState("");
  const value = Number(amount.replace(/[^0-9.]/g, "")) || suggested;
  return (
    <div className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex items-center gap-2 font-medium"><Circle className="size-4 text-warn" />{kind}<span className="font-normal text-muted-foreground">· paid to {FEE_INFO[kind].paidTo}</span></div>
      <p className="text-xs text-muted-foreground">{FEE_INFO[kind].how}. Estimate only: enter the amount on the official receipt.</p>
      {canRecord ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {kind === "Stamp duty" && <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price paid for the land (GH¢)" inputMode="numeric" />}
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={suggested ? `Amount (suggested ${cedi(suggested)})` : "Amount (GH¢)"} inputMode="decimal" />
          <Input value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder="Official receipt no." />
          <Button size="sm" disabled={!value || !receipt.trim()} onClick={() => landchain.recordPayment(parcel.id, kind, value, receipt)}>Record {value ? cedi(value) : ""}</Button>
        </div>
      ) : <p className="text-xs text-muted-foreground">Waiting for the registrar to record it.</p>}
    </div>
  );
}
