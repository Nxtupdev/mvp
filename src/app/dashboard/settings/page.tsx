import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import ShopSettings from './ShopSettings'

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // SELECT * so the page survives even if a migration hasn't been run
  // yet (e.g. trusted_public_ip or timezone columns missing). Missing
  // columns are simply absent from the row and we default them below.
  const { data: shopRaw } = await supabase
    .from('shops')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shopRaw) redirect('/onboarding')

  type ShopRow = {
    id: string
    name: string
    max_queue_size: number
    first_break_minutes?: number | null
    next_break_minutes?: number | null
    keep_position_on_break?: boolean | null
    break_position_grace_minutes?: number | null
    break_mode?: 'guaranteed' | 'not_guaranteed' | null
    trusted_public_ip?: string | null
    timezone?: string | null
    // Migration 019 — late arrival toll config. Older shops without
    // la migración aplicada reciben `undefined` aquí y la UI muestra
    // la feature como deshabilitada.
    // Migración 047: el sistema de cortes (cuts_required) fue reemplazado
    // por sanción de tiempo (sanction_hours). cuts_required queda en el
    // tipo solo para compatibilidad con server pages legacy — la UI
    // de Settings solo lee/escribe sanction_hours desde la 047.
    late_arrival_threshold_time?: string | null
    late_arrival_cuts_required?: number | null
    late_arrival_sanction_hours?: number | null
    // Migración 051 — mensaje del cintillo del TV.
    display_message?: string | null
    is_open: boolean
    logo_url: string | null
  }
  const row = shopRaw as ShopRow

  // Apply defaults for any missing columns so the client component
  // always receives a fully-populated Shop. break_mode defaults to
  // 'guaranteed' for shops on the old schema (pre-migration 014) so
  // the radio renders correctly and nothing changes behaviorally
  // until they explicitly switch.
  const shop = {
    id: row.id,
    name: row.name,
    max_queue_size: row.max_queue_size,
    first_break_minutes: row.first_break_minutes ?? 60,
    next_break_minutes: row.next_break_minutes ?? 30,
    keep_position_on_break: row.keep_position_on_break ?? false,
    break_position_grace_minutes: row.break_position_grace_minutes ?? 5,
    break_mode: (row.break_mode ?? 'guaranteed') as 'guaranteed' | 'not_guaranteed',
    trusted_public_ip: row.trusted_public_ip ?? null,
    timezone: row.timezone ?? 'America/New_York',
    late_arrival_threshold_time: row.late_arrival_threshold_time ?? null,
    late_arrival_cuts_required: (row.late_arrival_cuts_required ?? 2) as 1 | 2,
    // Migración 047 — default 3h. La columna en DB es numeric(4,2) y
    // acepta valores como 1.5, 2.5, etc. cuando el dueño usa "personalizado".
    late_arrival_sanction_hours: row.late_arrival_sanction_hours ?? 3,
    display_message: row.display_message ?? null,
    is_open: row.is_open,
    logo_url: row.logo_url,
  }

  // The IP the owner is connecting from right now — used by the anti-
  // cheat section to show "you'd register THIS IP" before they tap.
  const h = await headers()
  const xff = h.get('x-forwarded-for')
  const xri = h.get('x-real-ip')
  const currentIp =
    (xff ? xff.split(',')[0]?.trim() : null) || (xri ? xri.trim() : null) || null

  return (
    <ShopSettings shop={shop} userEmail={user.email ?? ''} currentIp={currentIp} />
  )
}
