import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, STATUS_TONE, type Tone } from "@/lib/landchain/format";
import type { ParcelStatus } from "@/lib/landchain/types";

const TONE: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-neutral",
};
const DOT: Record<Tone, string> = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-info", neutral: "bg-neutral" };

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONE[tone], className)}>{children}</span>;
}
export function Dot({ tone, className }: { tone: Tone; className?: string }) {
  return <span className={cn("inline-block size-2 rounded-full", DOT[tone], className)} />;
}
export function StatusPill({ status }: { status: ParcelStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>;
}
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[0.8em]", className)}>{children}</span>;
}

export function Card({ title, right, children, className, badge }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; badge?: number }) {
  return (
    <section className={cn("rounded-xl border bg-card", className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            {title}
            {badge !== undefined && <span className={cn("rounded-full px-1.5 text-xs font-medium", badge ? "bg-bad-soft text-bad" : "bg-muted text-muted-foreground")}>{badge}</span>}
          </h2>
          {right && <div className="text-sm text-muted-foreground">{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Section({ icon, title, summary, summaryTone, defaultOpen, children, highlight }: {
  icon: ReactNode; title: string; summary?: ReactNode; summaryTone?: Tone; defaultOpen?: boolean; children?: ReactNode; highlight?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const toneText: Record<Tone, string> = { ok: "text-ok", warn: "text-warn", bad: "text-bad", info: "text-info", neutral: "text-muted-foreground" };
  return (
    <div className={cn("rounded-xl border bg-card", highlight && open && "border-ok/40")}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-3 py-3 text-left" aria-expanded={open}>
        <span className="grid size-7 place-items-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4">{icon}</span>
        <span className="flex-1 font-medium">{title}</span>
        {summary && <span className={cn("text-sm", toneText[summaryTone ?? "neutral"])}>{summary}</span>}
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && children && <div className="space-y-2 px-3 pb-3">{children}</div>}
    </div>
  );
}

export function Row({ icon, label, children }: { icon?: ReactNode; label: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
      {icon && <span className="grid size-6 place-items-center rounded bg-muted text-muted-foreground [&_svg]:size-3.5">{icon}</span>}
      <span className="flex-1">{label}</span>
      <span className="flex items-center gap-2 text-muted-foreground">{children}</span>
    </div>
  );
}

export function Stat({ label, value, icon, sub }: { label: string; value: ReactNode; icon?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">{icon}<span>{label}</span></div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-4 text-sm text-muted-foreground">{children}</p>;
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground", className)}>{children}</th>;
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}
