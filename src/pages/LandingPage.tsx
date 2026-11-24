import { ArrowRight, BadgeCheck, CalendarClock, FileText, Handshake, Link2, Lock, Network, Repeat, ShieldCheck, Split, Wallet, Waypoints, type LucideIcon } from 'lucide-react'
import { BrandMark, Logo } from '@/components/Logo'
import { WalletMenu } from '@/components/WalletMenu'
import { CHAIN, CHAIN_ID, NETWORK_NAME, ROUTER_ADDRESS } from '@/lib/trustora'
import { buildAddressExplorerUrl } from '@/onchain-facts'

interface Feature {
  icon: LucideIcon
  title: string
  text: string
}

const FEATURES: Feature[] = [
  { icon: Handshake, title: 'Smart Escrow', text: 'Lock USDC in a contract and release it only when the agreed conditions are met, with refunds if they are not.' },
  { icon: Waypoints, title: 'Milestone Payments', text: 'Split a project into stages. Each milestone is approved before its share is released.' },
  { icon: FileText, title: 'Smart Invoices', text: 'Create an invoice onchain, share its link, and watch it flip to Paid when the USDC arrives.' },
  { icon: Link2, title: 'Payment Links', text: 'Share a link or QR code that opens a ready-to-pay USDC transfer with your address filled in.' },
  { icon: Split, title: 'Split Payments', text: 'Divide one payment between many wallets, by amount or percentage, in a single transaction.' },
  { icon: CalendarClock, title: 'Recurring Payments', text: 'Authorize a schedule once. Each payment goes straight from your wallet when it falls due.' },
  { icon: ShieldCheck, title: 'Trust Agreements', text: 'Agreements with terms, acceptance windows, auto-release timers and an optional arbiter for disputes.' },
  { icon: Repeat, title: 'Swap and Bridge', text: 'Swap USDC, EURC and cirBTC, and move native USDC across chains with Circle CCTP.' },
  { icon: BadgeCheck, title: 'Onchain Proof', text: 'Verify any transaction or record straight from the network, and build a Trust Score from verified activity.' },
]

const STEPS = [
  { n: '01', title: 'Connect your wallet', text: 'Use the wallet you already have. TRUSTORA never holds your keys or your funds.' },
  { n: '02', title: 'Choose a payment tool', text: 'Send, escrow, invoice, split or schedule USDC on Arc Mainnet, with fees paid in USDC.' },
  { n: '03', title: 'Confirm and keep the proof', text: 'You sign every action. Each result comes with a receipt and an explorer link anyone can check.' },
]

const ORBIT: { icon: LucideIcon; angle: number }[] = [
  { icon: Handshake, angle: 0 },
  { icon: FileText, angle: 60 },
  { icon: Split, angle: 120 },
  { icon: CalendarClock, angle: 180 },
  { icon: Link2, angle: 240 },
  { icon: Network, angle: 300 },
]

function HeroEmblem() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[360px] sm:max-w-[440px]" aria-hidden="true">
      <div className="absolute inset-[8%] rounded-full" style={{ background: 'radial-gradient(circle, rgba(79,140,255,0.28), rgba(34,211,238,0.1) 55%, transparent 72%)' }} />
      <div className="absolute inset-[6%] rounded-full border" style={{ borderColor: 'rgba(130,170,255,0.18)' }} />
      <div className="absolute inset-[22%] rounded-full border border-dashed" style={{ borderColor: 'rgba(34,211,238,0.22)' }} />
      <div>
        {ORBIT.map(({ icon: Icon, angle }) => (
          <div key={angle} className="absolute left-1/2 top-1/2 size-0" style={{ transform: `rotate(${angle}deg) translateY(-min(38vw, 176px)) rotate(${-angle}deg)` }}>
            <span className="glass flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl sm:size-12" style={{ color: '#9fc2ff' }}>
              <Icon className="size-5" />
            </span>
          </div>
        ))}
      </div>
      <div className="absolute inset-[30%] flex items-center justify-center">
        <BrandMark className="size-full" />
      </div>
    </div>
  )
}

