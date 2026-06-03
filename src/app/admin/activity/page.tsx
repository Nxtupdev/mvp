import ComingSoon from '../_components/ComingSoon'

export const dynamic = 'force-dynamic'

export default function AdminActivityPage() {
  return (
    <ComingSoon
      subtitle="Auditoría · En vivo"
      title="Actividad"
      description="Feed unificado de eventos del sistema. Lo que está pasando ahora mismo y lo que pasó hoy en todos los shops — útil para auditar incidentes y entender por qué pasó lo que pasó."
      bullets={[
        {
          title: 'Eventos en tiempo real',
          detail: 'Stream live de cambios de estado, asignaciones, cascades, peajes.',
        },
        {
          title: 'Filtros por shop y barbero',
          detail: 'Para investigar un incidente específico sin ruido.',
        },
        {
          title: 'Histórico del día',
          detail: 'Reconstrucción de la línea de tiempo de cualquier shop.',
        },
        {
          title: 'Alertas y anomalías',
          detail: 'Avisos cuando algo se sale del patrón normal (muchos no-shows, queue muy larga).',
        },
      ]}
    />
  )
}
