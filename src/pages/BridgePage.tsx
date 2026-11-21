import { BridgePanel } from '@/components/BridgePanel'
import { EcosystemBadges } from '@/components/EcosystemBadges'
import { PageHeader } from '@/components/PageHeader'

export function BridgePage() {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader />
      <div className="mb-4">
        <EcosystemBadges show={['arc', 'cctp']} />
      </div>
      <BridgePanel />
    </div>
  )
}
