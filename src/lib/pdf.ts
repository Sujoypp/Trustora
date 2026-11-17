/** Minimal dependency-free PDF writer for text documents (statements). */

export interface PdfLine {
  text: string
  size?: number
  font?: 'sans' | 'bold' | 'mono'
  /** Extra space added below the line, in points. */
  gap?: number
  color?: [number, number, number]
  /** Left indent in points. */
  indent?: number
}

interface Options {
  landscape?: boolean
  /** Lines repeated at the top of every page after the first. */
  repeat?: PdfLine[]
}

const MARGIN = 40
const FONT_NAME = { sans: 'F1', bold: 'F2', mono: 'F3' } as const

/** Keeps printable ASCII only; the built-in PDF fonts cannot show other characters. */
const clean = (text: string) =>
  text
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')

export function buildPdf(lines: PdfLine[], { landscape = false, repeat = [] }: Options = {}): Blob {
  const width = landscape ? 842 : 595
  const height = landscape ? 595 : 842
  const pages: string[][] = [[]]
  let y = height - MARGIN

  const place = (line: PdfLine) => {
    const size = line.size ?? 10
    const step = size * 1.35 + (line.gap ?? 0)
    if (y - step < MARGIN) {
      pages.push([])
      y = height - MARGIN
      for (const r of repeat) place(r)
    }
    y -= step
    const [r, g, b] = line.color ?? [0.1, 0.09, 0.16]
    const font = FONT_NAME[line.font ?? 'sans']
    pages[pages.length - 1].push(
      `${r} ${g} ${b} rg BT /${font} ${size} Tf ${MARGIN + (line.indent ?? 0)} ${y.toFixed(1)} Td (${clean(line.text)}) Tj ET`,
    )
  }
  lines.forEach(place)

  const objects: string[] = []
  const pageIds = pages.map((_, i) => 6 + i * 2)
  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>')
  pages.forEach((content, i) => {
    const stream = content.join('\n')
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${7 + i * 2} 0 R >>`,
    )
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })

  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`

  return new Blob([out], { type: 'application/pdf' })
}
