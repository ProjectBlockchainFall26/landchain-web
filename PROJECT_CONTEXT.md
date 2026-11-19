# LandChain Ghana: project context and what to build next

> For team members and their AI coding agents. Read this first, then the READMEs of the two repos.
> Last updated: 19 Nov 2026.

## 1. What this project is

LandChain is a **blockchain-backed land register** for Ghana's Lands Commission, built for a blockchain class.
The goal of the project is to show **how blockchain, Solidity and smart contracts make a land register
tamper-proof**. It is deliberately **not** a marketplace.

The core story:

1. A person **verifies their Ghana Card** (only a hash goes on chain; an identity officer approves).
2. They **apply to register land** they already own (bought or inherited off the platform): parcel ID,
   regional plan number, GhanaPostGPS address, GPS boundary, and fingerprints (SHA-256) of the documents.
3. The **registrar records the fee receipts** (stamp duty, registration fee). The contract refuses approval
   without them.
4. The **registrar approves** and the contract **mints the title as an ERC-721 NFT** to the owner. From then on
   the record can't be edited.
5. Ownership changes only by a **two-key transfer**: the owner requests it, the registrar records the transfer
   fee and approves. `transferFrom` is blocked for everyone, even the owner.
6. **Anyone can verify** a title for free: owner's public ID, boundary, full on-chain history. Names, documents
   and fees are private (owner and Lands Commission only). A visitor can send the owner an **enquiry** without
   learning who they are.

**Scope history.** An earlier version had a marketplace with escrow, test cedis (tGHS), disputes and
surveyor/lawyer/judge roles. On 19 Nov 2026 we cut it down to the register above. Don't bring those back
without a team decision. They are listed as future work below.

## 2. Assumptions (keep these visible; they're part of the presentation)

1. The sale happens off the platform. LandChain records the result.
2. **The Lands Commission is trusted when it enters a record.** The chain stops tampering *after* entry; it can't
   catch a forgery that was approved (the "oracle problem").
3. Physical and legal checks (site plan, official search, GRA stamp duty, stool/family consent) happen off the
   platform. LandChain stores proof (fingerprints, receipt hashes).
4. The identity officer stands in for the National Identification Authority. One Ghana Card ↔ one wallet.
5. Wallet = identity. Key recovery is future work.
6. **No personal data or documents on chain.** The chain is public; even `private` Solidity variables are readable.
7. Fees are paid in cedis outside LandChain; the registrar records the official receipts.
8. Whole parcels only (no subdivision, leases, mortgages, ground rent, inheritance).
9. Boundary accuracy depends on the surveyor.
10. Courts decide disputes outside the system; the registrar carries out orders.
11. One trusted registrar key (production needs multi-sig + backend-held keys).
12. Test network only (Ganache / Sepolia).

The same list is in the web app at `/assumptions` and in `masterplan.md`.

## 3. Repositories and layout

