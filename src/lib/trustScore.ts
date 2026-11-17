import type { Payment } from '@/lib/trustora'

export interface ScoreFactor {
  id: string
  label: string
  detail: string
  points: number
  max: number
}

export interface TrustScore {
  /** 0 to 100. */
  score: number
  tier: 'Building' | 'Established' | 'Trusted' | 'Elite'
  factors: ScoreFactor[]
}

interface Inputs {
  /** Number of transactions the wallet has sent. */
  nonce: number
  /** Spendable USDC (6-decimal view). */
  balanceRaw: bigint
  /** True when the address holds contract code instead of being a plain wallet. */
  hasCode: boolean
  payments: Payment[]
}

const ONE_USDC = 1_000_000n

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * Trustora Score: a transparent 0-100 reputation signal computed locally from
 * public Arc Mainnet data. It is not an Arc or Circle rating.
 */
export function computeTrustScore({ nonce, balanceRaw, hasCode, payments }: Inputs): TrustScore {
  const counterparties = new Set<string>()
  for (const p of payments) {
    if (p.direction === 'self') continue
    counterparties.add((p.direction === 'received' ? p.sender : p.recipient).toLowerCase())
  }

  const factors: ScoreFactor[] = [
    {
      id: 'activity',
      label: 'Wallet activity',
      detail: `${nonce} transaction${nonce === 1 ? '' : 's'} sent`,
      points: Math.round(clamp01(nonce / 50) * 30),
      max: 30,
    },
    {
      id: 'funded',
      label: 'Funded wallet',
      detail: balanceRaw >= ONE_USDC ? 'Holds 1 USDC or more' : 'Holds less than 1 USDC',
      points: balanceRaw >= ONE_USDC ? 15 : balanceRaw > 0n ? 7 : 0,
      max: 15,
    },
    {
      id: 'payments',
      label: 'Trustora payments',
      detail: `${payments.length} verified payment${payments.length === 1 ? '' : 's'}`,
      points: Math.round(clamp01(payments.length / 10) * 25),
      max: 25,
    },
    {
      id: 'network',
      label: 'Counterparty network',
      detail: `${counterparties.size} unique counterpart${counterparties.size === 1 ? 'y' : 'ies'}`,
      points: Math.round(clamp01(counterparties.size / 5) * 20),
      max: 20,
    },
    {
      id: 'account',
      label: 'Account type',
      detail: hasCode ? 'Smart contract account' : 'Standard wallet (EOA)',
      points: hasCode ? 5 : 10,
      max: 10,
    },
  ]

  const score = factors.reduce((sum, f) => sum + f.points, 0)
  const tier: TrustScore['tier'] = score >= 90 ? 'Elite' : score >= 70 ? 'Trusted' : score >= 40 ? 'Established' : 'Building'
  return { score, tier, factors }
}
