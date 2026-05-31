/**
 * Super-admin check para rutas que NO son del dueño de un shop sino
 * del staff de NXTUP (Frank y futuros operadores). Lista los emails
 * autorizados vía env var `ADMIN_EMAILS` (comma-separated).
 *
 * Uso típico:
 *   const { user } = await supabase.auth.getUser()
 *   if (!isAdminUser(user?.email)) redirect('/')
 *
 * Si la env var no está configurada, devuelve false para CUALQUIER
 * usuario — fail-closed. En producción, configurar en Vercel:
 *   ADMIN_EMAILS=frpenalo@gmail.com,otro@nxtup.com
 *
 * Para local dev: agregar la misma línea a `.env.local`.
 */
export function isAdminUser(email: string | null | undefined): boolean {
  if (!email) return false
  const raw = process.env.ADMIN_EMAILS
  if (!raw) return false
  const allowed = raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
  return allowed.includes(email.toLowerCase())
}
