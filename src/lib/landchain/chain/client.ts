// Talks to the deployed LandChain contracts with web3.js v4 (same library as the course demos).
//
// Signing (hybrid, as in Doc 1 §5.4):
//   - Citizens sign their own transactions with MetaMask.
//   - Lands Commission officers sign with wallets the platform holds. On a local Ganache chain those are the
//     chain's unlocked demo accounts; once the Django backend exists, officer transactions move there
//     (see `sendAsOfficer` below) and no officer key ever reaches the browser.
//   - On a local chain, citizens can also use Ganache's unlocked demo accounts, so the demo needs no wallet.
import Web3, { type Contract, type ContractAbi } from "web3";
import IdentityRegistryAbi from "./generated/abi/IdentityRegistry.json";
import TitleRegistryAbi from "./generated/abi/TitleRegistry.json";
import FeeLedgerAbi from "./generated/abi/FeeLedger.json";
import LandAccessControlAbi from "./generated/abi/LandAccessControl.json";
import { CHAIN_ID, chainName, deployment, IS_LOCAL, RPC_URL, type ContractName } from "./config";

const ABIS: Record<ContractName, ContractAbi> = {
  LandAccessControl: LandAccessControlAbi as ContractAbi,
  IdentityRegistry: IdentityRegistryAbi as ContractAbi,
  TitleRegistry: TitleRegistryAbi as ContractAbi,
  FeeLedger: FeeLedgerAbi as ContractAbi,
};
export const CONTRACT_NAMES = Object.keys(ABIS) as ContractName[];

type AnyContract = Contract<ContractAbi>;
export type Contracts = Record<ContractName, AnyContract>;

type Method = (...a: unknown[]) => {
  call(o?: object): Promise<unknown>;
  estimateGas(o: object): Promise<bigint>;
  send(o: object): Promise<{ transactionHash: string; blockNumber: bigint }>;
};
function method(c: Contracts, contract: ContractName, name: string): Method {
  const fn = (c[contract].methods as unknown as Record<string, Method | undefined>)[name];
  if (!fn) throw new Error(`${contract} has no function ${name}. Run npm run contracts:sync after changing the contracts.`);
  return fn;
}

/** Free read: contract.name(...args).call(), typed by the caller. */
export function view<T>(c: Contracts, contract: ContractName, name: string, ...args: unknown[]): Promise<T> {
  return method(c, contract, name)(...args).call() as Promise<T>;
}

function build(web3: Web3): Contracts {
  if (!deployment) {
    throw new Error(`No LandChain contracts recorded for chain ${CHAIN_ID}. Deploy them, then run npm run contracts:sync.`);
  }
  const out = {} as Contracts;
  for (const name of CONTRACT_NAMES) out[name] = new web3.eth.Contract(ABIS[name], deployment.contracts[name]);
  return out;
}

// ---------- read side (no wallet needed) ----------
let readWeb3: Web3 | null = null;
let readContracts: Contracts | null = null;
export function reader() {
  if (!readWeb3) {
    readWeb3 = new Web3(RPC_URL);
    readContracts = build(readWeb3);
  }
  return { web3: readWeb3, c: readContracts! };
}

/** Pseudonymous public ID shown in the app (same as IdentityRegistry.publicIdOf): GH- + first 4 bytes of keccak256(address). */
export function publicIdOf(address: string) {
  return "GH-" + Web3.utils.keccak256(address.toLowerCase()).slice(2, 10);
}

/** keccak256("landchain-card:" + normalised card). Only this hash is sent; the card number never leaves the browser. */
export function chainCardHash(card: string) {
  return Web3.utils.keccak256(Web3.utils.utf8ToHex(`landchain-card:${card.trim().toUpperCase().replace(/\s+/g, "")}`));
}

// ---------- local unlocked accounts (Ganache only) ----------
let localAccounts: string[] | null = null;
export async function getLocalAccounts(): Promise<string[]> {
  if (!IS_LOCAL) return [];
  if (!localAccounts) localAccounts = (await reader().web3.eth.getAccounts()).map((a) => a.toLowerCase());
  return localAccounts;
}

// ---------- MetaMask ----------
interface Eip1193 { request(args: { method: string; params?: unknown[] }): Promise<unknown>; on?(e: string, cb: (...a: unknown[]) => void): void }
const eth = (): Eip1193 | undefined => (typeof window !== "undefined" ? (window as unknown as { ethereum?: Eip1193 }).ethereum : undefined);
export const hasMetaMask = () => !!eth();

