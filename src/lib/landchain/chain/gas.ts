// Blockchain cost of a transaction, read from its receipt: gas used × effective gas price.
import { publicIdOf, reader } from "./client";

export interface GasCost { hash: string; from: string; gasUsed: number; gasPriceGwei: number; costEth: number; block: number }

export async function gasCost(hash: string): Promise<GasCost | null> {
  try {
    const r = await reader().web3.eth.getTransactionReceipt(hash);
    const gasUsed = Number(r.gasUsed);
    const price = BigInt(r.effectiveGasPrice ?? 0n);
    return {
      hash, from: publicIdOf(String(r.from)), gasUsed, block: Number(r.blockNumber),
      gasPriceGwei: Number(price) / 1e9,
      costEth: Number(BigInt(gasUsed) * price) / 1e18,
    };
  } catch {
    return null;
  }
}
