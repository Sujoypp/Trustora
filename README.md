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

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://getfoundry.sh).

```bash
bun install
bun run dev      # start the app on port 5173
bun run check    # lint and typecheck
bun run build    # production build
forge build      # compile contracts/TrustoraPay.sol
```

## Environment variables

- `VITE_TRUSTORA_PAY_ADDRESS_MAINNET`: address of your TrustoraPay contract on Arc Mainnet. Deploy and review it yourself first. Sending and history stay paused until it is set.
- `VITE_TRUSTORA_PAY_DEPLOY_BLOCK_MAINNET`: block the contract was deployed at. History scans start here.
- `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS`: provisioned by Arc Studio. Optional outside Arc Studio.

Restart the dev server after changing `.env`.
