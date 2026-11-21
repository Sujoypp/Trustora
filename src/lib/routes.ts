export type NavId = 'dashboard' | 'send' | 'receive' | 'swap' | 'bridge' | 'escrow' | 'invoices' | 'links' | 'split' | 'recurring' | 'proof' | 'contract' | 'history' | 'vault' | 'settings'

export interface Crumb {
  label: string
  to?: string
}

export interface RouteDef {
  path: string
  nav: NavId
  title: string
  subtitle: string
  crumbs: Crumb[]
}

const DASH: Crumb = { label: 'Dashboard', to: '/' }

export const ROUTES: RouteDef[] = [
  { path: '/', nav: 'dashboard', title: 'Dashboard', subtitle: 'Your balance, trust score and the four core tools.', crumbs: [{ label: 'Dashboard' }] },
  {
    path: '/send',
    nav: 'send',
    title: 'Send & Receive',
    subtitle: 'Instant USDC transfers, QR codes and payment links.',
    crumbs: [DASH, { label: 'Send & Receive' }],
  },
  {
    path: '/receive',
    nav: 'receive',
    title: 'Send & Receive',
    subtitle: 'Instant USDC transfers, QR codes and payment links.',
    crumbs: [DASH, { label: 'Send & Receive' }],
  },
  {
    path: '/swap',
    nav: 'swap',
    title: 'Circle Swap',
    subtitle: 'Swap USDC, EURC and cirBTC on Arc Mainnet with a live rate preview.',
    crumbs: [DASH, { label: 'Circle Swap' }],
  },
  {
    path: '/bridge',
    nav: 'bridge',
    title: 'CCTP Bridge',
    subtitle: 'Move native USDC between Arc Mainnet and other chains with Circle CCTP.',
    crumbs: [DASH, { label: 'CCTP Bridge' }],
  },
  {
    path: '/escrow',
    nav: 'escrow',
    title: 'Escrow & Agreements',
    subtitle: 'Hold USDC until conditions are met: smart escrow, milestone payments and trust agreements.',
    crumbs: [DASH, { label: 'Escrow & Agreements' }],
  },
  {
    path: '/invoices',
    nav: 'invoices',
    title: 'Smart Invoices',
    subtitle: 'Create, share and pay invoices recorded onchain.',
    crumbs: [DASH, { label: 'Smart Invoices' }],
  },
  {
    path: '/links',
    nav: 'links',
    title: 'Payment Links',
    subtitle: 'Shareable USDC payment links and QR codes.',
    crumbs: [DASH, { label: 'Payment Links' }],
  },
  {
    path: '/split',
    nav: 'split',
    title: 'Split Payments',
    subtitle: 'Send one payment to several wallets in a single transaction.',
    crumbs: [DASH, { label: 'Split Payments' }],
  },
  {
    path: '/recurring',
    nav: 'recurring',
    title: 'Recurring Payments',
    subtitle: 'Schedule authorized recurring USDC payments.',
    crumbs: [DASH, { label: 'Recurring Payments' }],
  },
  {
    path: '/proof',
    nav: 'proof',
    title: 'Onchain Proof',
    subtitle: 'Verify transactions and records straight from Arc Mainnet.',
    crumbs: [DASH, { label: 'Onchain Proof' }],
  },
  {
    path: '/contract',
    nav: 'contract',
    title: 'Smart Contract',
    subtitle: 'Status, holdings and execution details of the Trustora payment contract.',
    crumbs: [DASH, { label: 'Smart Contract' }],
  },
  {
    path: '/history',
    nav: 'history',
    title: 'Transaction History',
    subtitle: 'A searchable live log of your transfers, with digital receipts and exports.',
    crumbs: [DASH, { label: 'Transaction History' }],
  },
  {
    path: '/vault',
    nav: 'vault',
    title: 'Trustora Score & Mainnet Status',
    subtitle: 'Your Trustora Score, self-custody status, CCTP readiness, live network health and spending protection.',
    crumbs: [DASH, { label: 'Trustora Score & Mainnet Status' }],
  },
  {
    path: '/settings',
    nav: 'settings',
    title: 'Settings',
    subtitle: 'RPC status, wallet and local data.',
    crumbs: [DASH, { label: 'Settings' }],
  },
]

export function matchRoute(path: string): RouteDef | undefined {
  return ROUTES.find((r) => r.path === path)
}

/** Where "Back" goes when there is no earlier screen in this session. */
export function parentPath(route: RouteDef): string {
  const parents = route.crumbs.filter((c) => c.to)
  return parents.length > 0 ? parents[parents.length - 1].to! : '/'
}
