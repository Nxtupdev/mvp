// Identidad de la cuenta DEMO compartida — la usan los socios para
// mostrar el producto a dueños. El botón "Resetear demo" y su endpoint
// se habilitan SOLO para este dueño, así que nunca tocan un shop real.
// La barbería demo vive en prod; el reseed está en la función SQL
// reset_demo_shop() (migración 059). Ver memoria project-nxtup-demo.
export const DEMO_OWNER_EMAIL = 'demo@getnxtup.com'

// Id CONSTANTE de la barbería demo en prod. Lo usa la puerta pública
// read-only /demo — clavado a esta constante, NUNCA a un id de la
// request (frontera anti-IDOR). El seed/reset mantiene este id estable.
export const DEMO_SHOP_ID = '8581694a-71db-4185-a2ca-d662877d507a'

export function isDemoOwner(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === DEMO_OWNER_EMAIL
}
