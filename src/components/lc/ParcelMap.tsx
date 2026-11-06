import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Layers, LocateFixed, Maximize, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { centroid, pointInPolygon, project, toDMS, unproject, type LatLng } from "@/lib/landchain/geo";
import type { Parcel, ParcelStatus } from "@/lib/landchain/types";

const FILL: Record<ParcelStatus, string> = {
  for_sale: "fill-ok/25 stroke-ok",
  in_escrow: "fill-warn/40 stroke-warn",
  sold: "fill-bad/20 stroke-bad",
  pending: "fill-neutral/20 stroke-neutral",
  frozen: "fill-info/25 stroke-info",
  verified: "fill-neutral/25 stroke-neutral",
  rejected: "fill-bad/10 stroke-bad",
};
const PIN: Record<ParcelStatus, string> = {
  for_sale: "fill-primary", in_escrow: "fill-warn", sold: "fill-bad", pending: "fill-neutral",
  frozen: "fill-info", verified: "fill-neutral", rejected: "fill-bad",
};

function rand(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface View { cx: number; cy: number; w: number }

export interface ParcelMapProps {
  parcels: Parcel[];
  selectedId?: string | undefined;
  onSelect?: (id: string) => void | undefined;
  focusId?: string | undefined;
  draft?: LatLng[] | undefined;
  onMapClick?: (ll: LatLng) => void | undefined;
  defaultSatellite?: boolean | undefined;
  showToggle?: "segmented" | "dropdown" | undefined;
  label?: ReactNode | undefined;
  overlay?: ReactNode | undefined;
  topRight?: ReactNode | undefined;
  className?: string | undefined;
}

export function ParcelMap({
  parcels, selectedId, onSelect, focusId, draft, onMapClick, defaultSatellite, showToggle = "segmented", label, overlay, topRight, className,
}: ParcelMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [sat, setSat] = useState(!!defaultSatellite);
  const [cursor, setCursor] = useState<LatLng | null>(null);

  const fit = (ids?: string[]): View => {
    const list = ids ? parcels.filter((p) => ids.includes(p.id)) : parcels;
    const pts = list.flatMap((p) => p.pillars.map(project));
    if (!pts.length) return { cx: 0, cy: 0, w: 2600 };
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = ids ? 2.6 : 1.15;
    const aspect = size.h / size.w;
    const w = Math.max((maxX - minX) * pad, ((maxY - minY) * pad) / aspect, 400);
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w };
  };
  const [view, setView] = useState<View>(() => ({ cx: 0, cy: 0, w: 2800 }));
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setSize({ w: e.contentRect.width || 800, h: e.contentRect.height || 600 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setView(fit(focusId ? [focusId] : undefined)); }, [focusId, size.w > 0 && Math.round(size.h / size.w * 20)]); // eslint-disable-line react-hooks/exhaustive-deps

  const h = (view.w * size.h) / size.w;
  const k = view.w / size.w; // metres per pixel

  const toWorld = (clientX: number, clientY: number): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    const v = viewRef.current;
    const kk = v.w / r.width;
    return [v.cx - v.w / 2 + (clientX - r.left) * kk, v.cy - (v.w * r.height) / r.width / 2 + (clientY - r.top) * kk];
  };
  const zoomAt = (factor: number, wx?: number, wy?: number) => {
    setView((v) => {
      const nw = Math.min(8000, Math.max(150, v.w / factor));
      const kk = nw / v.w;
      const ax = wx ?? v.cx, ay = wy ?? v.cy;
      return { w: nw, cx: ax - (ax - v.cx) * kk, cy: ay - (ay - v.cy) * kk };
    });
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const [wx, wy] = toWorld(e.clientX, e.clientY);
      zoomAt(Math.exp(-dy * 0.0018), wx, wy);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const drag = useRef<{ x: number; y: number; moved: boolean; v: View } | null>(null);

  const bg = useMemo(() => {
    const patches: { pts: string; c: number }[] = [];
    const S = 260;
    const jit = (i: number, j: number) => [i * S + (rand(i * 97 + j) - 0.5) * S * 0.7, j * S + (rand(j * 89 + i * 7) - 0.5) * S * 0.7];
    for (let i = -14; i < 14; i++)
      for (let j = -12; j < 12; j++) {
        const a = jit(i, j), b = jit(i + 1, j), c = jit(i + 1, j + 1), d = jit(i, j + 1);
        patches.push({ pts: [a, b, c, d].map((p) => p.join(",")).join(" "), c: Math.floor(rand(i * 31 + j * 17) * 3) });
      }
    const trees = Array.from({ length: 260 }, (_, i) => [(rand(i * 3.1) - 0.5) * 7000, (rand(i * 5.7) - 0.5) * 6000, 8 + rand(i) * 14]);
    const fields = Array.from({ length: 28 }, (_, i) => {
      const cx = (rand(i * 2.3) - 0.5) * 6000, cy = (rand(i * 4.1) - 0.5) * 5000, r = 200 + rand(i * 9) * 300;
      return [0, 1, 2].map((t) => `${cx + Math.cos(t * 2.1 + i) * r},${cy + Math.sin(t * 2.1 + i) * r}`).join(" ");
    });
    return { patches, trees, fields };
  }, []);

  const satFill = ["fill-sat-1", "fill-sat-2", "fill-sat-3"];
  const btn = "grid size-8 place-items-center rounded-lg border bg-card shadow-float hover:bg-muted";
  const focus = focusId ? parcels.find((p) => p.id === focusId) : undefined;
  const pts = (ll: LatLng[]) => ll.map((p) => project(p).join(",")).join(" ");

  return (
    <div ref={ref} className={cn("relative h-full min-h-[420px] w-full touch-none select-none overflow-hidden rounded-xl border", sat ? "bg-sat-1" : "bg-map-land", onMapClick ? "cursor-crosshair" : "cursor-grab", className)}
      onPointerDown={(e) => { if ((e.target as HTMLElement).closest("[data-ctl]")) return; drag.current = { x: e.clientX, y: e.clientY, moved: false, v: viewRef.current }; }}
      onPointerMove={(e) => {
        if (ref.current && !(e.target as HTMLElement).closest("[data-ctl]")) setCursor(unproject(toWorld(e.clientX, e.clientY)));
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
        if (d.moved) { const kk = d.v.w / size.w; setView({ ...d.v, cx: d.v.cx - dx * kk, cy: d.v.cy - dy * kk }); }
      }}
      onPointerUp={(e) => {
        const d = drag.current; drag.current = null;
        if (!d || d.moved || (e.target as HTMLElement).closest("[data-ctl]")) return;
        const ll = unproject(toWorld(e.clientX, e.clientY));
        if (onMapClick) onMapClick(ll);
        else if (onSelect) { const hit = parcels.find((p) => pointInPolygon(ll, p.pillars)); if (hit) onSelect(hit.id); }
      }}
      onPointerLeave={() => { drag.current = null; setCursor(null); }}
    >
      <svg className="absolute inset-0 size-full" viewBox={`${view.cx - view.w / 2} ${view.cy - h / 2} ${view.w} ${h}`} preserveAspectRatio="xMidYMid slice">
        {sat ? (
          <g>
            {bg.patches.map((p, i) => <polygon key={i} points={p.pts} className={cn(satFill[p.c], "stroke-sat-3/40")} strokeWidth={2} />)}
            <path d="M-4000,-1500 L4000,900" className="stroke-map-road/50" strokeWidth={16} fill="none" />
            <path d="M600,-3000 L300,3000" className="stroke-map-road/40" strokeWidth={10} fill="none" />
            {bg.trees.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} className="fill-sat-3" opacity={0.85} />)}
          </g>
        ) : (
          <g>
            {bg.fields.map((f, i) => <polygon key={i} points={f} className="fill-map-field" opacity={0.6} />)}
            <ellipse cx={-150} cy={-80} rx={380} ry={560} className="fill-map-village" />
            <ellipse cx={-1250} cy={1050} rx={520} ry={420} className="fill-map-village" />
            <path d="M-1400,-1900 C-1300,-900 -500,-1200 -300,-600 S 300,300 -200,700 S -1200,1400 -900,2600" className="stroke-map-water" strokeWidth={22} fill="none" strokeLinecap="round" />
            <path d="M-4000,700 C-1500,900 1000,600 4000,-100" className="stroke-map-road" strokeWidth={30} fill="none" />
            <path d="M700,-3000 C760,-500 820,800 760,3000" className="stroke-card" strokeWidth={14} fill="none" />
            <text x={-150} y={260} textAnchor="middle" className="fill-muted-foreground" fontSize={k * 11} letterSpacing={k * 3}>NORTH QUARTER</text>
            <text x={-1250} y={1150} textAnchor="middle" className="fill-muted-foreground" fontSize={k * 14} letterSpacing={k * 3}>BEREKUSO</text>
          </g>
        )}
        {parcels.map((p) => {
          const sel = p.id === selectedId || p.id === focusId;
          return (
            <polygon key={p.id} points={pts(p.pillars)} vectorEffect="non-scaling-stroke" strokeWidth={sel ? 2.5 : 1.25}
              className={cn(sel && p.status !== "in_escrow" ? "fill-primary/40 stroke-primary" : FILL[p.status], onSelect && "cursor-pointer")} />
          );
        })}
        {!focusId && parcels.map((p) => {
          const [x, y] = project(centroid(p.pillars));
          const sel = p.id === selectedId;
          return (
            <g key={p.id + "pin"} className="pointer-events-none">
              {sel && <circle cx={x} cy={y} r={k * 26} className="fill-primary/25" />}
              <circle cx={x} cy={y} r={k * 15} className={cn(PIN[p.status], "stroke-card")} strokeWidth={k * 2.5} />
              <text x={x} y={y + k * 4} textAnchor="middle" fontSize={k * 11} fontWeight={600} className="fill-primary-foreground">{parseInt(p.id.slice(-4), 10)}</text>
            </g>
          );
        })}
        {draft && draft.length > 0 && (
          <g className="pointer-events-none">
            <polygon points={pts(draft)} className="fill-draw/35 stroke-draw" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
            {draft.map((ll, i) => { const [x, y] = project(ll); return <circle key={i} cx={x} cy={y} r={k * 6} className="fill-card stroke-draw" strokeWidth={k * 3} />; })}
          </g>
        )}
      </svg>

      {focus && label && (() => {
        const top = focus.pillars.map(project).reduce((a, b) => (b[1] < a[1] ? b : a));
        const left = (top[0] - (view.cx - view.w / 2)) / k, topPx = (top[1] - (view.cy - h / 2)) / k;
        return <div data-ctl className="absolute -translate-x-1/2 -translate-y-[115%] rounded-lg bg-card px-3 py-2 text-sm shadow-float" style={{ left, top: topPx }}>{label}</div>;
      })()}

      <div data-ctl className="absolute left-3 top-3 flex items-center gap-2">
        {showToggle === "segmented" ? (
          <>
            <button className={btn} aria-label="Fit to view" onClick={() => setView(fit(focusId ? [focusId] : undefined))}><Maximize className="size-4" /></button>
            <div className="flex rounded-lg border bg-card p-0.5 text-sm shadow-float">
              {["Map", "Satellite"].map((m, i) => (
                <button key={m} onClick={() => setSat(i === 1)} className={cn("rounded-md px-3 py-1", sat === (i === 1) ? "bg-muted font-medium" : "text-muted-foreground")}>{m}</button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-card px-2.5 py-1.5 font-mono text-xs shadow-float">
            {cursor ? `${toDMS(cursor[0], "N", "S")} ${toDMS(cursor[1], "E", "W")}` : "Move over the map"}
            <span className="rounded bg-foreground px-1.5 text-background">{Math.round(k * 100)} m</span>
          </div>
        )}
      </div>
      <div data-ctl className="absolute right-3 top-3 flex items-center gap-2">
        {topRight}
        {showToggle === "dropdown" && (
          <button onClick={() => setSat(!sat)} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm shadow-float"><Layers className="size-4" />{sat ? "Satellite" : "Map"}</button>
        )}
      </div>
      <div data-ctl className="absolute bottom-3 left-3 flex flex-col gap-2">
        <button className={btn} aria-label="Locate" onClick={() => setView(fit(focusId ? [focusId] : undefined))}><LocateFixed className="size-4" /></button>
        <div className="flex flex-col overflow-hidden rounded-lg border bg-card shadow-float">
          <button className="grid size-8 place-items-center hover:bg-muted" aria-label="Zoom in" onClick={() => zoomAt(1.4)}><Plus className="size-4" /></button>
          <button className="grid size-8 place-items-center border-t hover:bg-muted" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.4)}><Minus className="size-4" /></button>
        </div>
        <button className={btn} aria-label="Toggle layers" onClick={() => setSat(!sat)}><Layers className="size-4" /></button>
      </div>
      {overlay && <div data-ctl className="absolute inset-x-14 bottom-3 flex flex-wrap justify-center gap-2">{overlay}</div>}
    </div>
  );
}

export function MapChip({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-card px-3 py-2 shadow-float">
      <span className="grid size-7 place-items-center rounded-md bg-ok-soft text-ok [&_svg]:size-4">{icon}</span>
      <span className="leading-tight"><span className="block text-[11px] text-muted-foreground">{label}</span><span className="block text-sm font-medium">{value}</span></span>
    </div>
  );
}
