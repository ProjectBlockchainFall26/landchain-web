import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Bell,
  Check,
  ChevronDown,
  Map as MapIcon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  ShieldCheck,
  User,
  X,
  LandPlot,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useMe,
  useChain,
  switchAccount,
  signOut,
  connectWallet,
  reloadChain,
} from "@/lib/landchain/store";
import { API_MODE } from "@/lib/landchain/api/config";
import { hasMetaMask } from "@/lib/landchain/chain/client";
import { getParcel } from "@/lib/landchain/engine";
import { fmtDate, blockNo } from "@/lib/landchain/format";
import { pendingCountFor } from "@/lib/landchain/queue";
import { useEnquiries } from "@/lib/landchain/enquiries";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const NAV = [
  {
    group: "Land",
    items: [
      { to: "/", label: "Land Map", icon: MapIcon },
      { to: "/parcels", label: "My Parcels", icon: LandPlot },
      { to: "/register", label: "Register Land", icon: Plus },
    ],
  },
  {
    group: "Lands Commission",
    items: [{ to: "/review", label: "Review Queue", icon: Check, badge: true }],
  },
  {
    group: "Account",
    items: [{ to: "/identity", label: "Identity", icon: User }],
  },
  {
    group: "Records",
    items: [
      { to: "/verify", label: "Verify a Title", icon: ShieldCheck },
      { to: "/activity", label: "Activity Log", icon: Activity },
      { to: "/assumptions", label: "Assumptions", icon: Info },
    ],
  },
] as const;

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <LandPlot className="size-4" />
      </span>
      {!compact && (
        <span className="text-lg font-semibold tracking-tight">LandChain</span>
      )}
    </div>
  );
}

