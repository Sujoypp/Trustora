import { useCallback, useEffect, useState } from 'react'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { erc20Abi, parseEventLogs, type Address, type Hex } from 'viem'
import { Amount, gasTokenToUsdc, usdcDecimalsFor, usdcToGasToken } from '@/onchain-money'
import { requireChain } from '@/onchain-facts'
import {
  CHAIN_ID,
  ROUTER_ADDRESS,
  USDC_ADDRESS,
  trustoraAbi,
  type Payment,
  type Rail,
  type ReceiptData,
} from '@/lib/trustora'
import { notifyError } from '@/lib/errors'

export type SendPhase =
  | 'idle'
  | 'switching'
  | 'signing-approval'
  | 'confirming-approval'
  | 'signing'
  | 'confirming'

export interface FeeEstimate {
  /** Fee in the 6-decimal USDC view. */
  usdc: bigint
  /** `approval` means the one-time allowance step is estimated; the send fee follows it. */
  kind: 'send' | 'approval'
}

interface Params {
  recipient: Address | null
  rail: Rail
  /** Amount in the 6-decimal USDC view, or null when the input is not valid yet. */
  amountRaw: bigint | null
  note: string
  onPending: (payment: Payment) => void
  onSettled: (txHash: Hex) => void
  onSuccess: (receipt: ReceiptData) => void
}

export function useSendPayment({ recipient, rail, amountRaw, note, onPending, onSettled, onSuccess }: Params) {
  const { address, chainId } = useAccount()
  const client = usePublicClient({ chainId: CHAIN_ID })
  const { writeContractAsync } = useWriteContract()
  const { switchChainAsync } = useSwitchChain()
  const [phase, setPhase] = useState<SendPhase>('idle')
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ sig: string; fee: FeeEstimate | null } | null>(null)

  const usdcDecimals = usdcDecimalsFor(CHAIN_ID)
  const nativeDecimals = requireChain(CHAIN_ID).nativeCurrency.decimals

  const sig =
    address && recipient && amountRaw !== null && amountRaw > 0n && ROUTER_ADDRESS
      ? [address, recipient, rail, amountRaw.toString(), note].join('|')
      : null
  const fee = sig !== null && result?.sig === sig ? result.fee : null
  const feeLoading = sig !== null && result?.sig !== sig

  useEffect(() => {
    if (sig === null || !client || !address || !ROUTER_ADDRESS || !recipient || amountRaw === null) return
    const router = ROUTER_ADDRESS
    const ctx = { cancelled: false }

    const estimate = async (): Promise<FeeEstimate | null> => {
      try {
        let gas: bigint
        let kind: FeeEstimate['kind'] = 'send'
        if (rail === 'native') {
          const value = usdcToGasToken(CHAIN_ID, Amount.fromRaw(amountRaw, usdcDecimals)).raw
          gas = await client.estimateContractGas({
            address: router,
            abi: trustoraAbi,
            functionName: 'sendNative',
            args: [recipient, note],
            value,
            account: address,
          })
        } else {
          const allowance = await client.readContract({
            address: USDC_ADDRESS,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [address, router],
          })
          if (allowance >= amountRaw) {
            gas = await client.estimateContractGas({
              address: router,
              abi: trustoraAbi,
              functionName: 'sendToken',
              args: [USDC_ADDRESS, recipient, amountRaw, note],
              account: address,
            })
          } else {
            kind = 'approval'
            gas = await client.estimateContractGas({
              address: USDC_ADDRESS,
              abi: erc20Abi,
              functionName: 'approve',
              args: [router, amountRaw],
              account: address,
            })
          }
        }
        const gasPrice = await client.getGasPrice()
        return { usdc: gasTokenToUsdc(CHAIN_ID, Amount.fromRaw(gas * gasPrice, nativeDecimals)).raw, kind }
      } catch {
        return null
      }
    }

    const timer = setTimeout(() => {
      void estimate().then((next) => {
        if (!ctx.cancelled) setResult({ sig, fee: next })
      })
    }, 250)
    return () => {
      ctx.cancelled = true
      clearTimeout(timer)
    }
  }, [sig, client, address, recipient, rail, amountRaw, note, usdcDecimals, nativeDecimals])

  const send = useCallback(async () => {
    if (!address || !client || !ROUTER_ADDRESS || !recipient || amountRaw === null || amountRaw <= 0n) return
    const router = ROUTER_ADDRESS
    setError(null)
    setTxHash(null)
    let pendingHash: Hex | undefined
    try {
      if (chainId !== CHAIN_ID) {
        setPhase('switching')
        await switchChainAsync({ chainId: CHAIN_ID })
      }

      if (rail === 'erc20') {
        const allowance = await client.readContract({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address, router],
        })
        if (allowance < amountRaw) {
          setPhase('signing-approval')
          const approveHash = await writeContractAsync({
            address: USDC_ADDRESS,
            abi: erc20Abi,
            functionName: 'approve',
            args: [router, amountRaw],
            chainId: CHAIN_ID,
          })
          setPhase('confirming-approval')
          const approval = await client.waitForTransactionReceipt({ hash: approveHash })
          if (approval.status !== 'success') throw new Error('Approval reverted')
        }
      }

      setPhase('signing')
      const hash =
        rail === 'native'
          ? await writeContractAsync({
              address: router,
              abi: trustoraAbi,
              functionName: 'sendNative',
              args: [recipient, note],
              value: usdcToGasToken(CHAIN_ID, Amount.fromRaw(amountRaw, usdcDecimals)).raw,
              chainId: CHAIN_ID,
            })
          : await writeContractAsync({
              address: router,
              abi: trustoraAbi,
              functionName: 'sendToken',
              args: [USDC_ADDRESS, recipient, amountRaw, note],
              chainId: CHAIN_ID,
            })
      pendingHash = hash
      setTxHash(hash)

      onPending({
        id: `${hash}-pending`,
        txHash: hash,
        blockNumber: 0n,
        logIndex: 0,
        sender: address,
        recipient,
        direction: recipient.toLowerCase() === address.toLowerCase() ? 'self' : 'sent',
        rail,
        amountRaw,
        note,
        timestamp: Math.floor(Date.now() / 1000),
        status: 'pending',
      })

      setPhase('confirming')
      const receipt = await client.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Transaction reverted')

      const [event] = parseEventLogs({ abi: trustoraAbi, eventName: 'PaymentSent', logs: receipt.logs })
      const feeNative = Amount.fromRaw(receipt.gasUsed * receipt.effectiveGasPrice, nativeDecimals)
      onSuccess({
        txHash: hash,
        blockNumber: receipt.blockNumber,
        sender: address,
        recipient,
        rail,
        amountRaw,
        note,
        timestamp: event ? Number(event.args.timestamp) : Math.floor(Date.now() / 1000),
        feeUsdc: gasTokenToUsdc(CHAIN_ID, feeNative).raw,
      })
    } catch (e) {
      const info = notifyError(e)
      if (info.kind !== 'rejected') setError(info.message)
    } finally {
      if (pendingHash) onSettled(pendingHash)
      setPhase('idle')
    }
  }, [
    address,
    chainId,
    client,
    recipient,
    rail,
    amountRaw,
    note,
    usdcDecimals,
    nativeDecimals,
    switchChainAsync,
    writeContractAsync,
    onPending,
    onSettled,
    onSuccess,
  ])

  return { phase, txHash, error, fee, feeLoading, send, clearError: () => setError(null) }
}
