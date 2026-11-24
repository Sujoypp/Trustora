/**
 * Checks the pure logic behind analytics, transaction intelligence, notifications and PDF receipts.
 * Run with: bun run test:logic
 * The inputs below are fixtures built to exercise each rule. They never reach the app.
 */
import assert from 'node:assert/strict'
import type { Address, Hex } from 'viem'
import { computeAnalytics } from '../src/lib/analytics'
import { buildInsights } from '../src/lib/insights'
import { deriveNotifications } from '../src/lib/notifications'
import { buildReceiptPdfBytes, qrMatrix } from '../src/lib/receiptPdf'
import { InvoiceStatus, MilestoneState } from '../src/lib/contracts'
import type { Payment, ReceiptData } from '../src/lib/trustora'

const ME = '0x1111111111111111111111111111111111111111' as Address
const A = '0x2222222222222222222222222222222222222222' as Address
const B = '0x3333333333333333333333333333333333333333' as Address
const ZERO = '0x0000000000000000000000000000000000000000' as Address
const NOW = 1_800_000_000
const DAY = 86_400
const U = (n: number) => BigInt(Math.round(n * 1_000_000))
let n = 0
const tx = (): Hex => `0x${(++n).toString(16).padStart(64, '0')}`
const pay = (to: Address | 'me', from: Address | 'me', amount: number, ageSeconds: number, note = ''): Payment => ({
  id: `p${n}`,
  txHash: tx(),
  blockNumber: BigInt(1000 + n),
  logIndex: 0,
  sender: from === 'me' ? ME : from,
  recipient: to === 'me' ? ME : to,
  direction: to === 'me' ? 'received' : 'sent',
  rail: 'erc20',
  amountRaw: U(amount),
  note,
  timestamp: NOW - ageSeconds,
  status: 'confirmed',
})

let passed = 0
const test = (name: string, fn: () => void | Promise<void>) =>
  Promise.resolve().then(fn).then(
    () => {
      passed++
      console.log(`PASS  ${name}`)
    },
    (e: unknown) => {
      console.error(`FAIL  ${name}\n      ${e instanceof Error ? e.message : String(e)}`)
      process.exitCode = 1
    },
  )

await test('analytics: totals, averages, change and counterparties', () => {
  const list = [pay(A, 'me', 10, DAY), pay(A, 'me', 30, 2 * DAY), pay('me', B, 100, 3 * DAY), pay(B, 'me', 5, 40 * DAY)]
  const a = computeAnalytics(list, NOW, 30)
  assert.equal(a.count, 3)
  assert.equal(a.sent, U(40))
  assert.equal(a.received, U(100))
  assert.equal(a.net, U(60))
  assert.equal(a.largest, U(100))
  assert.equal(a.average, U(140) / 3n)
  assert.equal(a.counterparties[0].address, B)
  assert.equal(a.counterparties[0].volume, U(100))
  // the 5 USDC payment 40 days ago is the previous window: (140 - 5) / 5 = +2700%
  assert.equal(Math.round(a.volumeChangePct ?? 0), 2700)
})

await test('analytics: change against the previous window and all-time view', () => {
  const list = [pay(A, 'me', 50, DAY), pay(A, 'me', 25, 40 * DAY)]
  const a = computeAnalytics(list, NOW, 30)
  assert.equal(Math.round(a.volumeChangePct ?? 0), 100)
  const all = computeAnalytics(list, NOW, null)
  assert.equal(all.count, 2)
  assert.equal(all.volumeChangePct, null)
  assert.equal(all.months.length, 6)
  assert.equal(all.months.reduce((s, m) => s + m.sent, 0n), U(75))
})

await test('analytics: pending and self payments are ignored', () => {
  const pending = { ...pay(A, 'me', 9, DAY), status: 'pending' as const }
  const self = { ...pay(A, 'me', 9, DAY), direction: 'self' as const }
  assert.equal(computeAnalytics([pending, self], NOW, 30).count, 0)
})

