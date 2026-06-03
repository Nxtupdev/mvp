import ComingSoon from '../_components/ComingSoon'

export const dynamic = 'force-dynamic'

export default function AdminRevenuePage() {
  return (
    <ComingSoon
      subtitle="Reportes · Finanzas"
      title="Ingresos"
      description="Visión financiera del negocio. Cuánto está entrando, qué shop está rindiendo más, y la proyección del mes — todo cross-shop sin tener que sumar a mano."
      bullets={[
        {
          title: 'Ingresos totales del día',
          detail: 'Suma de todos los shops, en tiempo real con cierre nocturno.',
        },
        {
          title: 'Ingreso por shop',
          detail: 'Quién está produciendo más, comparativa de la semana y del mes.',
        },
        {
          title: 'Ticket promedio',
          detail: 'Valor promedio por cliente atendido, segmentado por servicio.',
        },
        {
          title: 'Proyección mensual',
          detail: 'Cierre proyectado del mes en curso basado en el ritmo actual.',
        },
      ]}
    />
  )
}