let mmAddress: string | null = null;
let mmWeb3: Web3 | null = null;
let mmContracts: Contracts | null = null;
export const metaMaskAddress = () => mmAddress;

/** Connects MetaMask, switching it to (or adding) the configured chain. Returns the selected address. */
export async function connectMetaMask(onChange?: (address: string | null) => void): Promise<string> {
  const provider = eth();
  if (!provider) throw new Error("MetaMask is not installed in this browser");
  const [address] = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  if (!address) throw new Error("No account was shared from MetaMask");
  const hexId = "0x" + CHAIN_ID.toString(16);
  if ((await provider.request({ method: "eth_chainId" })) !== hexId) {
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
    } catch {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: hexId, chainName, rpcUrls: [RPC_URL], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } }],
      });
    }
  }
  mmAddress = address.toLowerCase();
  mmWeb3 = new Web3(provider as never);
  mmContracts = build(mmWeb3);
  provider.on?.("accountsChanged", (a) => {
    const next = (a as string[])[0]?.toLowerCase() ?? null;
    mmAddress = next;
    onChange?.(next);
  });
  return mmAddress;
}

// ---------- writing ----------
export class RevertError extends Error {}

/** Pulls the human-readable require() message out of a web3 / Ganache / MetaMask error. */
export function revertReason(e: unknown): string {
  const seen = new Set<unknown>();
  const texts: string[] = [];
  const walk = (x: unknown, depth = 0) => {
    if (!x || depth > 6 || seen.has(x)) return;
    seen.add(x);
    if (typeof x === "string") { texts.push(x); return; }
    if (typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    for (const k of ["reason", "message", "data", "cause", "innerError", "error"]) walk(o[k], depth + 1);
  };
  walk(e);
  for (const t of texts) {
    const m = t.match(/(?:reverted with reason string '|VM Exception while processing transaction: revert\s+|execution reverted:\s*)([^'\n]+)/i);
    if (m?.[1] && !/^0x/.test(m[1].trim())) return m[1].trim().replace(/'$/, "");
  }
  for (const t of texts) if (/user (rejected|denied)/i.test(t)) return "You cancelled the transaction in your wallet";
  return texts.find((t) => t && !/^0x/.test(t)) ?? "Transaction failed";
}

export interface SentTx { hash: string; block: number }

/**
 * Sends contract.method(...args) from `from`. Runs a free eth_call first so a failing require() comes back
 * with its message and no gas is spent. Throws RevertError with that message.
 */
export async function send(contract: ContractName, methodName: string, args: unknown[], from: string): Promise<SentTx> {
  const addr = from.toLowerCase();
  const { c } = await signerFor(addr);
  const fn = method(c, contract, methodName)(...args);
  let gas: bigint;
  try {
    await fn.call({ from: addr });
    // Estimate explicitly (+20%) so calls that mint or move an NFT never run out of gas.
    gas = ((await fn.estimateGas({ from: addr })) * 12n) / 10n;
  } catch (e) {
    throw new RevertError(revertReason(e));
  }
  try {
    const receipt = await fn.send({ from: addr, gas: gas.toString() });
    return { hash: receipt.transactionHash, block: Number(receipt.blockNumber) };
  } catch (e) {
    throw new RevertError(revertReason(e));
  }
}

async function signerFor(address: string): Promise<{ web3: Web3; c: Contracts }> {
  if (mmAddress === address && mmWeb3 && mmContracts) return { web3: mmWeb3, c: mmContracts };
  if ((await getLocalAccounts()).includes(address)) return reader(); // Ganache signs for its unlocked accounts
  throw new RevertError(
    IS_LOCAL
      ? "This account can't sign here. Connect it in MetaMask or pick a demo account."
      : "Connect MetaMask with this account to sign. Officer actions go through the Lands Commission backend.",
  );
}

/*
 * Officer actions and the future backend (hybrid signing).
 * When land-backend is live, officer calls (verifyProfile, rejectProfile, approveApplication,
 * rejectApplication, approveTransfer, rejectTransfer, recordPayment) will POST to
 *   {VITE_API_URL}/api/v1/chain/officer-actions  { contract, method, args }  with the officer's auth token,
 * and Django signs with the role wallet held in its environment. The UI keeps calling the same
 * landchain.* functions; only the routing in store.ts changes.
 */
