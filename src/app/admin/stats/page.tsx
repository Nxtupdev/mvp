import ComingSoon from '../_components/ComingSoon'

export const dynamic = 'force-dynamic'

export default function AdminStatsPage() {
  return (
    <ComingSoon
      subtitle="Reportes · Operación"
      title="Estadísticas"
      description="Panel de métricas operativas cross-shop. Te dirá cómo se está moviendo el negocio en tiempo real y sobre la marcha de los últimos días, semanas y meses — sin tener que entrar shop por shop."
      bullets={[
        {
          title: 'Cortes totales por día',
          detail: 'Volumen agregado de todos los shops, tendencia diaria/semanal/mensual.',
        },
        {
          title: 'Tiempo promedio de espera',
          detail: 'Cuánto espera un cliente en promedio antes de sentarse, por shop.',
        },
        {
          title: 'Horas pico',
          detail: 'Cuándo cae más volumen — para planear personal y promociones.',
        },
        {
          title: 'Top barberos por volumen',
          detail: 'Ranking cross-shop de quién está produciendo más cortes.',
        },
      ]}
    />
  )
}
