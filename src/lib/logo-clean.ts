/**
 * cleanLogoEdges — transparencia SOLO en los bordes del logo (oct-2026).
 *
 * El problema real (Los Compadres): los dueños suben el logo como un
 * cuadrado con fondo negro/blanco y en el kiosko/TV se ve la caja. Un
 * intento anterior lo resolvió con transparencia POR COLOR y se comió
 * los negros de ADENTRO del dibujo — el logo se dañó.
 *
 * Este limpiador usa transparencia POR CONEXIÓN (flood-fill desde los
 * bordes): borra únicamente el fondo conectado con el exterior; cuando
 * la inundación choca con el sello se detiene, así que el interior es
 * matemáticamente intocable. Validado primero en Python sobre el logo
 * real de Los Compadres (331k pixeles de fondo fuera, cero del dibujo).
 *
 * Reglas de seguridad — solo actúa cuando es inequívoco:
 *   1. Si la imagen YA trae transparencia en el borde → no se toca.
 *   2. Si el borde NO es de color uniforme (logo-fotografía, degradado)
 *      → no se toca.
 *   3. Si algo falla (decode, canvas) → se devuelve el archivo original
 *      tal cual; subir siempre gana sobre limpiar.
 *   4. SVG pasa directo (es vectorial; no hay fondo que inundar).
 *
 * El dueño VE el resultado en la vista previa de Configuración antes
 * de guardar — nadie descubre una sorpresa en el TV.
 */

// Umbrales validados con el caso real: fondo seguro hasta distancia 48
// del color de borde (ruido JPEG incluido); de 48 a 110 es la pluma
// (halo de compresión/antialias) con alpha proporcional.
const TOL_FULL_SQ = 48 * 48
const TOL_EDGE_SQ = 110 * 110
// Borde "uniforme" = ningún pixel del marco se aleja más de esto del
// promedio. (Los Compadres midió 36 con JPEG re-encodeado a PNG.)
const UNIFORM_MAX_DEV = 40
// Los logos no necesitan más que esto; también acota el BFS.
const MAX_DIM = 1600

export async function cleanLogoEdges(file: File): Promise<File> {
  try {
    if (file.type === 'image/svg+xml') return file

    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const img = ctx.getImageData(0, 0, w, h)
    const d = img.data

    // ── Muestreo del marco: ¿uniforme y opaco? ──────────────────────
    let sr = 0
    let sg = 0
    let sb = 0
    let count = 0
    const borderIdx: number[] = []
    const pushIdx = (x: number, y: number) => borderIdx.push(y * w + x)
    for (let x = 0; x < w; x++) {
      pushIdx(x, 0)
      pushIdx(x, h - 1)
    }
    for (let y = 1; y < h - 1; y++) {
      pushIdx(0, y)
      pushIdx(w - 1, y)
    }
    for (const idx of borderIdx) {
      const o = idx * 4
      if (d[o + 3] < 250) return file // regla 1: ya trae transparencia
      sr += d[o]
      sg += d[o + 1]
      sb += d[o + 2]
      count++
    }
    const ar = sr / count
    const ag = sg / count
    const ab = sb / count
    for (const idx of borderIdx) {
      const o = idx * 4
      const dev = Math.max(
        Math.abs(d[o] - ar),
        Math.abs(d[o + 1] - ag),
        Math.abs(d[o + 2] - ab),
      )
      if (dev > UNIFORM_MAX_DEV) return file // regla 2: borde no uniforme
    }

    // ── Flood-fill desde el marco: solo lo conectado al exterior ────
    const visited = new Uint8Array(w * h)
    const queue = new Int32Array(w * h)
    let qHead = 0
    let qTail = 0
    for (const idx of borderIdx) {
      if (!visited[idx]) {
        visited[idx] = 1
        queue[qTail++] = idx
      }
    }

    const distSq = (o: number) => {
      const dr = d[o] - ar
      const dg = d[o + 1] - ag
      const db = d[o + 2] - ab
      return dr * dr + dg * dg + db * db
    }

    let removed = 0
    while (qHead < qTail) {
      const idx = queue[qHead++]
      const o = idx * 4
      const ds = distSq(o)
      if (ds <= TOL_FULL_SQ) {
        d[o + 3] = 0 // fondo: fuera
        removed++
        const x = idx % w
        const y = (idx - x) / w
        const push = (ni: number) => {
          if (!visited[ni]) {
            visited[ni] = 1
            queue[qTail++] = ni
          }
        }
        if (x > 0) push(idx - 1)
        if (x < w - 1) push(idx + 1)
        if (y > 0) push(idx - w)
        if (y < h - 1) push(idx + w)
      } else if (ds <= TOL_EDGE_SQ) {
        // Pluma: pixel de transición (halo), alpha parcial; no avanza.
        const dist = Math.sqrt(ds)
        d[o + 3] = Math.min(d[o + 3], Math.round((255 * (dist - 48)) / (110 - 48)))
      }
    }

    // Si no había prácticamente nada que borrar, no vale el re-encode.
    if (removed < (w * h) / 100) return file

    ctx.putImageData(img, 0, 0)
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/png'),
    )
    if (!blob) return file
    return new File([blob], 'logo.png', { type: 'image/png' })
  } catch {
    // Regla 3: subir siempre gana sobre limpiar.
    return file
  }
}
