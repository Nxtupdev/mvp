import { getServerI18n } from '@/lib/i18n-server'

export const metadata = { title: 'Tutoriales del barbero — NXTUP' }

/**
 * /ayuda/barbero — los 2 video-tutoriales del BARBERO, en página
 * PÚBLICA a propósito: los barberos no tienen cuenta (su panel es un
 * link), así que la versión del dueño (/dashboard/ayuda, con login) no
 * les sirve. Los videos ya son estáticos públicos; esta página solo
 * los presenta. Enlazada desde el footer del panel del barbero.
 */

const VIDEOS: { file: string; key: string }[] = [
  { file: 'tutorial-barbero.mp4', key: 'barbero' },
  { file: 'tutorial-citas.mp4', key: 'citas' },
]

export default async function AyudaBarberoPage() {
  const { t } = await getServerI18n()

  return (
    <main className="min-h-screen px-4 sm:px-6 py-8 max-w-3xl w-full mx-auto">
      <h1 className="text-3xl font-black tracking-tight mb-2">{t('help.barberPage.title')}</h1>
      <p className="text-nxtup-muted text-sm mb-8">{t('help.barberPage.subtitle')}</p>

      <div className="grid gap-6 sm:grid-cols-2">
        {VIDEOS.map(v => (
          <div
            key={v.key}
            className="border border-nxtup-line rounded-2xl p-4 flex flex-col gap-3"
          >
            <div>
              <p className="text-white font-semibold text-sm">{t(`help.v.${v.key}.title`)}</p>
              <p className="text-nxtup-dim text-xs mt-0.5">{t(`help.v.${v.key}.desc`)}</p>
            </div>
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
    </main>
  )
}