await test('insights: first-time recipient, duplicates, large payments, recurring, concentration', () => {
  const list: Payment[] = []
  // a weekly rent payment, four times, to A
  for (let i = 4; i >= 1; i--) list.push(pay(A, 'me', 100, i * 7 * DAY + 60))
  // five small payments to B, then a large one
  for (let i = 0; i < 5; i++) list.push(pay(B, 'me', 10, (20 - i) * DAY, '#coffee'))
  list.push(pay(B, 'me', 200, 3 * DAY, '#hardware'))
  // an immediate duplicate to a brand new address
  const fresh = '0x4444444444444444444444444444444444444444' as Address
  list.push(pay(fresh, 'me', 7, 1000))
  list.push(pay(fresh, 'me', 7, 800))
  const { insights, categories } = buildInsights(list, NOW)
  const titles = insights.map((i) => i.title)
  assert.ok(titles.includes('First payment to a new address'), 'new address')
  assert.ok(titles.includes('Possible duplicate payment'), 'duplicate')
  assert.ok(titles.includes('Larger than usual payment'), 'large payment')
  assert.ok(titles.includes('This looks like a recurring payment'), 'recurring')
  assert.equal(insights[0].severity, 'warning')
  assert.equal(categories[0].tag, '#hardware')
  assert.equal(categories[0].sent, U(200))
  assert.equal(categories.find((c) => c.tag === '#coffee')?.count, 5)
})

await test('insights: nothing is flagged for a short, ordinary history', () => {
  const { insights } = buildInsights([pay(A, 'me', 10, 20 * DAY), pay(B, 'me', 12, 25 * DAY)], NOW)
  assert.equal(insights.length, 0)
})

const ms = (state: number, extra: Partial<{ amount: bigint; dueAt: bigint; deliveredAt: bigint; stateAt: bigint }> = {}) => ({ amount: U(50), dueAt: 0n, deliveredAt: 0n, stateAt: 0n, state, ...extra })
const agreement = (over: Record<string, unknown> = {}) => ({ payer: A, payee: ME, arbiter: ZERO, accepted: true, cancelled: false, createdAt: BigInt(NOW - DAY), createdBlock: 1n, acceptBy: 0n, autoReleaseAfter: 0n, milestoneCount: 1, total: U(50), termsHash: tx(), ...over })

await test('notifications: payments, deals, invoices and schedules produce actionable items', () => {
  const deals = [
    { id: 1n, agreement: agreement({ accepted: false, acceptBy: BigInt(NOW + DAY) }), milestones: [ms(MilestoneState.Funded)] },
    { id: 2n, agreement: agreement({ payer: ME, payee: A }), milestones: [ms(MilestoneState.Delivered, { deliveredAt: BigInt(NOW - 100) })] },
    { id: 3n, agreement: agreement({ payer: A, payee: B, arbiter: ME }), milestones: [ms(MilestoneState.Disputed, { stateAt: BigInt(NOW - 50) })] },
    { id: 4n, agreement: agreement({ payer: ME, payee: A }), milestones: [ms(MilestoneState.Released)] },
  ] as never
  const invoices = [
    { id: 7n, invoice: { issuer: ME, payer: ZERO, amount: U(20), dueAt: 0n, createdAt: BigInt(NOW - DAY), createdBlock: 1n, paidAt: BigInt(NOW - 60), paidBy: A, status: InvoiceStatus.Paid, memo: '' } },
    { id: 8n, invoice: { issuer: A, payer: ME, amount: U(30), dueAt: BigInt(NOW - 10), createdAt: BigInt(NOW - DAY), createdBlock: 1n, paidAt: 0n, paidBy: ZERO, status: InvoiceStatus.Open, memo: '' } },
  ] as never
  const schedules = [{ id: 5n, schedule: { payer: A, payee: ME, amount: U(10), interval: 3600n, nextAt: BigInt(NOW - 5), remaining: 2, executed: 1, active: true, createdBlock: 1n, note: '' } }] as never
  const list = deriveNotifications({ me: ME, payments: [pay('me', A, 12, 600)], deals, invoices, schedules, now: NOW })
  const ids = list.map((x) => x.id)
  assert.ok(ids.some((i) => i.startsWith('pay:')), 'payment received')
  assert.ok(ids.includes('deal:1:accept'), 'acceptance')
  assert.ok(ids.includes('deal:2:0:review'), 'review delivered milestone')
  assert.ok(ids.includes('deal:3:0:dispute'), 'arbiter decision')
  assert.ok(!ids.some((i) => i.startsWith('deal:4')), 'released milestones are quiet')
  assert.ok(ids.includes('inv:7:paid'), 'invoice paid')
  assert.ok(ids.includes('inv:8:due'), 'invoice to pay')
  assert.ok(ids.includes('sched:5:1'), 'schedule due')
  assert.ok(list.find((x) => x.id === 'inv:8:due')?.title.includes('overdue'))
  const firstInformational = list.findIndex((x) => !x.action)
  assert.ok(list.slice(firstInformational).every((x) => !x.action), 'action items sort first')
  assert.deepEqual(deriveNotifications({ payments: [], deals: [], invoices: [], schedules: [], now: NOW }), [])
})

