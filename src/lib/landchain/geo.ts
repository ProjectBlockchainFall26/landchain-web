// Geometry helpers. Points are [lat, lng] in degrees.
export type LatLng = [number, number];

export const ORIGIN: LatLng = [5.7505, -0.2275]; // Berekuso, Eastern Region
const M_PER_DEG_LAT = 110540;
const mPerDegLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

/** Project to local metres (x east, y south) for SVG. */
export function project([lat, lng]: LatLng): [number, number] {
  return [
    (lng - ORIGIN[1]) * mPerDegLng(ORIGIN[0]),
    -(lat - ORIGIN[0]) * M_PER_DEG_LAT,
  ];
}
export function unproject([x, y]: [number, number]): LatLng {
  return [ORIGIN[0] - y / M_PER_DEG_LAT, ORIGIN[1] + x / mPerDegLng(ORIGIN[0])];
}

export const SQM_PER_ACRE = 4046.8564;

export function areaAcres(pts: LatLng[]): number {
  if (pts.length < 3) return 0;
  const p = pts.map(project);
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i]!;
    const [x2, y2] = p[(i + 1) % p.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2 / SQM_PER_ACRE;
}

export function centroid(pts: LatLng[]): LatLng {
  const n = pts.length || 1;
  return [
    pts.reduce((s, p) => s + p[0], 0) / n,
    pts.reduce((s, p) => s + p[1], 0) / n,
  ];
}

// Ghana bounding box (approximate)
export function insideGhana([lat, lng]: LatLng) {
  return lat >= 4.5 && lat <= 11.2 && lng >= -3.3 && lng <= 1.3;
}

function segIntersect(a: number[], b: number[], c: number[], d: number[]) {
  const cross = (o: number[], p: number[], q: number[]) =>
    (p[0]! - o[0]!) * (q[1]! - o[1]!) - (p[1]! - o[1]!) * (q[0]! - o[0]!);
  const d1 = cross(c, d, a),
    d2 = cross(c, d, b),
    d3 = cross(a, b, c),
    d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
export function pointInPolygon(pt: LatLng, poly: LatLng[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i]!,
      [yj, xj] = poly[j]!;
    if (
      yi > pt[0] !== yj > pt[0] &&
      pt[1] < ((xj - xi) * (pt[0] - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}
export function polygonsOverlap(a: LatLng[], b: LatLng[]) {
  if (a.length < 3 || b.length < 3) return false;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++)
      if (
        segIntersect(
          a[i]!,
          a[(i + 1) % a.length]!,
          b[j]!,
          b[(j + 1) % b.length]!,
        )
      )
        return true;
  return (
    pointInPolygon(a[0]!, b) ||
    pointInPolygon(b[0]!, a) ||
    pointInPolygon(centroid(a), b) ||
    pointInPolygon(centroid(b), a)
  );
}

/** Build a rotated quad of the given acreage centred at local metres (cx, cy). */
export function makeQuad(
  cx: number,
  cy: number,
  acres: number,
  angleDeg: number,
  aspect = 1.2,
  skew = 0.08,
): LatLng[] {
  const area = acres * SQM_PER_ACRE;
  const w = Math.sqrt(area * aspect),
    h = area / w;
  const t = (angleDeg * Math.PI) / 180;
  const corners: [number, number][] = [
    [-w / 2, -h / 2],
    [w / 2 + w * skew, -h / 2],
    [w / 2, h / 2],
    [-w / 2 - w * skew, h / 2],
  ];
  return corners.map(([x, y]) =>
    unproject([
      cx + x * Math.cos(t) - y * Math.sin(t),
      cy + x * Math.sin(t) + y * Math.cos(t),
    ]),
  );
}

export function toDMS(v: number, pos: string, neg: string) {
  const a = Math.abs(v);
  const d = Math.floor(a),
    m = Math.floor((a - d) * 60),
    s = ((a - d) * 60 - m) * 60;
  return `${d}° ${m}′ ${s.toFixed(1)}″ ${v >= 0 ? pos : neg}`;
}

/**
 * Corner pillars from a surveyor's coordinates file: one pillar per line, latitude then longitude in decimal
 * degrees, separated by commas, semicolons, tabs or spaces. A label first ("P1, 5.7457, -0.2263") and header lines
 * are fine. Throws a sentence the person can act on.
 */
export function parsePillars(text: string): LatLng[] {
  const pts: LatLng[] = [];
  for (const raw of text.split(/\r?\n/)) {
    // The last two decimal numbers on the line are the latitude and longitude; a "P1" label or header is skipped.
    const decimals = (raw.match(/-?\d+\.\d+/g) ?? []).map(Number);
    if (decimals.length < 2) continue;
    const [lat, lng] = decimals.slice(-2) as [number, number];
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180)
      throw new Error(`"${raw.trim()}" isn't a latitude and longitude`);
    pts.push([lat, lng]);
  }
  if (pts.length < 3)
    throw new Error(
      "The file needs at least 3 corner pillars, one per line: latitude, longitude",
    );
  const [first, last] = [pts[0]!, pts[pts.length - 1]!];
  if (pts.length > 3 && first[0] === last[0] && first[1] === last[1]) pts.pop(); // closed ring: drop the repeat
  return pts;
}

/** A sample surveyor's file for the demo: a free plot between GA-BRK-0009 and GA-BRK-0004 in Berekuso. */
export const SAMPLE_PILLARS_CSV = `pillar,latitude,longitude
P1,5.745663,-0.226286
P2,5.745700,-0.224790
P3,5.744140,-0.224760
P4,5.744100,-0.226270
`;
