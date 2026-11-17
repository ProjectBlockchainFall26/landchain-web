// Copies contract ABIs, deployed addresses and demo-account labels from the contracts repo into the web app.
// Run after every deploy:  npm run contracts:sync
// Contracts folder: CONTRACTS_DIR env var, or ../landchain-contracts next to this repo.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const src = path.resolve(root, process.env.CONTRACTS_DIR ?? "../landchain-contracts", "shared");
const out = path.join(root, "src/lib/landchain/chain/generated");
if (!fs.existsSync(src)) {
  console.error(`No contracts output at ${src}. Set CONTRACTS_DIR or compile/deploy the contracts first.`);
  process.exit(1);
}
fs.mkdirSync(path.join(out, "abi"), { recursive: true });

const read = (f) => (fs.existsSync(path.join(src, f)) ? JSON.parse(fs.readFileSync(path.join(src, f), "utf8")) : {});
const write = (f, data) => fs.writeFileSync(path.join(out, f), JSON.stringify(data, null, 2) + "\n");

for (const f of fs.readdirSync(path.join(src, "abi"))) {
  fs.copyFileSync(path.join(src, "abi", f), path.join(out, "abi", f));
}
// Testnet deployments (committed) + local ones (Ganache, regenerated on every fresh chain).
const deployments = { ...read("deployments.json"), ...read("deployments.local.json") };
write("deployments.json", deployments);
const labels = fs.existsSync(path.join(src, "demo-accounts.local.json")) ? read("demo-accounts.local.json") : [];
write("demo-accounts.json", labels);

console.log(`Synced ${fs.readdirSync(path.join(out, "abi")).length} ABIs, deployments for chains [${Object.keys(deployments).join(", ")}], ${labels.length} demo account labels.`);
