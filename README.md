# LandChain Ghana (web)

Front end for LandChain, a blockchain land-titling system for Ghana. Each registered parcel becomes a unique digital title tied to its surveyed GPS boundary. A title is only created after a surveyor, a lawyer and a Lands Commission registrar have signed off. Ownership changes only through escrow-backed sales that the registrar approves.

The app runs against an in-browser demo chain, so no wallet or deployed contracts are needed. It walks through the full life of a parcel: apply, survey, legal review, registrar approval, minted title, listing, purchase, escrow and approved transfer.

## Views

- **Citizen:** register land, track approvals, view title health, list a parcel for sale, buy a listed parcel, check balance.
- **Lands Commission:** a review queue for the Registrar, Surveyor, Lawyer, Identity officer and Judge roles. Each role can act only on its own items.
- **Public:** look up and verify any title, read only, no login.

Routes live in `src/routes` (`index`, `login`, `parcels`, `register`, `review`, `verify`, `balance`, `activity`, `identity`, `title.$parcelId`). Demo chain logic is in `src/lib/landchain`.

## Tech stack

TanStack Start (React 19, TanStack Router and Query), TypeScript, Vite, Tailwind CSS 4, Radix UI.

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

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |
| `npm test` | Run tests once (Vitest) |
