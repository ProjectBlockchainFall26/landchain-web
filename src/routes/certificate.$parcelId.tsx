// Printable title certificate (one A4 page). Everything on it comes from the chain (through the API in backend
// mode); the QR code opens the public title record, where anyone can check the certificate is still current.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Printer } from "lucide-react";
import QRCode from "qrcode";
import { Shell } from "@/components/lc/Shell";
import { Mono } from "@/components/lc/ui";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/landchain/store";
import { getHistory, getParcel } from "@/lib/landchain/engine";
import { fmtDate, shortHash } from "@/lib/landchain/format";
import { shownName } from "@/lib/landchain/privacy";
import { toDMS, type LatLng } from "@/lib/landchain/geo";
import { chainName, deployment, EXPLORER } from "@/lib/landchain/chain/config";

export const Route = createFileRoute("/certificate/$parcelId")({
  head: ({ params }) => ({
    meta: [
      { title: `Title certificate · ${params.parcelId} · LandChain Ghana` },
      {
        name: "description",
        content: `Printable title certificate for land parcel ${params.parcelId}, verifiable on chain.`,
      },
    ],
  }),
  component: CertificatePage,
});

/** The boundary as an SVG polygon, north up, scaled to fit (equirectangular, longitude scaled by cos(latitude)). */
function BoundarySketch({ pillars }: { pillars: LatLng[] }) {
  const W = 260,
    H = 200,
    pad = 22;
  const lat0 = pillars.reduce((a, p) => a + p[0], 0) / pillars.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = pillars.map((p) => p[1] * k),
    ys = pillars.map((p) => p[0]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const scale = Math.min(
    (W - 2 * pad) / (maxX - minX || 1),
    (H - 2 * pad) / (maxY - minY || 1),
  );
  const ox = (W - (maxX - minX) * scale) / 2,
    oy = (H - (maxY - minY) * scale) / 2;
  const pts = pillars.map(
    (p) =>
      [
        ox + (p[1] * k - minX) * scale,
        H - (oy + (p[0] - minY) * scale),
      ] as const,
  );
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Boundary sketch"
    >
      <rect
        x="0.5"
        y="0.5"
        width={W - 1}
        height={H - 1}
        rx="6"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.2"
      />
      <polygon
        points={pts.map((q) => q.join(",")).join(" ")}
        fill="currentColor"
        fillOpacity="0.08"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="3" fill="currentColor" />
          <text x={x + 6} y={y - 6} fontSize="10" fill="currentColor">
            P{i + 1}
          </text>
        </g>
      ))}
      <text
        x={W - 16}
        y="18"
        fontSize="11"
        textAnchor="middle"
        fill="currentColor"
      >
        N
      </text>
      <path
        d={`M${W - 16} 22 L${W - 16} 40 M${W - 20} 27 L${W - 16} 22 L${W - 12} 27`}
        stroke="currentColor"
        fill="none"
      />
    </svg>
  );
}

