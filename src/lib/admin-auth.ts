/**
 * Sistema de roles para `/admin/*`. Dos niveles:
 *
 *   * ADMIN  — staff con poder total (Frank). Genera links, revoca,
 *     puede tocar configuración destructiva. Lista en `ADMIN_EMAILS`.
 *   * PARTNER — socios del negocio (vista de lectura). Ven shops,
 *     stats, reportes — pero no pueden crear/modificar/borrar.
 *     Lista en `PARTNER_EMAILS`.
 *
 * Ambas son env vars comma-separated. Sin configurar → fail-closed
 * (nadie pasa). En producción configurar en Vercel:
 *
 *   ADMIN_EMAILS=frpenalo@gmail.com
 *   PARTNER_EMAILS=socio1@ejemplo.com,socio2@ejemplo.com,socio3@ejemplo.com
 *
 * Para local dev agregar a `.env.local`.
 */

function parseEmailList(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminUser(email: string | null | undefined): boolean {
  if (!email) return false
  const allowed = parseEmailList(process.env.ADMIN_EMAILS)
  return allowed.includes(email.toLowerCase())
}

export function isPartnerUser(email: string | null | undefined): boolean {
  if (!email) return false
  const allowed = parseEmailList(process.env.PARTNER_EMAILS)
  return allowed.includes(email.toLowerCase())
}

/**
 * True si el usuario puede entrar al área `/admin/*` (admin o socio).
 * Usado por el layout para autorizar el acceso al shell.
 * Páginas/acciones destructivas (panel-tokens, etc.) deben hacer un
 * check ADICIONAL con `isAdminUser` para excluir socios.
 */
export function canAccessAdminRoutes(email: string | null | undefined): boolean {
  return isAdminUser(email) || isPartnerUser(email)
}

export type AdminRole = 'admin' | 'partner'

export function getAdminRole(email: string | null | undefined): AdminRole | null {
  if (isAdminUser(email)) return 'admin'
  if (isPartnerUser(email)) return 'partner'
  return null
}

/**
 * Label humano para mostrar en el sidebar debajo del email.
 *
 * Ambos roles muestran "Cofounder" — decisión del equipo para que
 * los socios sientan paridad en el branding, no inferioridad.
 * La diferencia de permisos sigue siendo real internamente (admin
 * puede crear/revocar, partner solo ve), pero el badge social es el
 * mismo.
 *
 * Para diferenciar funciones específicas se usa el campo opcional
 * `user_metadata.title` (CEO, CTO, COO, etc.) leído por el layout
 * y mostrado debajo del rol — sin necesidad de cambios de código.
 */
export function getRoleLabel(role: AdminRole | null): string {
  if (role === 'admin') return 'Cofounder'
  if (role === 'partner') return 'Cofounder'
  return ''
}
