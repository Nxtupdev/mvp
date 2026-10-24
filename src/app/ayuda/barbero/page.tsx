import BarberHelpVideos from '@/components/BarberHelpVideos'

export const metadata = { title: 'Tutoriales del barbero — NXTUP' }

/**
 * /ayuda/barbero — versión PÚBLICA de los tutoriales del barbero (para
 * compartir el link fuera de la app). Dentro de la PWA, el barbero los
 * ve en la pestaña Ayuda (/barber/<shop>/<id>/ayuda), que sí queda
 * dentro del scope del manifest.
 */
export default function AyudaBarberoPage() {
  return (
    <main className="min-h-screen px-4 sm:px-6 py-8 max-w-3xl w-full mx-auto">
      <BarberHelpVideos />
    </main>
  )
}
