import { toast } from 'sonner'

export type ErrorKind =
  | 'rejected'
  | 'timeout'
  | 'network'
  | 'low-gas'
  | 'insufficient'
  | 'reverted'
  | 'wrong-network'
  | 'pending-request'
  | 'unknown'

export interface ErrorInfo {
  kind: ErrorKind
  title: string
  message: string
}

interface Piece {
  name: string
  code?: number
  text: string
}

/** Flattens a wallet / viem error and its causes into names, codes and lowercase messages. */
function pieces(error: unknown): Piece[] {
  const out: Piece[] = []
  let current: unknown = error
  for (let depth = 0; depth < 6 && current; depth++) {
    const e = current as { name?: string; code?: number; shortMessage?: string; message?: string; cause?: unknown }
    out.push({ name: e.name ?? '', code: typeof e.code === 'number' ? e.code : undefined, text: `${e.shortMessage ?? ''} ${e.message ?? ''}`.toLowerCase() })
    current = e.cause
  }
  return out
}

const has = (ps: Piece[], ...needles: string[]) => ps.some((p) => needles.some((n) => p.text.includes(n)))
const named = (ps: Piece[], ...names: string[]) => ps.some((p) => names.includes(p.name))
const coded = (ps: Piece[], ...codes: number[]) => ps.some((p) => p.code !== undefined && codes.includes(p.code))

/** Turns any wallet, RPC or contract failure into a clear title and a next step for the person using the app. */
export function classifyError(error: unknown): ErrorInfo {
  const ps = pieces(error)

  if (coded(ps, 4001) || named(ps, 'UserRejectedRequestError') || has(ps, 'user rejected', 'user denied', 'rejected the request')) {
    return { kind: 'rejected', title: 'Request cancelled', message: 'You cancelled the request in your wallet. Nothing was sent.' }
  }
  if (coded(ps, -32002) || has(ps, 'already pending')) {
    return { kind: 'pending-request', title: 'Wallet is waiting for you', message: 'Open your wallet and finish or reject the pending request first.' }
  }
  if (coded(ps, 4902) || named(ps, 'ChainMismatchError', 'SwitchChainError') || has(ps, 'chain mismatch', 'unrecognized chain', 'switch chain')) {
    return { kind: 'wrong-network', title: 'Wrong network', message: 'Switch your wallet to the network shown in the top bar and try again.' }
  }
  if (
    named(ps, 'InsufficientFundsError') ||
    has(ps, 'insufficient funds', 'exceeds balance', 'transfer amount exceeds', 'insufficient balance')
  ) {
    return { kind: 'insufficient', title: 'Not enough USDC', message: 'Your balance does not cover the amount plus the network fee. Lower the amount or add funds.' }
  }
  if (
    named(ps, 'FeeCapTooLowError', 'IntrinsicGasTooLowError', 'TipAboveFeeCapError') ||
    has(ps, 'gas too low', 'intrinsic gas', 'out of gas', 'gas required exceeds', 'fee cap', 'underpriced', 'max fee per gas less than')
  ) {
    return { kind: 'low-gas', title: 'Network fee too low', message: 'The fee was too low for the current network. Wait a moment, then retry so your wallet refreshes the fee.' }
  }
  if (named(ps, 'TimeoutError', 'WaitForTransactionReceiptTimeoutError') || has(ps, 'timeout', 'timed out')) {
    return { kind: 'timeout', title: 'Network timed out', message: 'The network took too long to answer. If you already signed, check the explorer before retrying.' }
  }
  if (named(ps, 'HttpRequestError', 'RpcRequestError') || has(ps, 'failed to fetch', 'network error', 'networkerror', 'rate limit', '429', 'offline')) {
    return { kind: 'network', title: 'Connection problem', message: 'Could not reach the network. Check your connection and try again.' }
  }
  if (named(ps, 'ExecutionRevertedError', 'ContractFunctionRevertedError') || has(ps, 'reverted', 'execution reverted')) {
    return { kind: 'reverted', title: 'Transaction rejected by the contract', message: 'The contract refused this payment. Check the recipient and amount, then try again.' }
  }
  return { kind: 'unknown', title: 'Something went wrong', message: 'Please try again. If it keeps happening, reload the page.' }
}

/** Shows one toast for the error (one at a time per kind) and returns what it said. */
export function notifyError(error: unknown): ErrorInfo {
  const info = classifyError(error)
  if (info.kind === 'rejected') toast.info(info.title, { description: info.message, id: info.kind })
  else toast.error(info.title, { description: info.message, id: info.kind })
  return info
}
