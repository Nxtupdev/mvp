import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ShopLogo from '@/components/ShopLogo'
import { Avatar, isRenderableAvatar } from '@/components/avatars'
import { buildBarberOrder, sortByQueueOrder } from '@/lib/queue-order'

const STATUS_DOT: Record<string, string> = {
  available: 'bg-nxtup-active',
  busy: 'bg-nxtup-busy',
  break: 'bg-nxtup-break',
  offline: 'bg-nxtup-dim',
}

export default async function BarberSelectPage({
  params,
}: {
  params: Promise<{ shop_id: string }>
}) {
  const { shop_id } = await params
  const supabase = await createClient()

  const { data: shop } = await supabase
    .from('shops')
    .select('id, name, logo_url')
    .eq('id', shop_id)
    .single()

  if (!shop) notFound()

  const { data: barbers } = await supabase
    .from('barbers')
    .select('id, name, status, avatar, available_since')
    .eq('shop_id', shop_id)
    .order('name')

  const order = buildBarberOrder(barbers ?? [])
  const orderedBarbers = sortByQueueOrder(barbers ?? [], order)
  const inQueue = orderedBarbers.filter(b => order.has(b.id))
  const outOfQueue = orderedBarbers.filter(b => !order.has(b.id))

  return (
    <main className="min-h-screen flex flex-col px-6 py-10 max-w-sm mx-auto w-full">
      {shop.logo_url && (
        <ShopLogo
          url={shop.logo_url}
          name={shop.name}
          size={64}
          className="mb-5"
        />
      )}
      <p className="text-nxtup-muted text-xs uppercase tracking-[0.3em] mb-1 font-bold">
        Barber App
      </p>
      <h1 className="text-3xl font-black tracking-tight mb-8">{shop.name}</h1>

      {!barbers?.length ? (
        <p className="text-nxtup-muted">No hay barberos registrados en este shop.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-nxtup-muted text-xs uppercase tracking-widest mb-1">
            ¿Quién eres?
          </p>

          {inQueue.map(b => {
            const pos = order.get(b.id)!
            return (
              <Link
                key={b.id}
                href={`/barber/${shop_id}/${b.id}`}
                className="flex items-center gap-3 bg-nxtup-line border border-nxtup-line rounded-xl px-4 py-3 hover:border-nxtup-muted transition-colors"
              >
                <span
                  className="w-8 text-center font-black tabular-nums text-nxtup-active"
                  aria-label={`Posición ${pos}`}
                >
                  #{pos}
                </span>
                <Avatar
                  avatar={isRenderableAvatar(b.avatar) ? b.avatar : null}
                  name={b.name}
                  size={40}
                />
                <span
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[b.status] ?? 'bg-nxtup-dim'}`}
                />
                <span className="text-white text-lg font-medium flex-1 truncate">
                  {b.name}
                </span>
                <span className="text-nxtup-muted text-xs uppercase tracking-widest">
                  {b.status}
                </span>
              </Link>
            )
          })}

          {outOfQueue.length > 0 && (
            <>
              {inQueue.length > 0 && (
                <p className="text-nxtup-dim text-[10px] uppercase tracking-[0.3em] mt-3 mb-1 font-bold">
                  Fuera de fila
                </p>
              )}
              {outOfQueue.map(b => (
                <Link
                  key={b.id}
                  href={`/barber/${shop_id}/${b.id}`}
                  className="flex items-center gap-3 bg-nxtup-line border border-nxtup-line rounded-xl px-4 py-3 opacity-60 hover:opacity-100 hover:border-nxtup-muted transition-all"
                >
                  <span className="w-8 text-center font-black text-nxtup-dim">
                    —
                  </span>
                  <Avatar
                    avatar={isRenderableAvatar(b.avatar) ? b.avatar : null}
                    name={b.name}
                    size={40}
                  />
                  <span
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[b.status] ?? 'bg-nxtup-dim'}`}
                  />
                  <span className="text-white text-lg font-medium flex-1 truncate">
                    {b.name}
                  </span>
                  <span className="text-nxtup-muted text-xs uppercase tracking-widest">
                    {b.status}
                  </span>
                </Link>
              ))}
            </>
          )}
        </div>
      )}
    </main>
  )
}
