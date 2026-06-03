import ComingSoon from '../_components/ComingSoon'

export const dynamic = 'force-dynamic'

export default function AdminTeamPage() {
  return (
    <ComingSoon
      subtitle="Operación · Equipo"
      title="Equipo"
      description="Visión de todo el equipo: barberos activos, productividad, asistencia y break compliance. Para que sepas cómo está rindiendo el personal sin tener que estar en cada shop."
      bullets={[
        {
          title: 'Roster cross-shop',
          detail: 'Todos los barberos de todos los shops en una sola lista filtrable.',
        },
        {
          title: 'Cortes completados',
          detail: 'Por barbero, por día, por semana. Ranking y tendencia.',
        },
        {
          title: 'Asistencia',
          detail: 'Cuándo entró, cuántos breaks, late arrivals del día.',
        },
        {
          title: 'No-shows del cascade',
          detail: 'Quién no respondió a clientes — para conversaciones con barberos.',
        },
      ]}
    />
  )
}
