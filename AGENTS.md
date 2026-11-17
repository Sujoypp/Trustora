# [App Name]

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

[Brief description of what the app does and its primary use case]

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Mainnet (Chain ID: 5042, from the onchain facts registry)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Mainnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## Share links

- Starter apps already ship `getShareBase`, `buildShareLink` and `installShareSync` in `src/lib/share.ts`; import them instead of rewriting them.
- Keep shareable state in the URL path or query, not in the `#fragment`.
- Never put a secret (private key, claim secret, seed phrase, session token, API key) in the URL path or query, encoded or not: every in-app path and query is mirrored to the visitor's studio.arc.io address bar and browser history and reaches servers. A bearer claim secret goes only in the `#fragment` appended to the share link (`` `${await buildShareLink('/claim')}#${secret}` ``) and is read from `location.hash` on load. A link to the app's own share URL shown inside the app must be copy-only or open in a new tab with `target="_blank" rel="noopener noreferrer"`.
- Build every link a user copies or sends with `buildShareLink()` from `src/lib/share.ts`.
- Keep the `installShareSync()` call in `src/main.tsx` when editing it; it keeps the Studio address bar in step with in-app navigation.
- Navigate inside the app with relative links.

## To Run

```bash
bun install
bun run dev
```

## Trustora

- Contract: `contracts/TrustoraPay.sol` (sendNative, sendToken, PaymentSent event with indexed token). Replaced with the user's own version; review pending. Not yet deployed.
- Network: the app is locked to Arc Mainnet (no testnet mode). Contract values use `VITE_TRUSTORA_PAY_ADDRESS_MAINNET` and `VITE_TRUSTORA_PAY_DEPLOY_BLOCK_MAINNET`; Arc Studio never fills them in, the user deploys and reviews the contract themselves.
- On Arc the native gas token IS USDC: one balance, shown once from the ERC-20 view. "Native USDC" and "USDC (ERC-20)" are two transfer rails for the same funds.
- Hooks: `src/hooks/useSendPayment.ts` (fee estimate, allowance, send), `usePaymentHistory.ts` (event scan from the deploy block, cached in localStorage).

## Navigation (latest)

- Path-based routes via `src/lib/router.ts` and `src/lib/routes.ts`; pages live in `src/pages/`. Every page uses `PageHeader` (Back button and breadcrumbs); modals use `BackButton`.
- Payment links open at `/?to=...&amt=...&note=...` and are redirected to `/send`. Static hosts need an SPA fallback (`public/_redirects` and `vercel.json` are included).
- Contract now also has `sendNativeBatch`, `sendTokenBatch` (best-effort, `PaymentFailed` events) and `claimRefund`. Balanced review done; the last change (cap on refund gas) was applied after the final review round. Still not deployed.
