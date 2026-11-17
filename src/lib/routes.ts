export type NavId = 'dashboard' | 'send' | 'receive' | 'contract' | 'history' | 'vault' | 'settings'

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
    title: 'Security & Mainnet Status',
    subtitle: 'Live network health, non-custodial security checks and spending protection.',
    crumbs: [DASH, { label: 'Security & Mainnet Status' }],
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
