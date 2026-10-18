import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getServerI18n } from '@/lib/i18n-server'

export const metadata = { title: 'Tutoriales — NXTUP' }

/**
 * /dashboard/ayuda — los 5 video-tutoriales (Remotion, 1080x1920),
 * servidos como estáticos desde public/tutoriales (CDN de Vercel, con
 * seek por range requests). Agrupados por audiencia: dueño y barberos.
 */

const SECTIONS: { headingKey: string; videos: { file: string; key: string }[] }[] = [
  {
    headingKey: 'help.owner',
    videos: [
      { file: 'tutorial-config.mp4', key: 'config' },
      { file: 'tutorial-live.mp4', key: 'live' },
      { file: 'tutorial-cobro.mp4', key: 'cobro' },
    ],
  },
  {
    headingKey: 'help.barber',
    videos: [
      { file: 'tutorial-barbero.mp4', key: 'barbero' },
      { file: 'tutorial-citas.mp4', key: 'citas' },
    ],
  },
]

export default async function AyudaPage() {
  const { t } = await getServerI18n()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: shop } = await supabase
    .from('shops')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) redirect('/onboarding')

  return (
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-5xl w-full mx-auto">
      <h1 className="text-3xl font-black tracking-tight mb-2">{t('help.title')}</h1>
      <p className="text-nxtup-muted text-sm mb-8">{t('help.subtitle')}</p>

      {SECTIONS.map(section => (
        <section key={section.headingKey} className="mb-10">
          <h2 className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-4">
            {t(section.headingKey)}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {section.videos.map(v => (
              <div
                key={v.key}
                className="border border-nxtup-line rounded-2xl p-4 flex flex-col gap-3"
              >
                <div>
                  <p className="text-white font-semibold text-sm">
                    {t(`help.v.${v.key}.title`)}
                  </p>
                  <p className="text-nxtup-dim text-xs mt-0.5">
                    {t(`help.v.${v.key}.desc`)}
                  </p>
                </div>
                {/* preload=metadata: carga solo el primer frame como
                    portada — 5 videos a la vez sin bajar 35MB de golpe. */}
                <video
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full aspect-[9/16] rounded-xl bg-black"
                  src={`/tutoriales/${v.file}`}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}