/** Public landing page shown to visitors who have not connected a wallet. */
export function LandingPage({ onEnter }: { onEnter: () => void }) {
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="min-h-dvh">
      <div className="relative z-10">
        <header className="blur-surface sticky top-0 z-50 border-b" style={{ background: 'rgba(5, 10, 24, 0.78)', borderColor: 'var(--border)' }}>
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
            <Logo interactive={false} />
            <nav aria-label="Sections" className="hidden items-center gap-1 text-sm md:flex">
              {[['features', 'Features'], ['how', 'How it works'], ['security', 'Security']].map(([id, label]) => (
                <button key={id} type="button" onClick={() => scrollTo(id)} className="rounded-lg px-3 py-2 font-medium transition-colors duration-150 hover:text-white" style={{ color: 'var(--muted)' }}>
                  {label}
                </button>
              ))}
            </nav>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={onEnter} className="ghost-btn hidden min-h-10 border px-4 text-sm font-semibold sm:block">
                Launch App
              </button>
              <WalletMenu />
            </div>
          </div>
        </header>

        <main>
          <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-2 lg:gap-6">
            <div className="rise space-y-6">
              <span className="chip chip-info">
                <span className="live-dot size-1.5 rounded-full" style={{ background: 'var(--emerald)' }} />
                Live on {NETWORK_NAME} · Chain {CHAIN_ID}
              </span>
              <h1 className="display text-4xl font-bold leading-[1.05] sm:text-6xl">
                Programmable USDC payments,{' '}
                <span style={{ backgroundImage: 'linear-gradient(90deg, #7aa9ff, #22d3ee)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>built on Arc.</span>
              </h1>
              <p className="max-w-xl text-base sm:text-lg" style={{ color: 'var(--muted)' }}>
                Send, escrow, invoice, split and schedule USDC with a verifiable record of every step. Non-custodial, signed from your own wallet, and paid for in USDC.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={onEnter} className="cta flex min-h-12 items-center justify-center gap-2 px-7 text-base">
                  Launch App
                  <ArrowRight className="size-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => scrollTo('features')} className="ghost-btn min-h-12 border px-7 text-base font-semibold">
                  Explore features
                </button>
              </div>
              <ul className="flex flex-wrap gap-2 pt-1">
                {['Circle USDC', 'CCTP bridge', 'Non-custodial', 'Explorer-linked receipts'].map((t) => (
                  <li key={t} className="chip chip-mute">{t}</li>
                ))}
              </ul>
            </div>
            <div className="rise" style={{ '--i': 2 } as React.CSSProperties}>
              <HeroEmblem />
            </div>
          </section>

          <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-14 sm:px-6">
            <p className="eyebrow">What you can do</p>
            <h2 className="display mt-2 max-w-2xl text-3xl font-bold sm:text-4xl">One platform for every kind of USDC payment</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text }, i) => (
                <article key={title} className="glass rise p-6 transition-transform duration-200 ease-out hover:-translate-y-1" style={{ '--i': i } as React.CSSProperties}>
                  <span className="flex size-11 items-center justify-center rounded-xl" style={{ background: 'rgba(79,140,255,0.14)', color: '#7aa9ff' }}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="display mt-4 text-lg font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm" style={{ color: 'var(--muted)' }}>{text}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-14 sm:px-6">
            <p className="eyebrow">How it works</p>
            <h2 className="display mt-2 text-3xl font-bold sm:text-4xl">Three steps from wallet to proof</h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="glass p-6">
                  <span className="display text-3xl font-bold" style={{ color: 'rgba(122,169,255,0.55)' }}>{s.n}</span>
                  <h3 className="display mt-3 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm" style={{ color: 'var(--muted)' }}>{s.text}</p>
                </li>
              ))}
            </ol>
          </section>

          <section id="security" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-14 sm:px-6">
            <div className="glass gradient-border grid gap-8 p-6 sm:p-10 lg:grid-cols-2">
              <div>
                <p className="eyebrow">Security</p>
                <h2 className="display mt-2 text-3xl font-bold">You stay in control of your funds</h2>
                <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
                  TRUSTORA is an interface to smart contracts you can inspect. It never takes custody, and nothing moves without your signature. Contracts that hold funds should be independently audited before you rely on them.
                </p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {[
                  { icon: Wallet, t: 'Non-custodial', d: 'Keys stay in your wallet.' },
                  { icon: Lock, t: 'Real USDC', d: `Circle USDC on ${NETWORK_NAME} only.` },
                  { icon: BadgeCheck, t: 'Verifiable', d: 'Every action links to the explorer.' },
                  { icon: Network, t: 'Cross-chain ready', d: 'Circle CCTP for native USDC transfers.' },
                ].map(({ icon: Icon, t, d }) => (
                  <li key={t} className="glass-inner flex gap-3 p-4">
                    <Icon className="mt-0.5 size-5 shrink-0" style={{ color: '#22d3ee' }} aria-hidden="true" />
                    <span>
                      <span className="block text-sm font-semibold">{t}</span>
                      <span className="block text-xs" style={{ color: 'var(--muted)' }}>{d}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="mx-auto max-w-6xl px-4 pb-20 pt-6 text-center sm:px-6">
            <h2 className="display text-3xl font-bold sm:text-4xl">Ready to move USDC with confidence?</h2>
            <button type="button" onClick={onEnter} className="cta mx-auto mt-6 flex min-h-12 items-center gap-2 px-8 text-base">
              Launch App
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </section>
        </main>

        <footer className="border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs sm:flex-row sm:px-6" style={{ color: 'var(--subtle)' }}>
            <span>TRUSTORA · Unified Trust · {NETWORK_NAME}. Payments are real and irreversible.</span>
            <span className="flex items-center gap-4">
              <a href={CHAIN.explorerBase} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">Block explorer</a>
              {ROUTER_ADDRESS && (
                <a href={buildAddressExplorerUrl(CHAIN_ID, ROUTER_ADDRESS)} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">Payment contract</a>
              )}
            </span>
          </div>
        </footer>
      </div>
    </div>
  )
}
