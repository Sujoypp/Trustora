# Trustora

A clean, institutional-style payment app for Arc Mainnet. Send USDC with an optional note stored onchain, receive with a QR code, and follow your payment history live.

Built with [Arc Studio](https://studio.arc.io)

## Features

- Runs on Arc Mainnet only. There is no network switch and no testnet mode. The top bar shows the live network (block height, node response time and gas), and a banner lists a protocol readiness checklist
- Dashboard with a hero banner (live USDC balance in USD, EUR or GBP, and an Arc Trust Score) and four core tools
- Send & Receive: instant USDC transfers (native or ERC-20) with a live network fee estimate, a MAX button, an optional onchain note, QR codes and shareable payment links
- Smart Contract: live status, holdings and execution details of the Trustora payment contract, with explorer links
- Transaction History: a searchable live log with status, token and memo-tag filters, a digital receipt for each payment, statement export (PDF, CSV, JSON) and calendar reminders
- Security & Mainnet Status: live network health, non-custodial security checks, balance privacy, large-payment warnings and a multisig guard preview (co-signer approval is not enforced onchain)
- A step-by-step transaction window (Signing, Broadcasting, Confirmed) with a link to the transaction on the block explorer
- Clear error messages and notifications for cancelled requests, timeouts, connection loss and low-fee conditions, plus a recovery screen if a page fails
- A footer with the non-custodial statement and live block height, latency and gas
- Every sub-page has a "Back to Dashboard" button and breadcrumbs

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
