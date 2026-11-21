import { EcosystemBadges } from '@/components/EcosystemBadges'
import { PageHeader } from '@/components/PageHeader'
import { ReceivePanel } from '@/components/ReceivePanel'
import { useApp } from '@/lib/appContext'

/** Shareable USDC payment links and QR codes: opening one pre-fills the Send form with the amount and note. */
export function LinksPage() {
  const { address } = useApp()
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader />
      <div className="mb-4">
        <EcosystemBadges show={['arc', 'usdc']} />
      </div>
      <section className="glass space-y-4 p-5 sm:p-6" aria-labelledby="links-title">
        <div>
          <h2 id="links-title" className="text-lg font-semibold">
            Create a payment link
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Set an optional amount and note. Anyone who opens the link or scans the QR code lands on a Send form already filled in with your address, and pays with their own wallet. The payment is a normal USDC transfer through the Trustora contract, so it appears in your history with its transaction hash.
          </p>
        </div>
        <ReceivePanel address={address} />
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>
          For a payment that must be tracked as an invoice (with a Paid status), use Smart Invoices instead.
        </p>
      </section>
    </div>
  )
}
