// ============================================================
// ComingSoon — UI compartido para las páginas placeholder del
// admin que todavía no tienen contenido real. Usado por stats,
// revenue, team, activity. Cuando cada una se construya, se
// reemplaza el render entero por el contenido real — no se
// modifica este componente.
// ============================================================

export default function ComingSoon({
  title,
  subtitle,
  description,
  bullets,
}: {
  /** Título grande de la página (ej. "Estadísticas"). */
  title: string
  /** Etiqueta pequeña arriba (ej. "Reportes · Negocio"). */
  subtitle: string
  /** Descripción 1-2 líneas de qué va a vivir aquí. */
  description: string
  /** Lista de features específicas que vienen. Cada una se muestra
   *  como un card con un icono check tenue + texto. */
  bullets: { title: string; detail: string }[]
}) {
  return (
    <main className="px-6 sm:px-10 py-10 max-w-4xl">
      <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-3">
        {subtitle}
      </p>
      <div className="flex items-center gap-3 mb-3">
        <h1 className="text-3xl font-black tracking-tight">{title}</h1>
        <span className="rounded-full bg-nxtup-active/15 text-nxtup-active text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 border border-nxtup-active/30">
          Próximamente
        </span>
      </div>
      <p className="text-nxtup-muted text-sm mb-10 max-w-prose leading-relaxed">
        {description}
      </p>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {bullets.map(b => (
          <div
            key={b.title}
            className="rounded-2xl bg-nxtup-line/40 border border-nxtup-line p-5"
          >
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full border border-nxtup-dim flex items-center justify-center mt-0.5">
                <svg viewBox="0 0 24 24" width={12} height={12}>
                  <path
                    d="M5 12l5 5L20 7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-nxtup-muted"
                  />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-white text-sm font-bold mb-0.5">{b.title}</p>
                <p className="text-nxtup-muted text-xs leading-relaxed">
                  {b.detail}
                </p>
              </div>
            </div>
          </div>
        ))}
      </section>

      <p className="text-nxtup-dim text-xs mt-10">
        Esta sección se está construyendo. Cuando esté lista, la verás
        aquí mismo sin necesidad de buscar en otro lado.
      </p>
    </main>
  )
}