| Repo | Branch | What's in it |
|---|---|---|
| [`landchain-contracts`](https://github.com/ProjectBlockchainFall26/landchain-contracts) | `main` | Solidity contracts, Truffle tests, migration, seed script, exported ABIs |
| [`landchain-web`](https://github.com/ProjectBlockchainFall26/landchain-web) | `jerome` | React web app that reads and writes the contracts with web3.js v4 |

Clone them **side by side** in one folder: the sync script looks for `../landchain-contracts`.

**Toolchain:** Truffle 5, Solidity 0.8.20 (EVM paris, `viaIR`), OpenZeppelin 5.0.2, Ganache 7, web3.js v4,
TanStack Start (React 19), TypeScript, Tailwind 4, Radix UI. Node 20 LTS recommended (Node 24 works but prints a
harmless µWS warning from Ganache).

### Contracts (`landchain-contracts/contracts/`)

| Contract | Job | Key functions |
|---|---|---|
| `LandAccessControl` | One role hub: admin, `REGISTRAR_ROLE`, `ID_OFFICER_ROLE` | `grantRole`, `rolesOf`, `isOfficer` |
| `base/LandRoleGuard` | Gives every contract the hub + `onlyLandRole` modifier | |
| `IdentityRegistry` | Ghana Card hash → wallet; Pending/Verified/Rejected | `submitProfile`, `verifyProfile`, `rejectProfile`, `isVerified` |
| `TitleRegistry` | The register: applications, ERC-721 titles, transfers, owner history | `submitApplication`, `approveApplication`, `rejectApplication`, `requestTransfer`, `approveTransfer`, `rejectTransfer`, `cancelTransfer`, `getParcel`, `ownerHistory` |
| `FeeLedger` | Fee receipts the registrar records; `TitleRegistry` checks it before approving | `recordPayment`, `isPaid`, `transferFeePaid`, `paymentsOf` |

Deployed in that order by `migrations/1_deploy_land_system.js`, which then calls `titles.setFeeLedger(fees)`.
**`TitleRegistry` is 20.6 KB of Ethereum's 24 KB contract size limit.** New features should go in new contracts
(like `FeeLedger`), not in `TitleRegistry`.

### Web app (`landchain-web/src/`)

```
routes/            one file per page: index (map), login, identity, register, parcels, title.$parcelId,
                   review (Lands Commission queue), verify (public), activity, receipt.$parcelId, assumptions
components/lc/     TitleHealth (the title record panel), FeeRecorder, ParcelMap, Shell, ui
lib/landchain/
  store.ts         THE ONLY DOOR to data. Screens call landchain.* and read useChain()/useMe()
  chain/client.ts  web3: contracts from ABIs + addresses, signing, readable revert messages
  chain/snapshot.ts builds app state from view functions + contract events (polls every 3 s)
  chain/gas.ts     gas cost per transaction (receipt page)
  chain/generated/ ABIs, addresses, demo labels: written by `npm run contracts:sync`, don't edit
  privacy.ts       who may see names, documents, fees. Change privacy rules ONLY here
  fees.ts          fee schedule used for suggested amounts (estimates)
  vault.ts         document files, off chain (IndexedDB in the demo)
  enquiries.ts     buyer enquiries, off chain (localStorage in the demo)
  engine.ts        pure lookups + boundary overlap pre-check
```

## 4. How to run it

Full steps and troubleshooting: the **Run the whole project** section of either repo's README. In short:

```bash
# terminal 1, in landchain-contracts
npm run chain:fresh          # leave running
# terminal 2, in landchain-contracts
npm run setup:all            # deploy + seed + sync the web app
# terminal 3, in landchain-web-main
npm run dev
```

Sign in with a demo account on the login page (no wallet needed on a local chain):

| # | Name | Role |
|---|---|---|
| 0 | Lands Commission | Registrar + admin |
| 1 | Abena Sarpong | Identity officer |
| 2–5 | Ama Owusu, Yaw Boakye, Kofi Mensah, Akosua Darko | Verified citizens |
| 6 | Kwabena Ofori | Identity pending |
| 7 | Efua Mensah | No profile: use her to demo the full flow |

Tests:
- `npm run contracts:test` in `landchain-contracts`: 25 Truffle tests (needs a chain running).
- `npm run test:e2e` in `landchain-web`: 5 end-to-end tests driving `landchain.*` against the seeded chain.

## 5. Gotchas (these have already bitten us)

- **Order matters:** deploy and seed, *then* `contracts:sync`. `setup:all` does it in the right order.
- **"This chain doesn't have the current LandChain contracts"** = the web app has stale addresses. Run `setup:all`.
- **Running tests overwrites `shared/deployments.local.json`.** `setup:local` on a scratch chain replaces the
  addresses your running app uses. Run `setup:all` on your own chain afterwards.
- Ganache addresses are deterministic: a fresh chain gives the same addresses every time.
- `.ganache-db/` keeps the chain between restarts; delete it (or `npm run chain:fresh`) to start over.
- Ganache's private keys are public test keys. Never use them on a real network; never commit `.env.local`.
- After changing a contract: compile, update the tests, `setup:all`, then update `snapshot.ts` / `store.ts` if the
  ABI changed.
- `node_modules` are platform-specific: don't copy them between macOS and Linux.

## 6. Rules for anyone (or any agent) changing the code

1. **The contracts are the source of truth.** Every rule is a `require` in Solidity; the app only pre-checks.
2. **Every `require` message is a sentence the user sees.** Write it that way.
3. **Every new rule gets a Truffle test**, including the attempt that should fail (`expectRevert`).
4. **Nothing personal goes on chain**: no names, file names, Ghana Card numbers, phone numbers, emails. Hashes and
   public IDs only.
5. **Screens never talk to the chain directly.** Add a function to `landchain` in `store.ts`.
6. **Privacy decisions go through `privacy.ts`** (`canSeePrivate`, `shownName`).
7. Keep `TitleRegistry` under the size limit; put new on-chain features in their own contract.
8. Keep the scope: a register, not a marketplace (see section 1).

## 7. What's built (done)

- 4 contracts, 25 contract tests, migration, seed script (14 parcels around Berekuso with plan numbers, GPS
  addresses, document fingerprints, fee receipts, two completed transfers, one pending, two pending applications).
- Web app on the real contracts, 5 end-to-end tests:
  - Sign in: demo accounts or MetaMask
  - Identity page (hashed Ghana Card)
  - Register Land (draw boundary, overlap check, plan number, GPS address, document checklist)
  - Review Queue (verify identity, open documents, record fees, approve or reject registrations and transfers)
  - Title record (registration, ownership and owner history, documents with fingerprint check, fees, enquiries,
    on-chain history, GPS boundary)
  - Receipt page (official fees + gas cost per transaction, printable)
  - Public Verify page
  - Activity Log (including reverted calls)
  - Assumptions page
  - Notifications
- Docs: both READMEs, `masterplan.md`, a 6-slide presentation deck (how it works, core functions, on/off chain,
  assumptions).

## 8. What's left to build

### P0: before the presentation

| # | Task | Notes |
|---|---|---|
| 1 | **Click-through test in a browser** | The latest features were tested by code, not by eye. Walk the demo script in `masterplan.md` §6 as Efua → Abena → Lands Commission → public visitor. Check the receipt page, the document "Open" button (register a parcel with real files), fingerprint check, enquiry → owner notification, Review Queue fee recorder, privacy (public sees `GH-` IDs only). |
| 2 | **Commit and push the contracts repo** | `landchain-contracts` has uncommitted changes (FeeLedger, transfers, new seed, tests, README). |
| 3 | **Fill the deck placeholders** | Team names, course. Optionally a slide showing the Solidity code for the blocked `transferFrom` and the two-key transfer. |
| 4 | **Rehearse the live "tamper attempts"** | Kofi transferring Ama's land; identity officer approving; approving before fees; duplicate parcel ID; `transferFrom` in the Truffle tests. |

### P1: makes it real

| # | Task | Notes |
|---|---|---|
| 5 | **Deploy to Sepolia** | `npm run deploy:sepolia` with a throwaway wallet in `.env.local` (`TESTNET_PRIVATE_KEY`, `SEPOLIA_RPC_URL`, `REGISTRAR`, `ID_OFFICER`). Then `contracts:sync`, set `VITE_CHAIN_ID=11155111` in the web app. Seed manually or adapt `seed.js` (it assumes Ganache's 8 accounts). Add Etherscan links (`EXPLORER` in `chain/config.ts`). |
| 6 | **Django backend** (per Doc 1) | (a) document vault replacing `vault.ts` (IndexedDB), with access only for officers + owner; (b) enquiry inbox replacing `enquiries.ts` (localStorage), with relay to owner by email/SMS; (c) event indexer in Postgres so the app stops scanning all events in the browser; (d) officer transactions signed by backend-held role wallets (`POST /api/v1/chain/officer-actions`, see the note at the bottom of `chain/client.ts`). |
| 7 | **Transfer by public ID** | The transfer dialog currently lists demo accounts by name. In production the owner should type the buyer's public ID (`GH-…`) and see only "verified / not verified". |
| 8 | **Land certificate / register extract** | A printable certificate per title (serial = token id, plan number, boundary map, owner public ID, QR to the verify page) to use as a court exhibit. |
| 9 | **Encumbrances** | Mortgages, charges and cautions are part of a real register. New contract `EncumbranceRegistry` (registrar-recorded, blocks transfer while a caution is active). |

### P2: future work (the "what's next" slide)

- Registrar-assisted **key recovery** (owner loses wallet → registrar moves the title after identity re-check).
- **Multi-signature** registrar approvals.
- **Surveyor and lawyer sign-offs** before the registrar (multi-party approval). An earlier version had this.
- Leases and ground rent, succession and inheritance, **subdivision** of parcels.
- On-platform sale with escrow in a stablecoin, and a court role on chain for disputes.
- IPFS or encrypted storage for documents; PostGIS overlap checks on the backend.
- Mobile layout pass; local languages (Twi, Ga, Ewe); SMS notifications.
- Security: Slither static analysis and a peer review of the contracts before any public deployment.

## 9. Reference material in the shared folder

- `masterplan.md`: product spec, assumptions, documents/privacy/fees, demo script, data model.
- `Doc1_System_Architecture.docx`, `Doc2_Development_Practices.docx`, `Doc3_Need_to_Know_Resources.docx`: team docs.
- `Ghana_Land_Tokenization_Research_Brief 2.pdf`: background research.
- `UI/`: original mockups. Some show the old marketplace screens (Balance, Sale in escrow), which are out of scope now.
- `_backup_before_simplify_2026-11-19/`: the code and masterplan from before the scope cut.