await test('notifications: old payments and other people deals stay out', () => {
  const old = pay('me', A, 5, 30 * DAY)
  const strangers = [{ id: 9n, agreement: agreement({ payer: A, payee: B }), milestones: [ms(MilestoneState.Delivered)] }] as never
  assert.equal(deriveNotifications({ me: ME, payments: [old], deals: strangers, invoices: [], schedules: [], now: NOW }).length, 0)
})

await test('receipt PDF: valid structure, content, links and QR', async () => {
  const receipt: ReceiptData = { txHash: `0x${'ab'.repeat(32)}`, blockNumber: 32_237_136n, sender: ME, recipient: A, rail: 'erc20', amountRaw: U(125.5), note: 'Invoice 42 (rent)', timestamp: NOW }
  const verifyUrl = `https://example.org/proof?tx=${receipt.txHash}`
  const qr = await qrMatrix(verifyUrl)
  assert.ok(qr.length >= 21 && qr.every((r) => r.length === qr.length), 'square QR matrix')
  const bytes = buildReceiptPdfBytes(receipt, { network: 'Arc Mainnet', chainId: 5042, verifyUrl, explorerUrl: `https://explorer.example/tx/${receipt.txHash}`, qr })
  const pdf = new TextDecoder().decode(bytes)
  assert.ok(pdf.startsWith('%PDF-1.4'), 'header')
  assert.ok(pdf.trimEnd().endsWith('%%EOF'), 'trailer')
  // every xref entry must point at its object
  const table = pdf.slice(pdf.indexOf('xref\n'))
  const entries = [...table.matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]))
  assert.ok(entries.length >= 8)
  entries.forEach((offset, i) => assert.ok(pdf.slice(offset).startsWith(`${i + 1} 0 obj`), `object ${i + 1} offset`))
  assert.equal(Number(/startxref\n(\d+)/.exec(pdf)?.[1]), pdf.indexOf('xref\n'), 'startxref')
  // the stream length must match the real stream
  const length = Number(/\/Length (\d+)/.exec(pdf)?.[1])
  const stream = pdf.slice(pdf.indexOf('stream\n') + 7, pdf.indexOf('\nendstream'))
  assert.equal(stream.length, length, 'stream length')
  assert.ok(stream.includes('125.50 USDC'), 'amount')
  assert.ok(stream.includes('CONFIRMED ON ARC MAINNET'), 'status')
  assert.ok(stream.includes(receipt.txHash.slice(0, 62)), 'transaction hash text')
  assert.ok(stream.includes('Invoice 42 \\(rent\\)'), 'note with escaped parentheses')
  assert.ok((stream.match(/ re f/g) ?? []).length > 100, 'QR modules are drawn')
  assert.equal((pdf.match(/\/Subtype \/Link/g) ?? []).length, 3, 'verification, explorer and QR links')
  assert.ok(pdf.includes(`/URI (${verifyUrl})`), 'verification link')
})

await test('receipt PDF: non-ASCII text cannot break the file', () => {
  const receipt: ReceiptData = { txHash: `0x${'cd'.repeat(32)}`, blockNumber: 1n, sender: ME, recipient: A, rail: 'native', amountRaw: 1n, note: 'caf\u00e9 \u2728 \\ ) ( end', timestamp: NOW }
  const pdf = new TextDecoder().decode(buildReceiptPdfBytes(receipt, { network: 'Arc Mainnet', chainId: 5042, verifyUrl: 'https://x.test/p', explorerUrl: 'https://x.test/t', qr: null }))
  assert.ok(pdf.includes('Paid with native USDC'))
  assert.equal(/[^\x00-\x7f]/.test(pdf), false)
  const length = Number(/\/Length (\d+)/.exec(pdf)?.[1])
  assert.equal(pdf.slice(pdf.indexOf('stream\n') + 7, pdf.indexOf('\nendstream')).length, length)
})

console.log(process.exitCode ? `\n${passed} passed, some failed` : `\nALL ${passed} CHECKS PASSED`)
