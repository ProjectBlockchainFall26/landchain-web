# LandChain Ghana (web)

Front end for LandChain, a blockchain land register for Ghana. The owner of a parcel (bought or inherited off the platform) applies with their verified Ghana Card, the parcel's GPS boundary and document hashes. When the Lands Commission registrar approves, the smart contract mints the title as an ERC-721 NFT. From then on the record can't be edited, and ownership changes only when the owner requests a transfer **and** the registrar approves it.

The app reads and writes the **LandChain smart contracts** ([landchain-contracts](https://github.com/ProjectBlockchainFall26/landchain-contracts)): every action is a real transaction, and every screen is built from contract state and events. It walks through the full life of a parcel: verify identity, apply, registrar approval, minted title, transfer request and approved transfer.

## Views

- **Citizen:** verify a Ghana Card, register land (boundary, plan number, GPS address, documents), track the application, see the on-chain history of a title, request a transfer, see a receipt of every fee and blockchain cost, read enquiries from interested buyers.
- **Lands Commission:** a review queue. The identity officer verifies Ghana Cards; the registrar opens documents, records fee receipts and approves registrations and transfers. Each role can act only on its own items, and the contract enforces it.
- **Public:** look up any title, read only, no login. Sees the owner's public ID, status, boundary and history, but not names, documents or fees. Can check a document copy against its on-chain fingerprint and send the owner an enquiry without learning who they are.

Routes live in `src/routes` (`index`, `login`, `parcels`, `register`, `review`, `verify`, `activity`, `receipt.$parcelId`, `assumptions`, `identity`, `title.$parcelId`).

## How the blockchain is wired in

```
screens (src/routes, src/components/lc)
   │  read: useChain() / useMe()        write: landchain.submitApplication(…), landchain.approveTransfer(id) …
   ▼
src/lib/landchain/store.ts            the only door to the data
   ├─ chain/client.ts                 web3.js v4: contracts from ABIs + addresses, signing, revert messages
   ├─ chain/snapshot.ts               builds the app state from view functions + contract events
   ├─ chain/config.ts                 chain id, RPC, micro-degree coordinates
   ├─ chain/generated/                ABIs, deployed addresses, demo labels (npm run contracts:sync)
   ├─ engine.ts                       lookups + the boundary overlap pre-check
   ├─ privacy.ts                      who may see names, documents and fees
   ├─ fees.ts                         fee schedule used for suggested amounts (estimates)
   ├─ vault.ts                        document files, off chain (IndexedDB in the demo; backend later)
   └─ enquiries.ts                    buyer enquiries, off chain (localStorage in the demo; backend later)
```

- **Writes.** Each `landchain.*` call is one contract call. The app first does a free `eth_call`, so a refused
  action shows the contract's own `require` message (e.g. "Only the owner can transfer this title") without
  spending gas, then sends the transaction and shows its block and hash.
- **Reads.** Parcels, applications, transfer requests and owner lists come from view functions; the history, the
  activity log and notifications come from contract events. The app polls for new blocks every 3 seconds.
- **Who signs (hybrid).** Citizens sign with MetaMask. On a local chain, the seeded demo accounts (citizens and Lands
  Commission officers) are Ganache's unlocked accounts, so a demo needs no wallet. Officer accounts stand in for the
  role wallets the Django backend will hold; when it exists, officer calls are routed there in `store.ts` with no
  change to the screens.
- **Identity.** Your wallet is your identity. The Ghana Card number is hashed in the browser
  (keccak256) and only the hash goes on chain. Names stay on the device.

## Tech stack

TanStack Start (React 19, TanStack Router and Query), TypeScript, Vite, Tailwind CSS 4, Radix UI, web3.js v4.

## Run the whole project

Clone both repos:

```bash
git clone https://github.com/ProjectBlockchainFall26/landchain-contracts.git
git clone https://github.com/ProjectBlockchainFall26/landchain-web.git landchain-web-main
cd landchain-web-main && git checkout jerome
```

You need **Node.js 20+** and both repos cloned **side by side** in one folder:

```
ProjectBlockchain/
├─ landchain-contracts/
└─ landchain-web-main/     (the landchain-web repo)
```

The project runs in **three terminals**: the blockchain, the setup, and the web app.

### First time only

```bash
cd landchain-contracts && npm install
cd ../landchain-web-main && npm install
```

### Start everything from scratch (recommended before a demo)

```bash
# terminal 1, in landchain-contracts: stop any running chain (Ctrl+C), then
npm run chain:fresh          # empty local blockchain on 127.0.0.1:7545. Leave this running.

# terminal 2, in landchain-contracts (wait until terminal 1 says "RPC Listening on 127.0.0.1:7545")
npm run setup:local          # deploy the 4 contracts + seed the demo data. Wait for "Seeded."

# terminal 2 again, in landchain-web-main (only after "Seeded.")
npm run contracts:sync       # copy the new contract addresses and ABIs into the web app

# terminal 3, in landchain-web-main
npm run dev                  # open the URL it prints, usually http://localhost:5173
```

The two middle steps can be one command: `npm run setup:all` in `landchain-contracts` runs `setup:local`, then
`contracts:sync` in the web app, in the right order.

Then hard-refresh the browser (**Cmd+Shift+R**) and pick a demo account on the login page. No wallet is needed on
the local chain.

### Which chain command?

| Command | What happens when you stop it |
|---|---|
| `npm run chain:fresh` | Everything is lost. Run `setup:local` + `contracts:sync` again after every restart. Best for demos: a clean start every time. |
| `npm run chain` | Saved in `landchain-contracts/.ganache-db/`. Next time, just run `npm run chain` and `npm run dev`; no setup needed. |

### When to run setup again

- After `chain:fresh` (every time).
- After changing any contract in `contracts/`.
- After pulling contract changes from GitHub.
- When the app says "This chain doesn't have the current LandChain contracts".

### Troubleshooting

| You see | Do this |
|---|---|
| "Can't reach http://127.0.0.1:7545. Is the chain running?" | Start terminal 1 (`npm run chain:fresh` or `npm run chain`). |
| "This chain doesn't have the current LandChain contracts" / "No demo accounts found" | The web app has old addresses. Run `npm run setup:all` in `landchain-contracts`, then Cmd+Shift+R. |
| `contracts:sync` says "Synced 3 ABIs" | You synced before setup finished. Run `contracts:sync` again (it should say 4 ABIs). |
| "This version of µWS is not compatible with your Node.js build" | Harmless warning from Ganache on newer Node. Ignore it, or use Node 20. |
| Port 7545 already in use | Another chain is running (maybe the Ganache desktop app). Close it, or `lsof -i :7545` and stop that process. |
| MetaMask errors after a fresh chain | MetaMask → Settings → Advanced → Clear activity tab data. Network: RPC `http://127.0.0.1:7545`, chain ID `1337`. |

### Tests

```bash
# landchain-contracts, with a chain running
npm run contracts:test       # 25 Truffle tests

# landchain-web-main, with the seeded chain running
npm run test:e2e             # 5 end-to-end tests through the app's own functions
```

Running `contracts:test` doesn't touch your saved addresses. Running `setup:local` on a different chain does:
run `setup:all` on your own chain afterwards.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |
| `npm test` | Run tests once (Vitest) |
| `npm run test:e2e` | Run the full parcel lifecycle (identity → register → transfer) against the running local chain |
| `npm run contracts:sync` | Copy ABIs, addresses and demo labels from `../landchain-contracts` |