function Sidebar({
  collapsed,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const { s, me } = useMe();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const queueCount = pendingCountFor(s, null);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <Logo compact={collapsed} />
        {onToggle && (
          <button
            onClick={onToggle}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Collapse sidebar"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {NAV.map((g) => (
          <div key={g.group}>
            {!collapsed && (
              <div className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {g.group}
              </div>
            )}
            {g.items.map((it) => {
              const active =
                it.to === "/" ? path === "/" : path.startsWith(it.to);
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  onClick={onNavigate}
                  title={it.label}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-muted",
                  )}
                >
                  <it.icon className="size-4 shrink-0" />
                  {!collapsed && <span className="flex-1">{it.label}</span>}
                  {!collapsed && "badge" in it && queueCount > 0 && (
                    <span className="grid size-5 place-items-center rounded-full bg-bad text-[11px] font-semibold text-primary-foreground">
                      {queueCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      {!collapsed && <ChainCard />}
      <p className="sr-only">Signed in as {me.name}</p>
    </div>
  );
}

/** Chain mode: which chain, its latest block, and whether the contracts can be reached. */
function ChainCard() {
  const { state: s, status } = useChain();
  const dot =
    status.kind === "ok"
      ? "bg-ok"
      : status.kind === "error"
        ? "bg-bad"
        : "bg-muted-foreground";
  const name = status.name;
  return (
    <div className="m-3 rounded-xl border p-3 text-xs">
      <div className="flex items-center gap-1.5">
        <span className={cn("size-2 rounded-full", dot)} />
        <span className="font-medium">{name}</span>
        {status.kind === "ok" && (
          <span className="text-muted-foreground">
            · block {blockNo(s.block)}
          </span>
        )}
      </div>
      {status.kind === "ok" && (
        <p className="mt-2 text-muted-foreground">
          {API_MODE
            ? "Through the LandChain API (indexed from the contracts). Every action is a real transaction."
            : "Live LandChain contracts. Every action is a real transaction."}
        </p>
      )}
      {status.kind === "loading" && (
        <p className="mt-2 text-muted-foreground">
          {API_MODE
            ? "Reading the register from the LandChain API…"
            : "Reading the contracts…"}
        </p>
      )}
      {status.kind === "error" && (
        <p className="mt-2 text-bad">{status.error}</p>
      )}
      <button
        onClick={() => void reloadChain()}
        className="mt-3 font-medium text-primary hover:underline"
      >
        {API_MODE ? "Reload" : "Reload from chain"}
      </button>
    </div>
  );
}

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
export function roleLine(a: { kind: string; roles: string[]; id: string }) {
  if (a.kind === "public") return "No wallet, read only";
  if (a.kind === "officer") return `Lands Commission · ${a.roles.join(", ")}`;
  return `Citizen · ${a.id}`;
}

function AccountSwitcher() {
  const { s, me } = useMe();
  const navigate = useNavigate();
  // Backend mode: you can switch only to people you can sign in as (the seeded demo accounts) and yourself.
  const pickable = API_MODE
    ? s.accounts.filter((a) => a.kind === "public" || a.email || a.id === me.id)
    : s.accounts;
  const groups = [
    { label: "Citizens", list: pickable.filter((a) => a.kind === "citizen") },
    {
      label: "Lands Commission",
      list: pickable.filter((a) => a.kind === "officer"),
    },
    { label: "Public", list: pickable.filter((a) => a.kind === "public") },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-muted">
        <span className="grid size-9 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {initials(me.name) || "?"}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-medium">{me.name}</span>
          <span className="block text-xs text-muted-foreground">
            {roleLine(me)}
          </span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {groups.map((g, i) => (
          <div key={g.label}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {g.label}
            </DropdownMenuLabel>
            {g.list.map((a) => (
              <DropdownMenuItem
                key={a.id}
                onClick={() => {
                  switchAccount(a.id);
                  toast(`Now acting as ${a.name}`);
                }}
                className="flex items-center gap-2"
              >
                <span className="flex-1">
                  <span className="block text-sm">{a.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {roleLine(a)}
                  </span>
                </span>
                {a.id === me.id && <Check className="size-4 text-primary" />}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
        <DropdownMenuSeparator />
        {hasMetaMask() &&
          (!API_MODE || (me.kind === "citizen" && !me.address)) && (
            <DropdownMenuItem onClick={() => void connectWallet()}>
              {API_MODE ? "Link MetaMask wallet" : "Connect MetaMask"}
            </DropdownMenuItem>
          )}
        <DropdownMenuItem
          onClick={() => {
            signOut();
            navigate({ to: "/login", replace: true });
          }}
          className="text-bad"
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Notifications() {
  const { s, me } = useMe();
  const enquiries = useEnquiries()
    .filter((e) => e.to === me.id && e.status === "new")
    .map((e) => ({
      to: me.id,
      text: `New enquiry about ${e.parcelId} from ${e.name}. Open the title to read it.`,
      at: e.at,
    }));
  const mine = [
    ...enquiries,
    ...s.notifications.filter(
      (n) => n.to === me.id || me.roles.some((r) => n.to === `role:${r}`),
    ),
  ].slice(0, 8);
  const attention = pendingCountFor(s, me) > 0 || mine.length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative grid size-9 place-items-center rounded-lg hover:bg-muted"
        aria-label="Notifications"
      >
        <Bell className="size-5 text-muted-foreground" />
        {attention && (
          <span className="absolute right-2 top-2 size-2 rounded-full bg-bad" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {mine.length === 0 && (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            Nothing new.
          </p>
        )}
        {mine.map((n, i) => (
          <div key={i} className="px-2 py-2 text-sm">
            <p>{n.text}</p>
            <p className="text-xs text-muted-foreground">{fmtDate(n.at)}</p>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GlobalSearch() {
  const { s } = useMe();
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  return (
    <form
      className="relative hidden md:block"
      onSubmit={(e) => {
        e.preventDefault();
        const p = getParcel(s, q);
        if (p) {
          navigate({ to: "/title/$parcelId", params: { parcelId: p.id } });
          setQ("");
        } else toast.error(`No parcel called "${q}"`);
      }}
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search parcel ID"
        className="h-9 w-64 rounded-lg border bg-card pl-3 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <Search className="pointer-events-none absolute right-3 top-2.5 size-4 text-muted-foreground" />
    </form>
  );
}

export function Shell({
  title,
  children,
  full,
}: {
  title: string;
  children: ReactNode;
  full?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const { ready, signedIn } = useChain();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const open =
    path.startsWith("/verify") ||
    path.startsWith("/title/") ||
    path.startsWith("/assumptions");
  useEffect(() => {
    if (ready && !signedIn && !open) navigate({ to: "/login", replace: true });
  }, [ready, signedIn, open, navigate]);
  return (
    <div className="flex min-h-screen w-full">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 border-r bg-sidebar lg:block",
          collapsed ? "w-16" : "w-58",
        )}
      >
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />
      </aside>
      {mobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/30"
            onClick={() => setMobile(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-sidebar shadow-float">
            <button
              className="absolute right-3 top-4"
              onClick={() => setMobile(false)}
              aria-label="Close menu"
            >
              <X className="size-4" />
            </button>
            <Sidebar collapsed={false} onNavigate={() => setMobile(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-15 items-center gap-3 border-b bg-card px-4 lg:px-6">
          <button
            className="lg:hidden"
            onClick={() => setMobile(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <h1 className="flex-1 truncate text-lg font-semibold">{title}</h1>
          <GlobalSearch />
          <Notifications />
          <AccountSwitcher />
        </header>
        <main className={cn("flex-1", full ? "p-3 lg:p-6" : "p-4 lg:p-6")}>
          {children}
        </main>
      </div>
    </div>
  );
}
