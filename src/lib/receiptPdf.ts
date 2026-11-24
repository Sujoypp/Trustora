import { formatUsdc } from '@/lib/format'
import type { ReceiptData } from '@/lib/trustora'

/** A QR code as rows of dark (true) and light (false) modules. */
export type QrMatrix = boolean[][]

export interface ReceiptPdfOptions {
  network: string
  chainId: number
  /** Where anyone can re-check this payment against the chain. */
  verifyUrl: string
  explorerUrl: string
  qr: QrMatrix | null
}

/** Builds the QR matrix lazily so the QR library only loads when a receipt is downloaded. */
export async function qrMatrix(text: string): Promise<QrMatrix> {
  const mod = await import('qrcode')
  // The library is CommonJS: bundlers expose it either as named exports or under `default`.
  const api = typeof mod.create === 'function' ? mod : (mod as unknown as { default: typeof mod }).default
  const qr = api.create(text, { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  return Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => Boolean(qr.modules.get(r, c))))
}

const esc = (text: string) =>
  text
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')

const utc = (ts: number) => new Date(ts * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
const chunk = (text: string, size: number) => (text.match(new RegExp(`.{1,${size}}`, 'g')) ?? [text])

/**
 * A one-page verifiable receipt as PDF bytes. It carries the transaction hash, block and parties, a link and a QR code
 * that open the in-app proof page (which re-reads the payment from the chain), and the explorer link. The PDF is a
 * convenience copy: the chain record is the proof.
 */
export function buildReceiptPdfBytes(receipt: ReceiptData, options: ReceiptPdfOptions): Uint8Array {
  const W = 595
  const H = 842
  const M = 44
  const ops: string[] = []
  const links: { x: number; y: number; w: number; h: number; url: string }[] = []

  const rect = (x: number, y: number, w: number, h: number, rgb: [number, number, number]) => ops.push(`${rgb.join(' ')} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`)
  const text = (value: string, x: number, y: number, size: number, font: 'F1' | 'F2' | 'F3', rgb: [number, number, number] = [0.1, 0.13, 0.22]) =>
    ops.push(`${rgb.join(' ')} rg BT /${font} ${size} Tf ${x} ${y} Td (${esc(value)}) Tj ET`)

  // Header band
  rect(0, H - 110, W, 110, [0.02, 0.05, 0.12])
  rect(0, H - 113, W, 3, [0.13, 0.83, 0.93])
  text('TRUSTORA', M, H - 58, 24, 'F2', [1, 1, 1])
  text('Verifiable payment receipt', M, H - 80, 11, 'F1', [0.62, 0.76, 1])
  text(`${options.network}  |  Chain ID ${options.chainId}`, W - M - 180, H - 58, 10, 'F1', [0.62, 0.76, 1])

  // Status and amount
  let y = H - 160
  rect(M, y - 4, 150, 20, [0.86, 0.97, 0.92])
  text(`CONFIRMED ON ${options.network.toUpperCase()}`.slice(0, 30), M + 8, y + 2, 8.5, 'F2', [0.02, 0.45, 0.3])
  y -= 44
  text(`${formatUsdc(receipt.amountRaw, 2)} USDC`, M, y, 30, 'F2')
  y -= 22
  text(receipt.rail === 'native' ? 'Paid with native USDC' : 'Paid with USDC (ERC-20)', M, y, 10, 'F1', [0.4, 0.45, 0.55])

  // Details
  y -= 38
  const row = (label: string, value: string, mono = false) => {
    text(label.toUpperCase(), M, y, 7.5, 'F2', [0.45, 0.5, 0.6])
    const parts = mono ? chunk(value, 62) : [value]
    parts.forEach((part, i) => text(part, M + 110, y - (i ? 0 : 0) - i * 12, mono ? 8.5 : 10, mono ? 'F3' : 'F1'))
    y -= 16 + (parts.length - 1) * 12
  }
  row('From', receipt.sender, true)
  row('To', receipt.recipient, true)
  row('Date', utc(receipt.timestamp))
  row('Block', receipt.blockNumber.toString())
  if (receipt.note) row('Note', receipt.note.slice(0, 90))
  row('Transaction', receipt.txHash, true)

  // Verification block: link, QR and plain-language steps
  y -= 18
  rect(M, y - 150, W - 2 * M, 158, [0.95, 0.97, 1])
  text('Verify this payment', M + 14, y - 18, 12, 'F2')
  const steps = [
    '1. Scan the QR code or open the verification link.',
    '2. The page reads this transaction from the Arc Mainnet network.',
    '3. Check that the hash, amount, parties and block match this receipt.',
  ]
  steps.forEach((s, i) => text(s, M + 14, y - 38 - i * 14, 9, 'F1', [0.25, 0.3, 0.4]))
  const verifyLines = chunk(options.verifyUrl, 64)
  verifyLines.forEach((line, i) => text(line, M + 14, y - 92 - i * 11, 7.5, 'F3', [0.1, 0.3, 0.8]))
  links.push({ x: M + 14, y: y - 92 - (verifyLines.length - 1) * 11 - 2, w: 330, h: verifyLines.length * 11 + 2, url: options.verifyUrl })
  text('Block explorer', M + 14, y - 132, 8, 'F2', [0.45, 0.5, 0.6])
  const exLines = chunk(options.explorerUrl, 64)
  exLines.forEach((line, i) => text(line, M + 90, y - 132 - i * 10, 7, 'F3', [0.1, 0.3, 0.8]))
  links.push({ x: M + 90, y: y - 132 - (exLines.length - 1) * 10 - 2, w: 330, h: exLines.length * 10 + 2, url: options.explorerUrl })

  if (options.qr) {
    const n = options.qr.length
    const box = 110
    const cell = box / (n + 2)
    const ox = W - M - box - 8
    const oy = y - 28 - box
    rect(ox, oy, box, box, [1, 1, 1])
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (options.qr[r][c]) ops.push(`0.02 0.05 0.12 rg ${(ox + (c + 1) * cell).toFixed(2)} ${(oy + box - (r + 2) * cell).toFixed(2)} ${cell.toFixed(2)} ${cell.toFixed(2)} re f`)
      }
    }
    links.push({ x: ox, y: oy, w: box, h: box, url: options.verifyUrl })
  }

  // Footer
  const note = 'This PDF is a convenience copy. The authoritative record is the transaction on the Arc Mainnet blockchain. Payments on mainnet are final.'
  chunk(note, 105).forEach((line, i) => text(line, M, 78 - i * 11, 8, 'F1', [0.45, 0.5, 0.6]))
  text(`Receipt reference ${receipt.txHash.slice(0, 10)}...${receipt.txHash.slice(-6)}   |   Generated by TRUSTORA`, M, 44, 7.5, 'F1', [0.55, 0.6, 0.7])

  const content = ops.join('\n')
  const annots = links.map((l) => `<< /Type /Annot /Subtype /Link /Rect [${l.x.toFixed(1)} ${l.y.toFixed(1)} ${(l.x + l.w).toFixed(1)} ${(l.y + l.h).toFixed(1)}] /Border [0 0 0] /A << /S /URI /URI (${esc(l.url)}) >> >>`)
  const annotStart = 8
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> /Contents 4 0 R${annots.length ? ` /Annots [${annots.map((_, i) => `${annotStart + i} 0 R`).join(' ')}]` : ''} >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    ...annots,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

export function buildReceiptPdf(receipt: ReceiptData, options: ReceiptPdfOptions): Blob {
  return new Blob([buildReceiptPdfBytes(receipt, options) as BlobPart], { type: 'application/pdf' })
}
