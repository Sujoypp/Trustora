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
  /** Verifiable completed records read from the Trustora contracts. */
  records?: { milestones: number; invoicesSettled: number; scheduled: number }
}

const ONE_USDC = 1_000_000n

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * Trustora Score: a transparent 0-100 reputation signal computed locally from
 * public Arc Mainnet data. It is not an Arc or Circle rating.
 */
export function computeTrustScore({ nonce, balanceRaw, hasCode, payments, records = { milestones: 0, invoicesSettled: 0, scheduled: 0 } }: Inputs): TrustScore {
  const counterparties = new Set<string>()
  for (const p of payments) {
    if (p.direction === 'self') continue
    counterparties.add((p.direction === 'received' ? p.sender : p.recipient).toLowerCase())
  }

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const factors: ScoreFactor[] = [
    {
      id: 'activity',
      label: 'Wallet activity',
      detail: `${plural(nonce, 'transaction', 'transactions')} sent`,
      points: Math.round(clamp01(nonce / 50) * 20),
      max: 20,
    },
    {
      id: 'funded',
      label: 'Funded wallet',
      detail: balanceRaw >= ONE_USDC ? 'Holds 1 USDC or more' : 'Holds less than 1 USDC',
      points: balanceRaw >= ONE_USDC ? 10 : balanceRaw > 0n ? 5 : 0,
      max: 10,
    },
    {
      id: 'payments',
      label: 'Trustora payments',
      detail: `${plural(payments.length, 'verified payment', 'verified payments')}`,
      points: Math.round(clamp01(payments.length / 10) * 15),
      max: 15,
    },
    {
      id: 'network',
      label: 'Counterparty network',
      detail: `${counterparties.size} unique counterpart${counterparties.size === 1 ? 'y' : 'ies'}`,
      points: Math.round(clamp01(counterparties.size / 5) * 10),
      max: 10,
    },
    {
      id: 'milestones',
      label: 'Completed escrow milestones',
      detail: `${plural(records.milestones, 'milestone', 'milestones')} released onchain`,
      points: Math.round(clamp01(records.milestones / 5) * 20),
      max: 20,
    },
    {
      id: 'invoices',
      label: 'Settled invoices',
      detail: `${plural(records.invoicesSettled, 'invoice', 'invoices')} paid onchain`,
      points: Math.round(clamp01(records.invoicesSettled / 5) * 10),
      max: 10,
    },
    {
      id: 'recurring',
      label: 'Recurring payments made',
      detail: `${plural(records.scheduled, 'scheduled payment', 'scheduled payments')} executed`,
      points: Math.round(clamp01(records.scheduled / 10) * 10),
      max: 10,
    },
    {
      id: 'account',
      label: 'Account type',
      detail: hasCode ? 'Smart contract account' : 'Standard wallet (EOA)',
      points: hasCode ? 3 : 5,
      max: 5,
    },
  ]

  const score = factors.reduce((sum, f) => sum + f.points, 0)
  const tier: TrustScore['tier'] = score >= 90 ? 'Elite' : score >= 70 ? 'Trusted' : score >= 40 ? 'Established' : 'Building'
  return { score, tier, factors }
}
