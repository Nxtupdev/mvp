import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getServerI18n } from '@/lib/i18n-server'
import TutorialList from '@/components/TutorialList'

export const metadata = { title: 'Tutoriales — NXTUP' }

/**
 * /dashboard/ayuda — los video-tutoriales (Remotion, 1080x1920), servidos
 * como estáticos desde public/tutoriales (CDN de Vercel, con seek por
 * range requests). Agrupados por audiencia: dueño y barberos. Lista con
 * "Ver" que abre el video encima (TutorialList), no un reproductor por
 * video.
 */

const SECTIONS: {
  headingKey: string
  videos: { file: string; key: string; duration: string }[]
}[] = [
  {
    headingKey: 'help.owner',
    videos: [
      { file: 'tutorial-config.mp4', key: 'config', duration: '1:19' },
      { file: 'tutorial-live.mp4', key: 'live', duration: '1:26' },
      { file: 'tutorial-cuentas.mp4', key: 'cuentas', duration: '1:18' },
      { file: 'tutorial-cobro.mp4', key: 'cobro', duration: '1:30' },
    ],
  },
  {
    headingKey: 'help.barber',
    videos: [
      { file: 'tutorial-barbero.mp4', key: 'barbero', duration: '1:01' },
      { file: 'tutorial-cobro-barbero.mp4', key: 'cobroBarbero', duration: '1:07' },
      { file: 'tutorial-citas.mp4', key: 'citas', duration: '1:00' },
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
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-2xl w-full mx-auto">
      <h1 className="text-3xl font-black tracking-tight mb-2">{t('help.title')}</h1>
      <p className="text-nxtup-muted text-sm mb-8">{t('help.subtitle')}</p>

      {SECTIONS.map(section => (
        <section key={section.headingKey} className="mb-8">
          <h2 className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-3">
            {t(section.headingKey)}
          </h2>
          <TutorialList
            watchLabel={t('help.watch')}
            closeLabel={t('help.close')}
            tutorials={section.videos.map(v => ({
              file: v.file,
              title: t(`help.v.${v.key}.title`),
              desc: t(`help.v.${v.key}.desc`),
              duration: v.duration,
            }))}
          />
        </section>
      ))}
    </main>
  )
}
