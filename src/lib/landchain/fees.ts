// Official fees an owner pays, used to suggest amounts. The money is paid in cedis outside LandChain;
// the registrar records each receipt in the FeeLedger contract.
//
// Sources: Lands Commission fee schedule as reported by YEN.com.gh (27 Oct 2026; the schedule's own effective
// date isn't stated). Stamp duty bands: Stamp Duty Act 2005 (Act 689) as amended by Act 1109, in force 1 Jan 2024.
// These are ESTIMATES. Always confirm current amounts with the Lands Commission and the GRA.
import type { FeeKind } from "./types";

export const FEE_KINDS: FeeKind[] = ["Official search", "Stamp duty", "First registration", "Transfer"];
export const FEE_INDEX: Record<FeeKind, number> = { "Official search": 0, "Stamp duty": 1, "First registration": 2, Transfer: 3 };

export const FEE_INFO: Record<FeeKind, { paidTo: string; how: string }> = {
  "Official search": { paidTo: "Lands Commission", how: "GH¢ 163 for a land certificate search" },
  "Stamp duty": { paidTo: "Ghana Revenue Authority", how: "0.25% up to GH¢ 10,000, 0.5% up to GH¢ 50,000, 1% above, of the price paid" },
  "First registration": { paidTo: "Lands Commission", how: "GH¢ 1,148–1,178 per acre or part of an acre" },
  Transfer: { paidTo: "Lands Commission", how: "GH¢ 973 per acre or part of an acre" },
};

const perAcre = (rate: number, acres: number) => rate * Math.max(1, Math.ceil(acres));
export function stampDuty(consideration: number) {
  const rate = consideration <= 10_000 ? 0.0025 : consideration < 50_000 ? 0.005 : 0.01;
  return Math.round(consideration * rate);
}
/** Suggested amount for a fee, in GH¢. Stamp duty needs the price paid (consideration). */
export function estimateFee(kind: FeeKind, acres: number, consideration?: number): number {
  switch (kind) {
    case "Official search": return 163;
    case "Stamp duty": return consideration ? stampDuty(consideration) : 0;
    case "First registration": return perAcre(1178, acres);
    case "Transfer": return perAcre(973, acres);
  }
}

export const cedi = (n: number) => `GH¢ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
