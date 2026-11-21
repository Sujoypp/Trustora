import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { erc20Abi, type Abi, type Address, type Hex, type TransactionReceipt } from 'viem'
import { toast } from 'sonner'
import { TxProgress } from '@/components/TxProgress'
import type { SendPhase } from '@/hooks/useSendPayment'
import { notifyError } from '@/lib/errors'
import { CHAIN_ID, USDC_ADDRESS } from '@/lib/trustora'
import { buildTxExplorerUrl } from '@/onchain-facts'

export interface TxRequest {
  address: Address
  abi: Abi | readonly unknown[]
  functionName: string
  args: readonly unknown[]
  /** If set, USDC allowance for `address` is raised to this amount first (exact amount, never unlimited). */
  approveAmount?: bigint
  /** Heading of the progress window. */
  title: string
  /** Toast shown once the transaction is confirmed. */
  success: string
}

/**
 * One real transaction, end to end: switch to Arc Mainnet, raise the USDC allowance if needed, simulate the call
 * (so a contract refusal shows a readable reason before any signature), sign, wait for the confirmation, then
 * refresh every onchain read. Returns the receipt, or null when it was cancelled or failed (an error is shown).
 */
export function useOnchainTx() {
  const { address, chainId } = useAccount()
  const client = usePublicClient({ chainId: CHAIN_ID })
  const { writeContractAsync } = useWriteContract()
  const { switchChainAsync } = useSwitchChain()
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<SendPhase>('idle')
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [title, setTitle] = useState('')

  const run = useCallback(
    async (req: TxRequest): Promise<TransactionReceipt | null> => {
      if (!address || !client) {
        toast.error('Connect your wallet first', { id: 'connect-first' })
        return null
      }
      setTitle(req.title)
      setTxHash(null)
      try {
        if (chainId !== CHAIN_ID) {
          setPhase('switching')
          await switchChainAsync({ chainId: CHAIN_ID })
        }
        if (req.approveAmount && req.approveAmount > 0n) {
          const allowance = await client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [address, req.address] })
          if (allowance < req.approveAmount) {
            setPhase('signing-approval')
            const approval = await writeContractAsync({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [req.address, req.approveAmount], chainId: CHAIN_ID })
            setPhase('confirming-approval')
            const approved = await client.waitForTransactionReceipt({ hash: approval })
            if (approved.status !== 'success') throw new Error('The USDC approval did not go through.')
          }
        }
        const { request } = await client.simulateContract({
          account: address,
          address: req.address,
          abi: req.abi,
          functionName: req.functionName,
          args: req.args,
        } as never)
        setPhase('signing')
        const hash = await writeContractAsync(request as never)
        setTxHash(hash)
        setPhase('confirming')
        const receipt = await client.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error('The transaction reverted onchain.')
        toast.success(req.success, {
          action: { label: 'View', onClick: () => window.open(buildTxExplorerUrl(CHAIN_ID, hash), '_blank', 'noopener,noreferrer') },
        })
        void queryClient.invalidateQueries()
        return receipt
      } catch (error) {
        notifyError(error)
        return null
      } finally {
        setPhase('idle')
      }
    },
    [address, chainId, client, queryClient, switchChainAsync, writeContractAsync],
  )

  return { run, busy: phase !== 'idle', progress: <TxProgress phase={phase} txHash={txHash} title={title} /> }
}
