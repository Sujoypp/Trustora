import { useState } from 'react'
import { EcosystemBadges } from '@/components/EcosystemBadges'
import { PageHeader } from '@/components/PageHeader'
import { ReceiveModal } from '@/components/ReceiveModal'
import { SendTerminal, type ExchangeTab, type Prefill } from '@/components/SendTerminal'
import { useApp } from '@/lib/appContext'
import { parsePaymentRequest } from '@/lib/paymentLink'
import { goBack, navigate, useRoute } from '@/lib/router'

/** Reads a draft handed over by another screen, or a payment link in the URL. */
function readPrefill(data: Record<string, unknown>, search: string): Prefill | null {
  const draft = data.draft as Prefill | undefined
  if (draft && (draft.to || draft.amount || draft.note)) return { to: draft.to, amount: draft.amount, note: draft.note }
  const request = parsePaymentRequest(search)
  return request ? { to: request.to, amount: request.amount, note: request.note, fromLink: true } : null
}

export function ExchangePage() {
  const route = useRoute()
  const app = useApp()
  const receiving = route.path === '/receive'
  const tab: ExchangeTab = 'send'
  // Read once per visit so editing the form never gets overwritten.
  const [prefill] = useState(() => readPrefill(route.data, route.search))

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader />
      <div className="mb-4">
        <EcosystemBadges show={['arc', 'usdc']} />
      </div>
      <SendTerminal
        balance={app.balance}
        warnAbove={app.prefs.warnAbove}
        hideBalance={app.prefs.hideBalances}
        onPending={app.onPending}
        onSettled={app.onSettled}
        onSuccess={app.onSuccess}
        tab={tab}
        onTabChange={(next) => next === 'receive' && navigate('/receive', { data: route.data })}
        prefill={prefill}
      />
      {receiving && <ReceiveModal onClose={() => goBack('/send')} />}
    </div>
  )
}
