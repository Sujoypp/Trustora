export interface Reminder {
  id: string
  title: string
  /** Optional USDC amount as a decimal string, for example "250.00". */
  amount: string
  /** Who to pay: a name or an address. */
  payee: string
  note: string
  /** When the reminder fires (milliseconds since the epoch). */
  dueAt: number
}

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Escapes text for an iCalendar value. */
const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Folds long lines at 75 characters, as the iCalendar format requires. */
function fold(line: string): string {
  const parts: string[] = []
  for (let i = 0; i < line.length; i += 74) parts.push((i === 0 ? '' : ' ') + line.slice(i, i + 74))
  return parts.join('\r\n')
}

export function reminderDetails(r: Reminder): string {
  const lines = [r.amount ? `Amount: ${r.amount} USDC` : '', r.payee ? `Pay to: ${r.payee}` : '', r.note, 'Set from Trustora.']
  return lines.filter(Boolean).join('\n')
}

/** A standard .ics file with a 30 minute event and alerts one day and one hour before. */
export function buildIcs(r: Reminder): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Trustora//Payment reminder//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${r.id}@trustora`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(r.dueAt)}`,
    `DTEND:${stamp(r.dueAt + 30 * 60_000)}`,
    `SUMMARY:${esc(r.title)}`,
    `DESCRIPTION:${esc(reminderDetails(r))}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(r.title)}`,
    'TRIGGER:-P1D',
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(r.title)}`,
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** A link that opens Google Calendar with the event filled in. */
export function googleCalendarUrl(r: Reminder): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: r.title,
    dates: `${stamp(r.dueAt)}/${stamp(r.dueAt + 30 * 60_000)}`,
    details: reminderDetails(r),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
