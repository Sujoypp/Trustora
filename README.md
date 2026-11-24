# Trustora

A clean, institutional-style payment app for Arc Mainnet. Send USDC with an optional note stored onchain, receive with a QR code, and follow your payment history live.

Built with [Arc Studio](https://studio.arc.io)

## Features

- Runs on Arc Mainnet only: no network switch and no testnet mode. The top bar shows a live "Arc Mainnet" status pill, and a slim footer shows the contract address (tap to copy) and custody status
- Dashboard with a hero card (total balance with a USD, EUR or GBP switcher, a "Circle USDC Native" check and a Quick Send button) and six cards: Send & Receive, Swap, Bridge, Smart Contract, History, and Trustora Score & Mainnet Status
- Send & Receive: instant USDC transfers (native or ERC-20) with a live fee estimate, MAX button, optional onchain note and a locked-on "pay network gas in USDC" switch (Arc's gas token is USDC). Receive opens a modal with a USDC and CCTP readiness badge, a QR code and shareable payment links
- Circle Swap: swap USDC, EURC and cirBTC on Arc Mainnet with a live rate preview and a slippage choice, using Circle's App Kit. USDC and Arc's native gas token are the same asset, so that pair is not offered
- CCTP Bridge: move native USDC between Arc Mainnet and Ethereum, Base, Arbitrum, Optimism, Polygon or Avalanche with Circle's Cross-Chain Transfer Protocol and Forwarding Service, with a fee estimate, step list and resume after a failed step
- Smart Contract: the Trustora payment contract address with one-click copy, live onchain status, explorer links, holdings and your recent executions
- Transaction History: a searchable log with status, token and memo-tag filters. Selecting a payment opens its digital receipt as a slide-over with the TxID and an explorer link. Statement export (PDF, CSV, JSON) and calendar reminders
- Trustora Score & Mainnet Status: a transparent score with its breakdown, non-custodial self-custody status, CCTP readiness, live network latency, balance privacy, large-payment warnings and a multisig guard preview (co-signer approval is not enforced onchain)
- Fee clarity: every fee estimate is shown in USDC with a note that fees on Arc Mainnet are dynamic, not fixed. Amounts are formatted from the exact decimal strings, and rejected or failed actions show a clear inline message
- Connection status: a notice appears only when the browser is offline, the Arc Mainnet node stops answering (with a Retry button), the wallet is reconnecting, or the wallet disconnected
- Ecosystem notes: small live badges for Arc Mainnet execution, Circle USDC and CCTP readiness
- A step-by-step transaction window (Signing, Broadcasting, Confirmed) with an explorer link
- Clear error messages and notifications for cancelled requests, timeouts, connection loss and low-fee conditions, plus a recovery screen if a page fails
- Every sub-page has a "Back to Dashboard" button and breadcrumbs
- Ambient animated background and logo built from CSS and SVG only

## Tech stack

React, TypeScript, Vite, Tailwind CSS, wagmi, viem, ConnectKit, Solidity (Foundry, OpenZeppelin)

## Interface

- A public landing page for visitors without a connected wallet (open the app from "Launch App" or by connecting). Payment and invoice links skip it and open the tool directly.
- A midnight-navy design system with a labeled sidebar on large screens, an icon rail on tablets and a bottom navigation bar on phones.
- A dashboard with a balance card, real analytics built from your payments, and the core and payment tools.

## Payment tools

- Escrow & Agreements: hold USDC until conditions are met, with milestone approvals, auto-release, disputes through an arbiter, and refunds.
- Smart Invoices, Split Payments and Recurring Payments: non-custodial, USDC moves straight from payer to recipient.
- Payment Links and Onchain Proof: shareable links and QR codes, and transaction verification read directly from Arc Mainnet.
- The new contracts hold or move real USDC. Review them and get an independent audit before deploying them to mainnet.

## Deploying the Escrow contract (Arc Mainnet)

The Escrow screen stays off until `VITE_TRUSTORA_ESCROW_ADDRESS_MAINNET` points at a contract that passes every check. Arc Studio never deploys to mainnet, so you do this from your own machine and wallet. Every step costs real USDC and cannot be undone.

1. Review and test: `forge build` then `forge test`. Get an independent audit before it holds real funds.
2. Use a dedicated deployer wallet and fund it with a little USDC on Arc Mainnet (gas is paid in USDC; the dry run prints the maximum fee).
3. Dry run (sends nothing): `DEPLOYER_PRIVATE_KEY=0x... bun run deploy:escrow`. It checks that the RPC is chain 5042, that the Circle USDC address from the onchain registry answers as USDC with 6 decimals, and that the compiled artifact is current.
4. Deploy: `DEPLOYER_PRIVATE_KEY=0x... bun run deploy:escrow -- --broadcast --write-env`. You must type `DEPLOY TO MAINNET` in the terminal. The key is read only from that variable and is never printed or saved. After deploying, the script reads the contract back (code exists, `usdc()` equals the Circle USDC address) and writes the address to `.env`.
5. Remix instead of the script: compile `contracts/TrustoraEscrow.sol` with solc 0.8.28, optimizer on at 200 runs, EVM `cancun`, choose the `TrustoraEscrow` contract, and give the Circle USDC address on Arc as the only constructor argument. Then set the address by hand.
6. Set `VITE_TRUSTORA_ESCROW_ADDRESS_MAINNET` in `.env`, restart the dev server, and add the same variable to your hosting provider before the next build.
7. Publish the source on the Arc Explorer ("Verify & publish") with the same compiler settings and the constructor argument the script prints.
8. Try a very small deal first: create, mark delivered, release, and refund paths.

`bun run deploy:flows` deploys the invoice, split and recurring contract the same way.

## Insights and records

- Advanced Analytics, Transaction Intelligence and Wallet Trust Profiles read your confirmed payments and onchain records. They need no extra contract.
- The notification bell lists payments you received and actions waiting on you. Optional desktop alerts work only while TRUSTORA is open in a tab; true background push needs a server and is not included.
- Receipts download as a PDF with the transaction hash, a QR code and a link that opens the proof page, which re-reads the payment from the chain.
- Transaction history loads from `public/router-index.json` (every payment the router has emitted, built by `bun run index:router`) and then reads only the blocks since, one paced request at a time. Arc Mainnet's public RPC rejects log ranges above 10,000 blocks and allows about 3 requests per second, so this keeps first loads fast. Run `bun run index:router` before each deploy to keep the tail short.
- `bun run test:chain` runs read-only checks against the real Arc Mainnet: chain id, Circle USDC, Multicall3, the payment router, the history scan and the index file.
- `bun run test:logic` checks the analytics, intelligence, notification and PDF logic.

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://getfoundry.sh).

```bash
bun install
bun run dev      # start the app on port 5173
bun run check    # lint and typecheck
bun run build    # production build
forge build      # compile the contracts in contracts/
forge test       # run the contract tests
```

## Environment variables

- `VITE_TRUSTORA_PAY_ADDRESS_MAINNET`: address of your TrustoraPay contract on Arc Mainnet. Deploy and review it yourself first. Sending and history stay paused until it is set.
- `VITE_TRUSTORA_PAY_DEPLOY_BLOCK_MAINNET`: block the contract was deployed at. History scans start here.
- `VITE_TRUSTORA_ESCROW_ADDRESS_MAINNET`: address of your `TrustoraEscrow` contract (escrow, milestone payments, trust agreements). Deploy it yourself with the Arc USDC address as the constructor argument. The Escrow screen stays off until it is set.
- `VITE_TRUSTORA_FLOWS_ADDRESS_MAINNET`: address of your `TrustoraFlows` contract (invoices, split payments, recurring payments), deployed the same way. Those screens stay off until it is set.
- `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS`: provisioned by Arc Studio. Optional outside Arc Studio.

Restart the dev server after changing `.env`.
