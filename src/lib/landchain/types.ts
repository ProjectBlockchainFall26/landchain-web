import type { LatLng } from "./geo";

export type Role = "Citizen" | "Registrar" | "Surveyor" | "Lawyer" | "Identity officer" | "Judge";
export type IdentityStatus = "none" | "pending" | "verified" | "rejected";

export interface Account {
  id: string; // public ID
  name: string;
  kind: "citizen" | "officer" | "public";
  roles: Role[];
  identity: IdentityStatus;
  citizenship?: "citizen" | "non-citizen" | undefined;
  cardHash?: string | undefined;
  pinHash?: string | undefined;
}

export type ParcelStatus = "pending" | "verified" | "for_sale" | "in_escrow" | "sold" | "frozen" | "rejected";
export type Interest = "Allodial" | "Customary freehold" | "Common-law freehold" | "Leasehold";

export interface Doc { type: string; name: string; hash: string }

export interface Parcel {
  id: string;
  token?: number | undefined;
  titleNo?: number | undefined;
  interest: Interest;
  holder: string;
  region: string;
  location: string;
  acres: number;
  status: ParcelStatus;
  owner: string;
  pillars: LatLng[];
  price?: number | undefined;
  listedAt?: number | undefined;
  updatedAt: number;
  docs: Doc[];
}

export type StepStatus = "waiting" | "approved" | "rejected";
export interface Step { status: StepStatus; by?: string | undefined; at?: number | undefined; reason?: string | undefined }
export interface Application {
  id: string;
  parcelId: string;
  applicant: string;
  survey: Step;
  legal: Step;
  registrar: Step;
  createdAt: number;
}

export type SaleStatus = "awaiting" | "approved" | "refunded" | "disputed";
export interface Sale {
  id: string;
  parcelId: string;
  buyer: string;
  seller: string;
  amount: number;
  status: SaleStatus;
  since: number;
}

export interface Dispute {
  id: string;
  saleId: string;
  raisedBy: string;
  reason: string;
  evidenceHash?: string | undefined;
  outcome?: "buyer" | "seller" | undefined;
  judge?: string | undefined;
}

export type HistoryType = "Registration" | "Listing" | "Sale" | "Transfer" | "Freeze" | "Dispute" | "Refund";
export interface HistoryEvent { parcelId: string; type: HistoryType; text: string; at: number; block: number }

export interface Tx {
  hash: string;
  contract: string;
  fn: string;
  args: string;
  from: string;
  block: number;
  at: number;
  status: "Success" | "Reverted";
  error?: string | undefined;
}

export interface Notification { to: string; text: string; at: number }

export interface Wallet { tghs: number; lastFaucet?: number | undefined }

export interface ChainState {
  block: number;
  accounts: Account[];
  parcels: Parcel[];
  applications: Application[];
  sales: Sale[];
  disputes: Dispute[];
  history: HistoryEvent[];
  txs: Tx[];
  wallets: Record<string, Wallet>;
  notifications: Notification[];
  nextToken: number;
  nextTitle: number;
}
