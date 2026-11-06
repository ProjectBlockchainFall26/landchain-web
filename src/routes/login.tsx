import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CreditCard, Eye, Landmark, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/lc/Shell";
import { Mono } from "@/components/lc/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authService, signInAs, useChain } from "@/lib/landchain/store";
import { DEMO_CARDS, DEMO_PIN, PUBLIC, STAFF_PIN } from "@/lib/landchain/seed";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in · LandChain Ghana" },
      { name: "description", content: "Sign in to LandChain with your Ghana Card to register, buy and sell land." },
      { property: "og:title", content: "Sign in · LandChain Ghana" },
      { property: "og:description", content: "Sign in with your Ghana Card. Your card number is hashed, never stored." },
    ],
  }),
  component: Login,
});

/** Formats raw input as GHA-XXXXXXXXX-X while typing. */
export function formatCard(raw: string) {
  const digits = raw.toUpperCase().replace(/^GHA/, "").replace(/\D/g, "").slice(0, 10);
  if (!digits) return raw.toUpperCase().startsWith("G") ? raw.toUpperCase().slice(0, 4) : "";
  return `GHA-${digits.slice(0, 9)}${digits.length > 9 ? `-${digits.slice(9)}` : ""}`;
}
const CARD_RE = /^GHA-\d{9}-\d$/;

function Login() {
  const { state: s } = useChain();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"card" | "staff" | "register">("card");
  const [card, setCard] = useState("");
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [cit, setCit] = useState<"citizen" | "non-citizen">("citizen");
  const [staff, setStaff] = useState("LC-registrar");
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const officers = s.accounts.filter((a) => a.kind === "officer");

  const go = async (fn: () => Promise<{ ok: boolean; error?: string | undefined }>) => {
    setBusy(true); setErr(undefined);
    const r = await fn();
    setBusy(false);
    if (r.ok) navigate({ to: "/", replace: true }); else setErr(r.error);
  };
  const pinOk = /^\d{4}$/.test(pin);

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col justify-between bg-primary p-8 text-primary-foreground lg:p-12">
        <div className="flex items-center gap-2.5 text-lg font-semibold"><span className="grid size-8 place-items-center rounded-lg bg-primary-foreground/15"><Landmark className="size-4" /></span>LandChain</div>
        <div className="my-10 max-w-md">
          <h1 className="text-3xl font-semibold leading-tight lg:text-4xl">One plot. One title. One owner.</h1>
          <p className="mt-3 text-primary-foreground/80">Ghana's land titles, signed off by surveyor, lawyer and registrar — and sold only through escrow the registrar approves.</p>
        </div>
        <p className="flex items-center gap-2 text-sm text-primary-foreground/70"><ShieldCheck className="size-4" />Your Ghana Card number is hashed in your browser and never stored.</p>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden"><Logo /></div>
          <h2 className="mt-6 text-2xl font-semibold lg:mt-0">
            {mode === "card" ? "Sign in with your Ghana Card" : mode === "staff" ? "Lands Commission staff" : "Register your Ghana Card"}
          </h2>

          <form className="mt-6 space-y-4" onSubmit={(e) => {
            e.preventDefault();
            if (mode === "card") void go(() => authService.login(card, pin));
            else if (mode === "staff") void go(() => authService.staffLogin(staff, pin));
            else void go(() => authService.register(name, card, pin, cit));
          }}>
            {mode === "register" && (
              <label className="block text-sm">Full name<Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Efua Mensah" /></label>
            )}
            {mode !== "staff" ? (
              <label className="block text-sm">Ghana Card number
                <div className="relative mt-1">
                  <CreditCard className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <Input className="pl-9 font-mono" value={card} onChange={(e) => setCard(formatCard(e.target.value))} placeholder="GHA-123456789-0" autoComplete="off" inputMode="numeric" />
                </div>
              </label>
            ) : (
              <label className="block text-sm">Role
                <Select value={staff} onValueChange={setStaff}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{officers.map((o) => <SelectItem key={o.id} value={o.id}>{o.roles.join(", ")} · {o.name}</SelectItem>)}</SelectContent>
                </Select>
              </label>
            )}
            <label className="block text-sm">{mode === "staff" ? "Staff PIN" : mode === "register" ? "Choose a 4-digit PIN" : "PIN"}
              <Input className="mt-1 tracking-[0.4em]" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" /></label>
            {mode === "register" && (
              <RadioGroup value={cit} onValueChange={(v) => setCit(v as "citizen" | "non-citizen")} className="flex gap-6">
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="citizen" />Ghanaian citizen</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="non-citizen" />Non-citizen</label>
              </RadioGroup>
            )}
            {err && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad" role="alert">{err}</p>}
            <Button type="submit" className="w-full" disabled={busy || !pinOk || (mode !== "staff" && !CARD_RE.test(card)) || (mode === "register" && name.trim().length < 2)}>
              {busy ? "Checking…" : mode === "register" ? "Create profile" : "Sign in"}
            </Button>
          </form>

          <div className="mt-4 space-y-2 text-sm">
            {mode !== "card" && <button className="block text-primary hover:underline" onClick={() => { setMode("card"); setErr(undefined); setPin(""); }}>← Sign in with Ghana Card</button>}
            {mode === "card" && <button className="block text-primary hover:underline" onClick={() => { setMode("register"); setErr(undefined); setPin(""); }}>New here? Register your Ghana Card</button>}
            {mode !== "staff" && <button className="block text-muted-foreground hover:text-foreground" onClick={() => { setMode("staff"); setErr(undefined); setPin(""); }}>Lands Commission staff sign-in</button>}
          </div>

          <Button variant="outline" className="mt-6 w-full" onClick={() => { signInAs(PUBLIC); navigate({ to: "/verify" }); }}>
            <Eye className="size-4" />Continue as public visitor (read only)
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">Or just <Link to="/verify" className="underline">verify a title</Link> without signing in.</p>

          <div className="mt-8 rounded-xl border bg-card p-4 text-xs">
            <div className="mb-2 font-semibold uppercase tracking-wide text-muted-foreground">Demo cards · PIN {DEMO_PIN}</div>
            <div className="space-y-1">
              {DEMO_CARDS.map((d) => (
                <button key={d.card} type="button" onClick={() => { setMode("card"); setCard(d.card); setPin(DEMO_PIN); setErr(undefined); }}
                  className={cn("flex w-full justify-between rounded px-1.5 py-1 text-left hover:bg-muted", card === d.card && "bg-accent")}>
                  <span>{d.name}</span><Mono>{d.card}</Mono>
                </button>
              ))}
            </div>
            <p className="mt-2 text-muted-foreground">Staff PIN for every Lands Commission role: {STAFF_PIN}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
