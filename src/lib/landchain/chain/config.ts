// Which chain the app talks to. Set in .env.local (see .env.example).
//   VITE_CHAIN_ID        1337 (local Ganache, default) or 11155111 (Sepolia)
//   VITE_RPC_URL         RPC used for reads (and for signing with Ganache's unlocked accounts on a local chain)
import deployments from "./generated/deployments.json";
import demoAccounts from "./generated/demo-accounts.json";

export type ContractName = "LandAccessControl" | "IdentityRegistry" | "TitleRegistry" | "FeeLedger";

interface Deployment { network: string; startBlock: number; deployedAt: string; contracts: Record<ContractName, string> }

const env = import.meta.env;
export const CHAIN_ID = Number(env["VITE_CHAIN_ID"] ?? 1337);
export const IS_LOCAL = CHAIN_ID === 1337;

const DEFAULT_RPC: Record<number, string> = {
  1337: "http://127.0.0.1:7545",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
};
export const RPC_URL: string = env["VITE_RPC_URL"] ?? DEFAULT_RPC[CHAIN_ID] ?? "http://127.0.0.1:7545";

export const CHAIN_NAME: Record<number, string> = { 1337: "Local Ganache", 11155111: "Sepolia testnet" };
export const chainName = CHAIN_NAME[CHAIN_ID] ?? `Chain ${CHAIN_ID}`;
export const EXPLORER: string | null = CHAIN_ID === 11155111 ? "https://sepolia.etherscan.io" : null;

export const deployment: Deployment | undefined = (deployments as Record<string, Deployment>)[String(CHAIN_ID)];

/** Display names for the seeded Ganache accounts. Names never go on chain. */
export const DEMO_LABELS: { address: string; name: string }[] = IS_LOCAL ? demoAccounts : [];

/** Coordinates are integer micro-degrees on chain (Solidity has no decimals). */
export const toMicro = (deg: number) => Math.round(deg * 1e6);
export const fromMicro = (v: bigint | string | number) => Number(v) / 1e6;
