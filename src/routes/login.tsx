import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, Landmark, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/lc/Shell";
import { Mono } from "@/components/lc/ui";
import { Button } from "@/components/ui/button";
import { connectWallet, signInAs, useChain } from "@/lib/landchain/store";
import { chainName, IS_LOCAL } from "@/lib/landchain/chain/config";
import { hasMetaMask } from "@/lib/landchain/chain/client";
import type { Account } from "@/lib/landchain/types";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in · LandChain Ghana" },
      { name: "description", content: "Sign in to LandChain to register land and verify titles." },
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

function Login() {
  return <ChainLogin />;
}

function Hero() {
  return (
    <div className="flex flex-col justify-between bg-primary p-8 text-primary-foreground lg:p-12">
      <div className="flex items-center gap-2.5 text-lg font-semibold"><span className="grid size-8 place-items-center rounded-lg bg-primary-foreground/15"><Landmark className="size-4" /></span>LandChain</div>
      <div className="my-10 max-w-md">
        <h1 className="text-3xl font-semibold leading-tight lg:text-4xl">One plot. One title. One owner.</h1>
        <p className="mt-3 text-primary-foreground/80">Your land, registered by the Lands Commission and recorded on the blockchain, where no one can quietly change who owns it.</p>
      </div>
      <p className="flex items-center gap-2 text-sm text-primary-foreground/70"><ShieldCheck className="size-4" />Your Ghana Card number is hashed in your browser and never stored.</p>
    </div>
  );
}

/** Chain mode: your identity is your wallet. Citizens connect MetaMask; on a local chain, demo accounts need no wallet. */
function ChainLogin() {
  const { state: s, status } = useChain();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const demo = s.accounts.filter((a) => a.address && a.kind !== "public");
  const groups: [string, Account[]][] = [
    ["Citizens", demo.filter((a) => a.kind === "citizen")],
    ["Lands Commission", demo.filter((a) => a.kind === "officer")],
  ];
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <Hero />
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden"><Logo /></div>
          <h2 className="mt-6 text-2xl font-semibold lg:mt-0">Sign in with your wallet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Connected to <b className="text-foreground">{chainName}</b>. Every action is a real transaction on the LandChain contracts.</p>

          {status.kind === "error" && <p className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad" role="alert">{status.error}</p>}

          <Button className="mt-6 w-full" disabled={busy || !hasMetaMask()} onClick={async () => {
            setBusy(true);
            const r = await connectWallet();
            setBusy(false);
            if (r.ok) navigate({ to: "/", replace: true });
          }}>{busy ? "Waiting for MetaMask…" : hasMetaMask() ? "Connect MetaMask" : "MetaMask not installed"}</Button>
          <p className="mt-2 text-xs text-muted-foreground">New here? Connect, then link your Ghana Card on the Identity page.</p>

          {IS_LOCAL && (
            <div className="mt-8 rounded-xl border bg-card p-4 text-xs">
              <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">Demo accounts · no wallet needed</div>
              <p className="mb-2 text-muted-foreground">Ganache's unlocked accounts sign for these. Lands Commission accounts stand in for the wallets the backend will hold.</p>
              {demo.length === 0 && <p className="text-muted-foreground">{status.kind === "loading" ? "Loading accounts from the chain…" : "No demo accounts found. Run npm run setup:local in landchain-contracts, then npm run contracts:sync here."}</p>}
              {groups.map(([label, list]) => list.length > 0 && (
                <div key={label} className="mt-2">
                  <div className="px-1.5 pb-1 text-muted-foreground">{label}</div>
                  {list.map((a) => (
                    <button key={a.id} type="button" onClick={() => { signInAs(a.id); navigate({ to: a.kind === "officer" ? "/review" : "/", replace: true }); }}
                      className="flex w-full justify-between rounded px-1.5 py-1 text-left hover:bg-muted">
                      <span>{a.name}</span><Mono>{a.kind === "officer" ? a.roles.join(", ") : a.id}</Mono>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          <Button variant="outline" className="mt-6 w-full" onClick={() => { signInAs("public"); navigate({ to: "/verify" }); }}>
            <Eye className="size-4" />Continue as public visitor (read only)
          </Button>
        </div>
      </div>
    </div>
  );
}
