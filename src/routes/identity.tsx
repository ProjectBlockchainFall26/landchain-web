import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { Shell } from "@/components/lc/Shell";
import { Mono, Pill } from "@/components/lc/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { landchain, useMe } from "@/lib/landchain/store";
import { hashCard } from "@/lib/landchain/engine";

export const Route = createFileRoute("/identity")({
  head: () => ({
    meta: [
      { title: "Verify your identity · LandChain Ghana" },
      { name: "description", content: "Link your Ghana Card privately to register and buy land on LandChain." },
      { property: "og:title", content: "Verify your identity · LandChain Ghana" },
      { property: "og:description", content: "Your Ghana Card is hashed — never stored or shown." },
    ],
  }),
  component: Identity,
});

function Identity() {
  const { me } = useMe();
  const [card, setCard] = useState("");
  const [cit, setCit] = useState<"citizen" | "non-citizen">("citizen");
  const valid = /^GHA-\d{9}-\d$/i.test(card.trim());
  const tone = me.identity === "verified" ? "ok" : me.identity === "pending" ? "warn" : me.identity === "rejected" ? "bad" : "neutral";
  const label = { verified: "Verified", pending: "Pending", rejected: "Rejected", none: "Not submitted" }[me.identity];
  return (
    <Shell title="Identity">
      <div className="mx-auto max-w-lg rounded-xl border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-ok-soft text-ok"><ShieldCheck className="size-5" /></span>
          <div className="flex-1"><h2 className="font-semibold">Your identity</h2><p className="text-sm text-muted-foreground">Public ID <Mono>{me.id}</Mono></p></div>
          <Pill tone={tone}>{label}</Pill>
        </div>
        {me.kind !== "citizen" ? <p className="mt-4 text-sm text-muted-foreground">Only citizen accounts need identity verification.</p>
          : me.identity === "verified" ? <p className="mt-4 text-sm">You're verified. You can register and buy land.</p>
          : me.identity === "pending" ? <p className="mt-4 text-sm">Waiting for an identity officer to review your profile.</p>
          : (
            <form className="mt-5 space-y-4" onSubmit={async (e) => {
              e.preventDefault();
              const hash = hashCard(card);
              const r = await landchain.submitIdentity(hash, cit);
              if (r.ok) setCard("");
            }}>
              <label className="block text-sm">Ghana Card number
                <Input className="mt-1" value={card} onChange={(e) => setCard(e.target.value)} placeholder="GHA-123456789-0" autoComplete="off" /></label>
              <p className="text-xs text-muted-foreground">It's hashed in your browser before anything is sent. The number is never stored or shown again.</p>
              <RadioGroup value={cit} onValueChange={(v) => setCit(v as "citizen" | "non-citizen")} className="flex gap-6">
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="citizen" />Ghanaian citizen</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="non-citizen" />Non-citizen</label>
              </RadioGroup>
              <Button type="submit" disabled={!valid}>Submit for verification</Button>
            </form>
          )}
      </div>
    </Shell>
  );
}
