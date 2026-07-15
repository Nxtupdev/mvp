// Identidad de la cuenta DEMO compartida — la usan los socios para
// mostrar el producto a dueños. El botón "Resetear demo" y su endpoint
// se habilitan SOLO para este dueño, así que nunca tocan un shop real.
// La barbería demo vive en prod; el reseed está en la función SQL
// reset_demo_shop() (migración 059). Ver memoria project-nxtup-demo.
export const DEMO_OWNER_EMAIL = 'demo@getnxtup.com'

export function isDemoOwner(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === DEMO_OWNER_EMAIL
}
