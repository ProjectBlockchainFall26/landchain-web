import type { LatLng } from "./geo";

export type Role = "Citizen" | "Registrar" | "Identity officer";
export type IdentityStatus = "none" | "pending" | "verified" | "rejected";

export interface Account {
  id: string; // public ID, e.g. GH-7d4e894d
  name: string;
  address?: string | undefined; // wallet address
  kind: "citizen" | "officer" | "public";
  roles: Role[];
  identity: IdentityStatus;
  citizenship?: "citizen" | "non-citizen" | undefined;
  cardHash?: string | undefined;
}

/** Mirrors TitleRegistry.Status. */
export type ParcelStatus = "pending" | "registered" | "transfer_pending" | "rejected";
export type Interest = "Allodial" | "Customary freehold" | "Common-law freehold" | "Leasehold";

/** On chain: type + SHA-256 fingerprint only. The file and its name live in the Lands Commission's vault. */
export interface Doc { type: string; hash: string }

export interface Parcel {
  id: string;
  recordId: number; // TitleRegistry record id
  titleNo?: number | undefined; // ERC-721 token id, once minted
  interest: Interest;
  holder: string;
  region: string;
  location: string;
  planNumber: string; // regional / plan number from the approved site plan
  gpsAddress: string; // GhanaPostGPS digital address
  acres: number;
  status: ParcelStatus;
  owner: string; // public ID
  owners: string[]; // every owner since registration, oldest first (on chain)
  pillars: LatLng[];
  registeredAt?: number | undefined;
  updatedAt: number;
  docs: Doc[];
}

export type Decision = "waiting" | "approved" | "rejected" | "cancelled";

export interface Application {
  id: string; // APP-n
  parcelId: string;
  applicant: string;
  createdAt: number;
  decision: Decision;
  by?: string | undefined;
  at?: number | undefined;
  reason?: string | undefined;
}

export interface TransferRequest {
  id: string; // TRF-n
  parcelId: string;
  from: string;
  to: string;
  requestedAt: number;
  decision: Decision;
  by?: string | undefined;
  at?: number | undefined;
  reason?: string | undefined;
}

export type FeeKind = "Official search" | "Stamp duty" | "First registration" | "Transfer";
export interface Payment {
  id: string; // PAY-n
  parcelId: string;
  kind: FeeKind;
  amount: number; // GH¢
  receiptHash: string;
  payer: string;
  recordedBy: string;
  at: number;
  block: number;
  tx: string;
  transferId?: string | undefined;
}

export type HistoryType = "Application" | "Registration" | "Transfer requested" | "Transfer" | "Transfer rejected" | "Transfer cancelled" | "Rejected";
export interface HistoryEvent { parcelId: string; type: HistoryType; text: string; at: number; block: number; tx: string }

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

export interface ChainState {
  block: number;
  accounts: Account[];
  parcels: Parcel[];
  applications: Application[];
  transfers: TransferRequest[];
  payments: Payment[];
  history: HistoryEvent[];
  txs: Tx[];
  notifications: Notification[];
}
