/**
 * Lectura completa de una consulta que puede pasar del tope de
 * PostgREST (auditoría H11).
 *
 * Supabase corta cada respuesta en 1.000 filas y no avisa: una tienda
 * con 50 ups al día supera eso en tres semanas, y el CSV, Coaching y
 * Stats mostraban "lo que cupo" como si fuera todo. Aquí se recorre
 * por páginas con `.range()` hasta recibir una página corta, y un
 * error de la base se lanza en vez de convertirse en lista vacía.
 *
 * El `build` debe devolver una consulta NUEVA cada vez (los builders
 * de supabase-js mutan al encadenar) y con un orden determinista,
 * con `id` como desempate: sin eso dos páginas pueden repetir o
 * saltarse filas.
 *
 *   const rows = await fetchAllRows('coaching close_outs', () =>
 *     supabase.from('close_outs').select('rep_id, sold')
 *       .eq('shop_id', shopId).gte('created_at', since)
 *       .order('created_at').order('id'))
 */
type PageResult<T> = { data: T[] | null; error: { message: string } | null }
type PageQuery<T> = { range: (from: number, to: number) => PromiseLike<PageResult<T>> }

export const PAGE_SIZE = 1000

export async function fetchAllRows<T>(
  label: string,
  build: () => PageQuery<T>,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1)
    if (error) throw new Error(`[${label}] ${error.message}`)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < pageSize) return all
  }
}

/** Parte una lista de ids en trozos para `.in()` sin armar URLs enormes. */
export function chunk<T>(items: T[], size = 200): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
