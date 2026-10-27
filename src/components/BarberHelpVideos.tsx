import { getServerI18n } from '@/lib/i18n-server'
import TutorialList from '@/components/TutorialList'

/**
 * Los video-tutoriales del BARBERO. Compartido por la página pública
 * /ayuda/barbero y la pestaña Ayuda DENTRO de la PWA del barbero
 * (/barber/<shop>/<id>/ayuda — dentro del scope del manifest, así abre
 * sin barra del navegador). Lista con "Ver" (TutorialList).
 */
const VIDEOS: { file: string; key: string; duration: string }[] = [
  { file: 'tutorial-barbero.mp4', key: 'barbero', duration: '1:01' },
  { file: 'tutorial-cobro-barbero.mp4', key: 'cobroBarbero', duration: '1:07' },
  { file: 'tutorial-citas.mp4', key: 'citas', duration: '1:00' },
]

export default async function BarberHelpVideos() {
  const { t } = await getServerI18n()
  return (
    <>
      <h1 className="text-3xl font-black tracking-tight mb-2">{t('help.barberPage.title')}</h1>
      <p className="text-nxtup-muted text-sm mb-8">{t('help.barberPage.subtitle')}</p>
      <TutorialList
        watchLabel={t('help.watch')}
        closeLabel={t('help.close')}
        tutorials={VIDEOS.map(v => ({
          file: v.file,
          title: t(`help.v.${v.key}.title`),
          desc: t(`help.v.${v.key}.desc`),
          duration: v.duration,
        }))}
      />
    </>
  )
}
