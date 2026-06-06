'use client'

/**
 * Botón "Descargar PDF" del reporte de stats.
 *
 * Estrategia: invocar `window.print()` del navegador. El usuario elige
 * "Guardar como PDF" en el diálogo de impresión nativo. Esto evita
 * agregar dependencias pesadas (react-pdf, puppeteer, jsPDF) y funciona
 * igual en desktop y móvil — el navegador maneja todo.
 *
 * El layout impreso queda gobernado por las reglas `@media print` en
 * `globals.css` + utilidades `print:hidden` de Tailwind v4 esparcidas
 * por la página y el layout del dashboard.
 *
 * Trade-off: el "estilo" del PDF depende del navegador (encabezado,
 * pie de página). Chrome y Safari ambos producen un PDF leíble.
 * Si en el futuro queremos un PDF totalmente controlado (logo NXTUP,
 * branding fijo), se cambia este onClick por un POST a un endpoint
 * server-side y el botón sigue siendo el mismo.
 */
export default function PrintButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={
        className ??
        'print:hidden bg-white text-black rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-nxtup-active transition-colors'
      }
    >
      Descargar PDF
    </button>
  )
}
