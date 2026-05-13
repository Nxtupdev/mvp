'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarPicker, isAvatarId, type AvatarId } from '@/components/avatars'

type Barber = {
  id: string
  name: string
  status: 'available' | 'busy' | 'break' | 'offline'
  avatar: AvatarId | null
  created_at: string
}

const STATUS_DOT: Record<Barber['status'], string> = {
  available: 'bg-nxtup-active',
  busy: 'bg-nxtup-busy',
  break: 'bg-nxtup-break',
  offline: 'bg-nxtup-dim',
}

const STATUS_LABEL: Record<Barber['status'], string> = {
  available: 'Available',
  busy: 'Busy',
  break: 'Break',
  offline: 'Offline',
}

function normalize(rows: unknown[]): Barber[] {
  return rows.map(r => {
    const row = r as { avatar?: unknown } & Omit<Barber, 'avatar'>
    return {
      ...row,
      avatar: isAvatarId(row.avatar) ? row.avatar : null,
    }
  })
}

export default function BarberManager({
  shopId,
  initialBarbers,
}: {
  shopId: string
  initialBarbers: Barber[]
}) {
  const [barbers, setBarbers] = useState<Barber[]>(() => normalize(initialBarbers))
  const [name, setName] = useState('')
  const [newAvatar, setNewAvatar] = useState<AvatarId | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`barbers-mgr-${shopId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'barbers', filter: `shop_id=eq.${shopId}` },
        async () => {
          const { data } = await supabase
            .from('barbers')
            .select('id, name, status, avatar, created_at')
            .eq('shop_id', shopId)
            .order('created_at', { ascending: true })
          if (data) setBarbers(normalize(data))
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [shopId])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (adding || !name.trim()) return
    setAdding(true)
    setError('')
    const supabase = createClient()
    const { data, error: addErr } = await supabase
      .from('barbers')
      .insert({ shop_id: shopId, name: name.trim(), avatar: newAvatar })
      .select('id, name, status, avatar, created_at')
      .single()
    if (addErr) {
      setError(addErr.message)
    } else if (data) {
      setBarbers(prev => [...prev, ...normalize([data])])
      setName('')
      setNewAvatar(null)
      setPickerOpen(false)
    }
    setAdding(false)
  }

  async function handleRename(id: string, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed) return
    setPendingId(id)
    const supabase = createClient()
    await supabase.from('barbers').update({ name: trimmed }).eq('id', id)
    setBarbers(prev => prev.map(b => (b.id === id ? { ...b, name: trimmed } : b)))
    setPendingId(null)
  }

  async function handleAvatarChange(id: string, avatar: AvatarId | null) {
    setPendingId(id)
    const supabase = createClient()
    await supabase.from('barbers').update({ avatar }).eq('id', id)
    setBarbers(prev => prev.map(b => (b.id === id ? { ...b, avatar } : b)))
    setPendingId(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Eliminar barbero? Esta acción no se puede deshacer.')) return
    setPendingId(id)
    const supabase = createClient()
    const { error: delErr } = await supabase.from('barbers').delete().eq('id', id)
    if (!delErr) setBarbers(prev => prev.filter(b => b.id !== id))
    else setError(delErr.message)
    setPendingId(null)
  }

  return (
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-3xl w-full mx-auto">
      <h1 className="text-3xl font-black tracking-tight mb-2">Barbers</h1>
      <p className="text-nxtup-muted text-sm mb-8">
        Cada barbero tiene su ícono — el equivalente digital del magnet con el que se
        identifica en la pizarra. Status se actualiza desde el NXT TAP o la app de respaldo.
      </p>

      <form
        onSubmit={handleAdd}
        className="border border-nxtup-line rounded-2xl p-4 mb-8 flex flex-col gap-4"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPickerOpen(o => !o)}
            aria-label="Choose icon"
            className="hover:opacity-80 transition-opacity"
          >
            <Avatar avatar={newAvatar} name={name} size={40} />
          </button>
          <input
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nombre del barbero"
            className="flex-1 bg-nxtup-bg text-white rounded-lg px-4 py-3 border border-nxtup-dim focus:border-white focus:outline-none placeholder:text-nxtup-dim"
          />
          <button
            type="submit"
            disabled={adding || !name.trim()}
            className="px-5 py-3 bg-white text-black font-semibold rounded-lg disabled:opacity-40 transition-all active:scale-[0.98] whitespace-nowrap"
          >
            {adding ? '...' : 'Add'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setPickerOpen(o => !o)}
          className="text-nxtup-muted hover:text-white text-xs uppercase tracking-widest text-left transition-colors"
        >
          {pickerOpen ? '▾ Hide icons' : '▸ Choose icon (optional)'}
        </button>

        {pickerOpen && (
          <div className="pt-2 border-t border-nxtup-line">
            <AvatarPicker value={newAvatar} onChange={setNewAvatar} />
          </div>
        )}
      </form>

      {error && <p className="text-nxtup-busy text-sm mb-4">{error}</p>}

      {barbers.length === 0 ? (
        <div className="border border-dashed border-nxtup-dim rounded-2xl py-16 text-center">
          <p className="text-nxtup-muted text-sm">
            Sin barberos todavía. Agrega el primero arriba.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {barbers.map(b => (
            <BarberRow
              key={b.id}
              barber={b}
              pending={pendingId === b.id}
              onRename={name => handleRename(b.id, name)}
              onAvatarChange={av => handleAvatarChange(b.id, av)}
              onDelete={() => handleDelete(b.id)}
            />
          ))}
        </ul>
      )}
    </main>
  )
}

function BarberRow({
  barber,
  pending,
  onRename,
  onAvatarChange,
  onDelete,
}: {
  barber: Barber
  pending: boolean
  onRename: (name: string) => void
  onAvatarChange: (avatar: AvatarId | null) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(barber.name)
  const [pickerOpen, setPickerOpen] = useState(false)

  function commit() {
    setEditing(false)
    if (draft.trim() && draft !== barber.name) onRename(draft)
    else setDraft(barber.name)
  }

  return (
    <li className="rounded-xl bg-nxtup-line border border-nxtup-line">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setPickerOpen(o => !o)}
          aria-label="Change avatar"
          className="hover:opacity-80 transition-opacity"
        >
          <Avatar avatar={barber.avatar} name={barber.name} size={36} />
        </button>
        <span
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[barber.status]}`}
        />
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setDraft(barber.name)
                setEditing(false)
              }
            }}
            className="flex-1 bg-transparent text-white font-medium focus:outline-none border-b border-white"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex-1 text-left text-white font-medium truncate hover:text-nxtup-muted transition-colors"
          >
            {barber.name}
          </button>
        )}
        <span className="text-nxtup-muted text-xs uppercase tracking-widest hidden sm:inline">
          {STATUS_LABEL[barber.status]}
        </span>
        <button
          onClick={onDelete}
          disabled={pending}
          className="text-nxtup-dim hover:text-nxtup-busy text-xs px-2 py-1 transition-colors disabled:opacity-40"
          aria-label={`Eliminar ${barber.name}`}
        >
          Delete
        </button>
      </div>

      {pickerOpen && (
        <div className="px-4 pb-4 pt-1 border-t border-nxtup-bg">
          <AvatarPicker
            value={barber.avatar}
            onChange={av => {
              onAvatarChange(av)
              setPickerOpen(false)
            }}
          />
        </div>
      )}
    </li>
  )
}
