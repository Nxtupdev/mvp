import Link from 'next/link'
import Logo from '@/components/Logo'

// ============================================================
// Shell compartido de las páginas legales públicas (/terms,
// /privacy, /sms-opt-in). En inglés a propósito: las exigen los
// revisores de carriers (Twilio toll-free verification) y aplican
// a dueños en USA. Prosa estática, sin JS de cliente.
// ============================================================

export const SUPPORT_EMAIL = 'support@getnxtup.com'

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: React.ReactNode
}) {
  return (
    <main className="min-h-screen bg-[#0A0A0B] text-zinc-200">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="inline-block mb-10">
          <Logo className="h-6 w-auto" tone="dark" />
        </Link>
        <h1 className="text-3xl font-black tracking-tight text-white mb-2">
          {title}
        </h1>
        <p className="text-sm text-zinc-500 mb-10">Last updated: {updated}</p>
        <div className="space-y-8 text-[15px] leading-relaxed [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-white [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_a]:underline [&_a]:underline-offset-2">
          {children}
        </div>
        <div className="mt-14 pt-6 border-t border-zinc-800 text-xs text-zinc-500 flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/sms-opt-in">SMS Program &amp; Opt-In Policy</Link>
        </div>
      </div>
    </main>
  )
}