function CertificatePage() {
  const { parcelId } = Route.useParams();
  const { s, me } = useMe();
  const p = getParcel(s, parcelId);
  const verifyUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/title/${parcelId}`
      : `/title/${parcelId}`;
  const [qr, setQr] = useState<string>();
  useEffect(() => {
    QRCode.toString(verifyUrl, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
    })
      .then(setQr)
      .catch(() => setQr(undefined));
  }, [verifyUrl]);
  const history = useMemo(() => (p ? getHistory(s, p.id) : []), [s, p]);
  const minted = history.find((h) => h.type === "Registration");
  const lastTransfer = [...history]
    .reverse()
    .find((h) => h.type === "Transfer");

  if (
    !p ||
    !p.titleNo ||
    (p.status !== "registered" && p.status !== "transfer_pending")
  ) {
    return (
      <Shell title="Title certificate">
        <div className="rounded-xl border bg-card p-6 text-center">
          <p className="font-medium">
            {p
              ? `${p.id} has no registered title yet, so there is no certificate.`
              : `No parcel called ${parcelId}.`}
          </p>
          <Link to="/verify" className="mt-2 inline-block text-sm text-primary">
            Search titles
          </Link>
        </div>
      </Shell>
    );
  }

  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[9.5rem_1fr] gap-2 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <Shell title={`Certificate · ${p.id}`}>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          to="/title/$parcelId"
          params={{ parcelId: p.id }}
          className="flex items-center gap-1 text-sm font-medium text-primary"
        >
          <ChevronLeft className="size-4" />
          Back to title
        </Link>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" />
          Print certificate
        </Button>
      </div>

      <article className="certificate mx-auto max-w-3xl rounded-xl border-2 border-foreground/80 bg-card p-8 print:max-w-none print:rounded-none print:border-[3px] print:p-6">
        <header className="border-b pb-4 text-center">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            LandChain Ghana · blockchain land register
          </div>
          <h1 className="mt-1 text-2xl font-semibold">Certificate of Title</h1>
          <div className="mt-1 text-lg font-semibold">
            GLT #{p.titleNo} · {p.id}
          </div>
          {p.status === "transfer_pending" && (
            <div className="mt-2 inline-block rounded-full bg-warn-soft px-3 py-0.5 text-xs font-medium text-warn">
              A transfer of this title is waiting for the registrar
            </div>
          )}
        </header>

        <section className="mt-4 grid gap-6 sm:grid-cols-[1fr_260px] print:grid-cols-[1fr_230px]">
          <div>
            {row(
              "Registered owner",
              <>
                <span className="font-medium">{shownName(s, me, p.owner)}</span>{" "}
                <Mono className="text-muted-foreground">{p.owner}</Mono>
              </>,
            )}
            {row("Interest", p.interest)}
            {row("Allodial holder", p.holder)}
            {row(
              "Location",
              p.location.includes(p.region)
                ? p.location
                : `${p.location} · ${p.region} Region`,
            )}
            {row("Plan number", <Mono>{p.planNumber}</Mono>)}
            {p.gpsAddress && row("GhanaPost GPS", <Mono>{p.gpsAddress}</Mono>)}
            {row("Area", `${p.acres.toFixed(2)} acres`)}
            {row("Registered", p.registeredAt ? fmtDate(p.registeredAt) : "—")}
            {lastTransfer && row("Last transfer", fmtDate(lastTransfer.at))}
            {row(
              "Previous owners",
              p.owners.length > 1
                ? p.owners
                    .slice(0, -1)
                    .map((o) => shownName(s, me, o))
                    .join(" → ")
                : "None (first registration)",
            )}
          </div>
          <div className="text-foreground">
            <BoundarySketch pillars={p.pillars} />
            <p className="mt-1 text-center text-xs text-muted-foreground">
              Boundary sketch, not to survey scale. {p.pillars.length} corner
              pillars.
            </p>
          </div>
        </section>

        <section className="mt-4">
          <h2 className="text-sm font-semibold">Boundary pillars</h2>
          <table className="mt-1 w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-0.5 pr-2">Pillar</th>
                <th className="pr-2">Latitude</th>
                <th>Longitude</th>
              </tr>
            </thead>
            <tbody>
              {p.pillars.map(([lat, lng], i) => (
                <tr key={i} className="border-t">
                  <td className="py-0.5 pr-2">P{i + 1}</td>
                  <td className="pr-2 font-mono">{toDMS(lat, "N", "S")}</td>
                  <td className="font-mono">{toDMS(lng, "E", "W")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {p.docs.length > 0 && (
          <section className="mt-4">
            <h2 className="text-sm font-semibold">
              Documents on record (SHA-256 fingerprints)
            </h2>
            <ul className="mt-1 space-y-0.5 text-xs">
              {p.docs.map((d) => (
                <li key={d.hash}>
                  {d.type} · <Mono>{d.hash}</Mono>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-5 grid gap-4 border-t pt-4 sm:grid-cols-[1fr_112px] print:grid-cols-[1fr_112px]">
          <div className="space-y-1 text-xs">
            <h2 className="text-sm font-semibold">Check this certificate</h2>
            <p>
              This title is an ERC-721 token held by the owner's wallet on{" "}
              {chainName}. Scan the code, or open <Mono>{verifyUrl}</Mono>, to
              see the live record. If the owner shown there differs from this
              page, this certificate is out of date.
            </p>
            <p className="text-muted-foreground">
              Title token #{p.titleNo} · record {p.recordId}
              {deployment?.contracts.TitleRegistry && (
                <>
                  {" "}
                  · TitleRegistry{" "}
                  <Mono>{shortHash(deployment.contracts.TitleRegistry)}</Mono>
                </>
              )}
              {minted?.tx && (
                <>
                  {" "}
                  · minted in tx{" "}
                  {EXPLORER ? (
                    <a
                      className="underline"
                      href={`${EXPLORER}/tx/${minted.tx}`}
                    >
                      <Mono>{shortHash(minted.tx)}</Mono>
                    </a>
                  ) : (
                    <Mono>{shortHash(minted.tx)}</Mono>
                  )}
                </>
              )}
            </p>
            <p className="text-muted-foreground">
              Printed {fmtDate(Date.now())}. Generated by LandChain, a student
              blockchain project; not a Lands Commission document.
            </p>
          </div>
          {qr && (
            <div
              className="size-28 text-foreground [&>svg]:size-full"
              aria-label="QR code to the public title record"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
          )}
        </section>
      </article>
    </Shell>
  );
}
