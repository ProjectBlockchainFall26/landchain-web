# LandChain Ghana (web)

Front end for LandChain, a blockchain land-titling system for Ghana. Each registered parcel becomes a unique digital title tied to its surveyed GPS boundary. A title is only created after a surveyor, a lawyer and a Lands Commission registrar have signed off. Ownership changes only through escrow-backed sales that the registrar approves.

The app reads and writes the **LandChain smart contracts** ([landchain-contracts](https://github.com/ProjectBlockchainFall26/landchain-contracts)): every action is a real transaction, and every screen is built from contract state and events. It walks through the full life of a parcel: apply, survey, legal review, registrar approval, minted title, listing, purchase, escrow and approved transfer. An in-browser demo engine with the same rules is still available for offline demos (`VITE_LANDCHAIN_MODE=demo`).

## Views

- **Citizen:** register land, track approvals, view title health, list a parcel for sale, buy a listed parcel, check balance.
- **Lands Commission:** a review queue for the Registrar, Surveyor, Lawyer, Identity officer and Judge roles. Each role can act only on its own items.
- **Public:** look up and verify any title, read only, no login.

Routes live in `src/routes` (`index`, `login`, `parcels`, `register`, `review`, `verify`, `balance`, `activity`, `identity`, `title.$parcelId`).

## How the blockchain is wired in

```
screens (src/routes, src/components/lc)
   │  read: useChain() / useMe()        write: landchain.buyListed(id), landchain.finalise(app) …
   ▼
src/lib/landchain/store.ts            the only door to the data; picks chain or demo mode
   ├─ chain/client.ts                 web3.js v4: contracts from ABIs + addresses, signing, revert messages
   ├─ chain/snapshot.ts               builds the app state from view functions + contract events
   ├─ chain/config.ts                 chain id, RPC, units (tGHS 18 decimals, micro-degree coordinates)
   ├─ chain/generated/                ABIs, deployed addresses, demo labels (npm run contracts:sync)
   └─ engine.ts + seed.ts             demo mode only
```

- **Writes.** Each `landchain.*` call becomes one or more contract calls. The app first does a free `eth_call`, so a
  refused action shows the contract's own `require` message (e.g. "Only the surveyor can sign this step") without
  spending gas, then sends the transaction and shows its block and hash. Buying is two transactions:
  `TestCedi.approve(Marketplace, price)` then `Marketplace.buyListed(recordId)`.
- **Reads.** Parcels, applications, sales, disputes and balances come from view functions; ownership history, the
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

Without a chain: put `VITE_LANDCHAIN_MODE=demo` in `.env.local`.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |
| `npm test` | Run tests once (Vitest) |
| `npm run test:e2e` | Run the full parcel lifecycle against the running local chain |
| `npm run contracts:sync` | Copy ABIs, addresses and demo labels from `../landchain-contracts` |
