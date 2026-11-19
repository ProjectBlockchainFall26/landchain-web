# LandChain Ghana (web)

Front end for LandChain, a blockchain land register for Ghana. The owner of a parcel (bought or inherited off the platform) applies with their verified Ghana Card, the parcel's GPS boundary and document hashes. When the Lands Commission registrar approves, the smart contract mints the title as an ERC-721 NFT. From then on the record can't be edited, and ownership changes only when the owner requests a transfer **and** the registrar approves it.

The app reads and writes the **LandChain smart contracts** ([landchain-contracts](https://github.com/ProjectBlockchainFall26/landchain-contracts)): every action is a real transaction, and every screen is built from contract state and events. It walks through the full life of a parcel: verify identity, apply, registrar approval, minted title, transfer request and approved transfer.

## Views

- **Citizen:** verify a Ghana Card, register land, track the application, see the on-chain history of a title, request a transfer of ownership.
- **Lands Commission:** a review queue. The identity officer verifies Ghana Cards; the registrar approves registrations and transfers. Each role can act only on its own items, and the contract enforces it.
- **Public:** look up and verify any title, read only, no login.

Routes live in `src/routes` (`index`, `login`, `parcels`, `register`, `review`, `verify`, `activity`, `identity`, `title.$parcelId`).

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
   └─ engine.ts                       lookups + the boundary overlap pre-check
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

## Run locally

Requires [Node.js](https://nodejs.org) 20 or newer (or [Bun](https://bun.sh)).

```sh
git clone https://github.com/ProjectBlockchainFall26/landchain-web.git
cd landchain-web
git checkout jerome
npm install        # or: bun install
npm run dev        # or: bun run dev
```

Open the URL Vite prints, usually http://localhost:5173.

### With the local chain (default)

Clone [landchain-contracts](https://github.com/ProjectBlockchainFall26/landchain-contracts) next to this folder, then:

```sh
# in landchain-contracts
npm install
npm run chain          # terminal 1: Ganache on 127.0.0.1:7545 (leave running)
npm run setup:local    # terminal 2: deploy + seed the demo world

# in this folder
npm run contracts:sync # copy ABIs and addresses (CONTRACTS_DIR=… if the folder is elsewhere)
npm run dev
```

Sign in with one of the demo accounts on the login page, or connect MetaMask (add network: RPC
`http://127.0.0.1:7545`, chain id 1337, and import a Ganache private key printed by `npm run chain`).

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
