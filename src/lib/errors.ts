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

const CONTRACT_ERRORS: Record<string, string> = {
  Unauthorized: 'Your wallet is not allowed to do this here. Check that you are connected with the right account.',
  InvalidState: 'This item is not in a state that allows that action right now.',
  InvalidStatus: 'This item is no longer open, so that action is not possible.',
  TooEarly: 'It is too early for this action. Try again once the waiting period has passed.',
  InvalidTime: 'This payment is not due yet.',
  LateDelivery: 'The deadline for this milestone has already passed.',
  AcceptanceExpired: 'The acceptance window has closed.',
  NoArbiter: 'This agreement has no arbiter, so it cannot be disputed.',
  IncorrectDeposit: 'The token did not deliver the exact amount, so the deposit was rejected.',
  TokenTransferFailed: 'The USDC transfer failed. Check your balance and the allowance you gave the contract.',
  TokenBalanceFailed: 'The USDC balance could not be read. Check that you are on Arc Mainnet.',
  ZeroAmount: 'The amount must be greater than zero.',
  ZeroAddress: 'An address is missing.',
  ZeroRecipient: 'A recipient address is missing.',
  SelfRecipient: 'You cannot pay yourself or the contract.',
  InvalidPayee: 'The recipient address is not valid for this payment.',
  InvalidArbiter: 'The arbiter cannot be the payer, the payee or the contract.',
  InvalidMilestones: 'Use between 1 and 20 milestones, each with an amount.',
  InvalidDeadline: 'Deadlines must be in the future.',
  InvalidAutoRelease: 'Auto-release must be between 1 hour and 365 days.',
  InvalidIndex: 'That milestone does not exist.',
  InvalidInterval: 'The interval must be between 1 hour and 365 days.',
  InvalidPaymentCount: 'Use between 1 and 1000 payments.',
  InvalidArrayLength: 'Use between 1 and 50 recipients, each with an amount.',
  AmountOverflow: 'The total is too large.',
  ValueOverflow: 'A value is too large.',
  NoteTooLong: 'The note is too long (280 bytes at most).',
  TermsTooLong: 'The terms are too long (1000 bytes at most).',
  NotFound: 'That item does not exist.',
  Reentrancy: 'The contract rejected a repeated call. Please try again.',
}

/** Finds the contract's own error name in a viem error chain (for example "TooEarly"). */
function contractErrorName(error: unknown): string | undefined {
  let current: unknown = error
  for (let depth = 0; depth < 6 && current; depth++) {
    const e = current as { data?: { errorName?: string }; cause?: unknown }
    if (e.data?.errorName) return e.data.errorName
    current = e.cause
  }
  return undefined
}

/** Turns any wallet, RPC or contract failure into a clear title and a next step for the person using the app. */
export function classifyError(error: unknown): ErrorInfo {
  const ps = pieces(error)

  if (coded(ps, 4001) || named(ps, 'UserRejectedRequestError') || has(ps, 'user rejected', 'user denied', 'rejected the request')) {
    return { kind: 'rejected', title: 'Request cancelled', message: 'You cancelled the request in your wallet. Nothing was sent.' }
  }
  if (coded(ps, -32002) || has(ps, 'already pending')) {
    return { kind: 'pending-request', title: 'Wallet is waiting for you', message: 'Open your wallet and finish or reject the pending request first.' }
  }
  const contractError = contractErrorName(error)
  if (contractError && CONTRACT_ERRORS[contractError]) {
    return { kind: 'reverted', title: 'The contract refused this action', message: CONTRACT_ERRORS[contractError] }
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
