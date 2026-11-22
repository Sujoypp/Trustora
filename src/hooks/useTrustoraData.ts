import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { erc20Abi, type Address } from 'viem'
import { ESCROW_ADDRESS, FLOWS_ADDRESS, InvoiceStatus, MilestoneState, escrowAbi, flowsAbi } from '@/lib/contracts'
import { CHAIN_ID, NETWORK_NAME, USDC_ADDRESS } from '@/lib/trustora'

/** Most recent records read per wallet (keeps the number of RPC reads small and predictable). */
const MAX_RECORDS = 40
const REFRESH_MS = 20_000

function useChainClient() {
  return usePublicClient({ chainId: CHAIN_ID })
}

/** Escrow deals (escrow, milestones, agreements) the wallet takes part in, newest first. */
export function useEscrowDeals(user?: Address) {
  const client = useChainClient()
  return useQuery({
    queryKey: ['trustora', 'escrow', user],
    enabled: Boolean(user && client && ESCROW_ADDRESS),
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const contract = ESCROW_ADDRESS
      if (!client || !user || !contract) return []
      const ids = await client.readContract({ address: contract, abi: escrowAbi, functionName: 'idsOf', args: [user] })
      return Promise.all(
        [...ids]
          .reverse()
          .slice(0, MAX_RECORDS)
          .map(async (id) => {
            const [agreement, milestones] = await Promise.all([
              client.readContract({ address: contract, abi: escrowAbi, functionName: 'getAgreement', args: [id] }),
              client.readContract({ address: contract, abi: escrowAbi, functionName: 'getMilestones', args: [id] }),
            ])
            return { id, agreement, milestones }
          }),
      )
    },
  })
}
export type Deal = NonNullable<ReturnType<typeof useEscrowDeals>['data']>[number]

/** Invoices the wallet issued or was named as the payer of, newest first. */
export function useInvoices(user?: Address) {
  const client = useChainClient()
  return useQuery({
    queryKey: ['trustora', 'invoices', user],
    enabled: Boolean(user && client && FLOWS_ADDRESS),
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const contract = FLOWS_ADDRESS
      if (!client || !user || !contract) return []
      const ids = await client.readContract({ address: contract, abi: flowsAbi, functionName: 'invoiceIdsOf', args: [user] })
      return Promise.all(
        [...ids]
          .reverse()
          .slice(0, MAX_RECORDS)
          .map(async (id) => ({ id, invoice: await client.readContract({ address: contract, abi: flowsAbi, functionName: 'getInvoice', args: [id] }) })),
      )
    },
  })
}
export type InvoiceRow = NonNullable<ReturnType<typeof useInvoices>['data']>[number]

/** One invoice by id, readable by anyone with the link. */
export function useInvoice(id?: bigint) {
  const client = useChainClient()
  return useQuery({
    queryKey: ['trustora', 'invoice', id?.toString()],
    enabled: Boolean(id !== undefined && client && FLOWS_ADDRESS),
    refetchInterval: REFRESH_MS,
    retry: false,
    queryFn: async () => {
      const contract = FLOWS_ADDRESS
      if (!client || id === undefined || !contract) return null
      return client.readContract({ address: contract, abi: flowsAbi, functionName: 'getInvoice', args: [id] })
    },
  })
}

/** Recurring schedules where the wallet is the payer or the payee, newest first. */
export function useSchedules(user?: Address) {
  const client = useChainClient()
  return useQuery({
    queryKey: ['trustora', 'schedules', user],
    enabled: Boolean(user && client && FLOWS_ADDRESS),
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const contract = FLOWS_ADDRESS
      if (!client || !user || !contract) return []
      const ids = await client.readContract({ address: contract, abi: flowsAbi, functionName: 'scheduleIdsOf', args: [user] })
      return Promise.all(
        [...ids]
          .reverse()
          .slice(0, MAX_RECORDS)
          .map(async (id) => ({ id, schedule: await client.readContract({ address: contract, abi: flowsAbi, functionName: 'getSchedule', args: [id] }) })),
      )
    },
  })
}
export type ScheduleRow = NonNullable<ReturnType<typeof useSchedules>['data']>[number]

