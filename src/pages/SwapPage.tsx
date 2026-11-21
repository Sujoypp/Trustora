import { EcosystemBadges } from '@/components/EcosystemBadges'
import { PageHeader } from '@/components/PageHeader'
import { SwapPanel } from '@/components/SwapPanel'

export function SwapPage() {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader />
      <div className="mb-4">
        <EcosystemBadges show={['arc', 'usdc']} />
      </div>
      <SwapPanel />
    </div>
  )
}