/** Split payments the wallet sent, newest first. */
export function useSplits(user?: Address) {
  const client = useChainClient()
  return useQuery({
    queryKey: ['trustora', 'splits', user],
    enabled: Boolean(user && client && FLOWS_ADDRESS),
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const contract = FLOWS_ADDRESS
      if (!client || !user || !contract) return []
      const ids = await client.readContract({ address: contract, abi: flowsAbi, functionName: 'splitIdsOf', args: [user] })
      return Promise.all(
        [...ids]
          .reverse()
          .slice(0, MAX_RECORDS)
          .map(async (id) => ({ id, split: await client.readContract({ address: contract, abi: flowsAbi, functionName: 'getSplit', args: [id] }) })),
      )
    },
  })
}
export type SplitRow = NonNullable<ReturnType<typeof useSplits>['data']>[number]

export interface DeploymentCheck {
  id: 'network' | 'code' | 'usdc' | 'token'
  label: string
  /** true passed, false failed, null could not be checked (an earlier check failed or the node did not answer). */
  ok: boolean | null
  detail: string
}

/**
 * Validates a configured contract before its screen is enabled: the node is Arc Mainnet (chain 5042), the address has
 * code, the contract was deployed with the Circle USDC address from the registry, and that token answers as USDC with
 * 6 decimals. Every check reads real chain state.
 */
export function useDeployment(address: Address | undefined, abiKind: 'escrow' | 'flows') {
  const client = useChainClient()
  return useQuery({
    queryKey: ['trustora', 'deployment', address],
    enabled: Boolean(address && client),
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async (): Promise<{ ready: boolean; checks: DeploymentCheck[] }> => {
      if (!client || !address) return { ready: false, checks: [] }
      const checks: DeploymentCheck[] = []
      const run = async (id: DeploymentCheck['id'], label: string, fn: () => Promise<{ ok: boolean; detail: string }>) => {
        const blocked = checks.some((c) => c.ok !== true)
        if (blocked) {
          checks.push({ id, label, ok: null, detail: 'Not checked because an earlier check did not pass.' })
          return
        }
        try {
          const r = await fn()
          checks.push({ id, label, ...r })
        } catch {
          checks.push({ id, label, ok: null, detail: 'Could not be read from the network right now.' })
        }
      }
      await run('network', `Network is ${NETWORK_NAME} (chain ${CHAIN_ID})`, async () => {
        const id = await client.getChainId()
        return { ok: id === CHAIN_ID, detail: id === CHAIN_ID ? `The node reports chain ${id}.` : `The node reports chain ${id}, not ${CHAIN_ID}.` }
      })
      await run('code', 'Contract code exists at the address', async () => {
        const code = await client.getCode({ address })
        const ok = Boolean(code && code !== '0x')
        return { ok, detail: ok ? 'Contract code found.' : 'There is no contract at this address on Arc Mainnet.' }
      })
      await run('usdc', 'Contract uses the Circle USDC address', async () => {
        const configured = abiKind === 'escrow' ? await client.readContract({ address, abi: escrowAbi, functionName: 'usdc' }) : await client.readContract({ address, abi: flowsAbi, functionName: 'usdc' })
        const ok = configured.toLowerCase() === USDC_ADDRESS.toLowerCase()
        return { ok, detail: ok ? `usdc() is ${USDC_ADDRESS}.` : `usdc() is ${configured}, but Circle's Arc USDC is ${USDC_ADDRESS}. Deploy a new contract with the right address.` }
      })
      await run('token', 'That token answers as USDC with 6 decimals', async () => {
        const [symbol, decimals] = await Promise.all([
          client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'symbol' }),
          client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'decimals' }),
        ])
        const ok = symbol === 'USDC' && decimals === 6
        return { ok, detail: ok ? 'symbol USDC, 6 decimals.' : `The token reports ${symbol} with ${decimals} decimals.` }
      })
      return { ready: checks.length === 4 && checks.every((c) => c.ok === true), checks }
    },
  })
}

/** Counts of verifiable completed records, used by the Trust Score. */
export function useTrustRecords(user?: Address) {
  const deals = useEscrowDeals(user).data
  const invoices = useInvoices(user).data
  const schedules = useSchedules(user).data
  return useMemo(() => {
    let milestones = 0
    for (const d of deals ?? []) for (const m of d.milestones) if (m.state === MilestoneState.Released) milestones++
    let invoicesSettled = 0
    for (const row of invoices ?? []) if (row.invoice.status === InvoiceStatus.Paid) invoicesSettled++
    let scheduled = 0
    for (const row of schedules ?? []) scheduled += row.schedule.executed
    return { milestones, invoicesSettled, scheduled }
  }, [deals, invoices, schedules])
}

/** The creation event of an agreement: its full terms text and the transaction that created it (read from one block). */
export function useAgreementCreation(id: bigint, createdBlock: bigint, enabled: boolean) {
  const client = useChainClient()
  return useQuery({
    queryKey: ['trustora', 'agreement-created', id.toString()],
    enabled: enabled && Boolean(client && ESCROW_ADDRESS),
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const contract = ESCROW_ADDRESS
      if (!client || !contract) return null
      const logs = await client.getContractEvents({
        address: contract,
        abi: escrowAbi,
        eventName: 'AgreementCreated',
        args: { id },
        fromBlock: createdBlock,
        toBlock: createdBlock,
      })
      const log = logs[0]
      return log ? { terms: log.args.terms ?? '', txHash: log.transactionHash } : null
    },
  })
}

/** The recipients of one split payment and the transaction that paid them (read from one block). */
export function useSplitLegs(splitId: bigint, createdBlock: bigint, enabled: boolean) {
  const client = useChainClient()
  return useQuery({
    queryKey: ['trustora', 'split-legs', splitId.toString()],
    enabled: enabled && Boolean(client && FLOWS_ADDRESS),
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const contract = FLOWS_ADDRESS
      if (!client || !contract) return null
      const logs = await client.getContractEvents({ address: contract, abi: flowsAbi, eventName: 'SplitLeg', args: { splitId }, fromBlock: createdBlock, toBlock: createdBlock })
      const legs = logs.map((l) => ({ recipient: l.args.recipient as Address, amount: l.args.amount as bigint }))
      return { legs, txHash: logs[0]?.transactionHash }
    },
  })
}

export type RecordKind = 'escrow' | 'invoice' | 'schedule' | 'split'

/** The transaction that created a record, found by reading the creation event in the record's block. */
export function useCreationTx(kind: RecordKind, id: bigint, createdBlock: bigint, enabled: boolean) {
  const client = useChainClient()
  return useQuery({
    queryKey: ['trustora', 'creation-tx', kind, id.toString()],
    enabled: enabled && Boolean(client && (kind === 'escrow' ? ESCROW_ADDRESS : FLOWS_ADDRESS)),
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      if (!client) return null
      const range = { fromBlock: createdBlock, toBlock: createdBlock }
      if (kind === 'escrow' && ESCROW_ADDRESS) {
        const logs = await client.getContractEvents({ address: ESCROW_ADDRESS, abi: escrowAbi, eventName: 'AgreementCreated', args: { id }, ...range })
        return logs[0]?.transactionHash ?? null
      }
      if (!FLOWS_ADDRESS) return null
      if (kind === 'invoice') {
        const logs = await client.getContractEvents({ address: FLOWS_ADDRESS, abi: flowsAbi, eventName: 'InvoiceCreated', args: { id }, ...range })
        return logs[0]?.transactionHash ?? null
      }
      if (kind === 'schedule') {
        const logs = await client.getContractEvents({ address: FLOWS_ADDRESS, abi: flowsAbi, eventName: 'ScheduleCreated', args: { id }, ...range })
        return logs[0]?.transactionHash ?? null
      }
      const logs = await client.getContractEvents({ address: FLOWS_ADDRESS, abi: flowsAbi, eventName: 'SplitPaid', args: { splitId: id }, ...range })
      return logs[0]?.transactionHash ?? null
    },
  })
}
