import * as React from 'react'

/**
 * Avatar library — 20 culturally identifiable icons that an owner picks for
 * each barber. Inspired by the magnet-as-identity system used in real
 * barbershops (see planning/hardware-design/render-reference.md).
 *
 * SVGs use viewBox="0 0 24 24" + currentColor so they tint via CSS `text-*`.
 */

export type AvatarId =
  // ── Stroke family ───────────────────────────────────────────
  // Simple line icons, white-on-dark. Generic.
  | 'crown'
  | 'zap'
  | 'star'
  | 'diamond'
  | 'heart'
  | 'flame'
  | 'compass'
  | 'mountain'
  | 'music'
  | 'scissors'
  | 'anchor'
  | 'mustache'
  | 'cap'
  | 'glasses'
  | 'sparkle'
  | 'skull'
  | 'spade'
  | 'soccer'
  | 'dollar'
  | 'hash'
  // ── Rich family ─────────────────────────────────────────────
  // Black silhouettes on a white circular surface, closer to a
  // real barbershop sticker / magnet. Each is self-contained:
  // the white circle is part of the SVG, not the Avatar wrapper.
  | 'fist'
  | 'joker'
  | 'aztec'
  | 'kick'
  | 'truck'
  | 'bullet'

type AvatarStyle = 'stroke' | 'rich'

type AvatarDef = {
  id: AvatarId
  label: string
  /**
   * Determines how the Avatar component frames the icon:
   *   - 'stroke' (legacy): dark circular wrapper around a white
   *     line icon drawn in a 24×24 viewBox.
   *   - 'rich': the SVG itself provides the white background
   *     circle; the wrapper just sizes it. Allows filled,
   *     detailed designs without losing the magnet metaphor.
   */
  style: AvatarStyle
  render: () => React.ReactNode
}

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

// Helper so the legacy entries don't need to spell out style: 'stroke'
// on every row. Keeps the diff minimal when adding more rich icons.
function stroke(
  id: AvatarId,
  label: string,
  render: () => React.ReactNode,
): AvatarDef {
  return { id, label, style: 'stroke', render }
}

function rich(
  id: AvatarId,
  label: string,
  render: () => React.ReactNode,
): AvatarDef {
  return { id, label, style: 'rich', render }
}

export const AVATARS: AvatarDef[] = [
  stroke('crown', 'Crown', () => (
    <path
      {...STROKE}
      d="M3 18h18l-1.5-9-4 3.5L12 4l-3.5 8.5-4-3.5L3 18zM3 21h18"
    />
  )),
  stroke('zap', 'Lightning', () => (
    <path {...STROKE} d="M13 2 3 14h7l-1 8 11-12h-7l1-8z" />
  )),
  stroke('star', 'Star', () => (
    <path
      {...STROKE}
      d="M12 2l2.85 6.7L22 9.27l-5.5 4.87L18.18 21 12 17.27 5.82 21l1.68-6.86L2 9.27l7.15-.57L12 2z"
    />
  )),
  stroke('diamond', 'Diamond', () => (
    <path {...STROKE} d="M12 2 22 12 12 22 2 12z" />
  )),
  stroke('heart', 'Heart', () => (
    <path {...STROKE} d="M12 21l-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3l-9 9z" />
  )),
  stroke('flame', 'Flame', () => (
    <path
      {...STROKE}
      d="M12 2c2 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 3 3 0-3-2-4 0-8z"
    />
  )),
  stroke('compass', 'Compass', () => (
    <g {...STROKE}>
      <circle cx="12" cy="12" r="9" />
      <path d="M16 8l-2 6-6 2 2-6 6-2z" />
    </g>
  )),
  stroke('mountain', 'Mountain', () => (
    <path {...STROKE} d="M3 20 9 8l4 6 3-5 5 11H3z" />
  )),
  stroke('music', 'Music', () => (
    <g {...STROKE}>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </g>
  )),
  stroke('scissors', 'Scissors', () => (
    <g {...STROKE}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" />
    </g>
  )),
  stroke('anchor', 'Anchor', () => (
    <g {...STROKE}>
      <circle cx="12" cy="5" r="3" />
      <path d="M12 8v14M5 12a7 7 0 0 0 14 0M5 12h14" />
    </g>
  )),
  stroke('mustache', 'Mustache', () => (
    <path
      {...STROKE}
      d="M3 13c2-3 5-3 7 1 1-1 3-1 4 0 2-4 5-4 7-1-1 3-4 4-6 3-1 0-2-1-3-1s-2 1-3 1c-2 1-5 0-6-3z"
    />
  )),
  stroke('cap', 'Snapback', () => (
    <g {...STROKE}>
      <path d="M4 14a8 8 0 0 1 16 0" />
      <path d="M2 14h20v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3z" />
    </g>
  )),
  stroke('glasses', 'Glasses', () => (
    <g {...STROKE}>
      <circle cx="6.5" cy="14" r="3.5" />
      <circle cx="17.5" cy="14" r="3.5" />
      <path d="M10 14h4M3 10l2-4M21 10l-2-4" />
    </g>
  )),
  stroke('sparkle', 'Sparkle', () => (
    <path
      {...STROKE}
      d="M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2M5.6 18.4l4.2-4.2M14.2 9.8l4.2-4.2"
    />
  )),
  stroke('skull', 'Skull', () => (
    <g {...STROKE}>
      <path d="M12 2C7 2 4 6 4 11v3l2 2v3h3l1-2h4l1 2h3v-3l2-2v-3c0-5-3-9-8-9z" />
      <circle cx="9" cy="11" r="1.5" />
      <circle cx="15" cy="11" r="1.5" />
      <path d="M11 15h2" />
    </g>
  )),
  stroke('spade', 'Spade', () => (
    <path
      {...STROKE}
      d="M12 2c4 4 7 7 7 10a4 4 0 0 1-6 3.5L13 22h-2l0-6.5A4 4 0 0 1 5 12c0-3 3-6 7-10z"
    />
  )),
  stroke('soccer', 'Soccer', () => (
    <g {...STROKE}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 5l4 3-1.5 5h-5L8 8l4-3zM12 5v-2M3.5 12 8 8M20.5 12 16 8M14.5 13l3 5M9.5 13l-3 5" />
    </g>
  )),
  stroke('dollar', 'Dollar', () => (
    <path
      {...STROKE}
      d="M12 2v20M17 6c-1-1.5-3-2.5-5-2.5-3 0-5 1.5-5 4s2.5 3.5 5 4 5 1.5 5 4-2 4-5 4c-2 0-4-1-5-2.5"
    />
  )),
  stroke('hash', 'Hash', () => (
    <path {...STROKE} d="M9 3 7 21M17 3l-2 18M3.5 9h17M3 15h17" />
  )),

  // ──────────────────────────────────────────────────────────────
  // Rich family — magnet-style filled silhouettes, self-framed.
  // Each renders inside a 100×100 viewBox that includes its own
  // white circle background so the Avatar wrapper doesn't need to
  // know about the colour palette.
  // ──────────────────────────────────────────────────────────────

  rich('fist', 'Raised fist', () => (
    <RichFrame>
      {/* Sleeve + wrist */}
      <path d="M30 78 v 18 h 40 v -18 q 0 -4 -4 -4 h -32 q -4 0 -4 4 z" />
      {/* Knuckles row */}
      <path d="M28 50 q 0 -10 10 -10 h 24 q 10 0 10 10 v 24 q 0 6 -6 6 h -32 q -6 0 -6 -6 z" />
      {/* Finger separations — thin white lines etched into the knuckles */}
      <path
        fill="white"
        d="M38 44 v 16 h 2 v -16 z M48 44 v 16 h 2 v -16 z M58 44 v 16 h 2 v -16 z"
      />
      {/* Thumb wrapped on the left side */}
      <path d="M22 58 q -4 -2 -4 4 v 10 q 0 6 6 6 h 8 v -20 q -5 0 -10 0 z" />
    </RichFrame>
  )),

  rich('joker', 'Joker grin', () => (
    <RichFrame>
      {/* Face outline */}
      <circle cx="50" cy="50" r="32" />
      {/* Carve the face back out so eyes/mouth read as black-on-white */}
      <g fill="white">
        {/* Forehead / cheeks */}
        <path d="M50 22 a 28 28 0 1 1 -0.1 0 z" />
      </g>
      <g fill="black">
        {/* Wild hair tufts on top */}
        <path d="M32 28 q 4 -10 10 -8 q -2 4 -4 10 z M68 28 q -4 -10 -10 -8 q 2 4 4 10 z M50 18 q -4 6 -2 12 q 2 -6 6 -10 z" />
        {/* Diamond eyes */}
        <path d="M38 42 l 4 -4 l 4 4 l -4 4 z M58 42 l 4 -4 l 4 4 l -4 4 z" />
        {/* Wide curving grin */}
        <path d="M30 56 q 20 24 40 0 q -4 -2 -8 -2 q -4 6 -12 6 q -8 0 -12 -6 q -4 0 -8 2 z" />
        {/* Teeth gap */}
        <path fill="white" d="M48 62 h 4 v 6 h -4 z" />
      </g>
    </RichFrame>
  )),

  rich('aztec', 'Aztec skull', () => (
    <RichFrame>
      {/* Skull outline with the chin slightly tapered */}
      <path d="M50 20 q -22 0 -22 24 v 14 l 4 4 v 10 l 4 -3 l 4 3 v 6 q 0 4 4 4 h 12 q 4 0 4 -4 v -6 l 4 -3 l 4 3 v -10 l 4 -4 v -14 q 0 -24 -22 -24 z" />
      {/* Eye sockets carved out */}
      <g fill="white">
        <ellipse cx="40" cy="46" rx="6" ry="7" />
        <ellipse cx="60" cy="46" rx="6" ry="7" />
        {/* Decorative dots inside the sockets — keeps them "alive" */}
      </g>
      <g fill="black">
        <circle cx="40" cy="46" r="2" />
        <circle cx="60" cy="46" r="2" />
        {/* Triangular nose hole */}
        <path fill="white" d="M48 56 l 2 6 l 2 -6 z" />
        {/* Teeth row */}
        <path d="M38 68 h 24 v 4 h -24 z" />
        <path fill="white" d="M42 68 v 4 M46 68 v 4 M50 68 v 4 M54 68 v 4 M58 68 v 4" stroke="white" strokeWidth="1" />
        {/* Top crown / headdress flourishes */}
        <path d="M32 24 l -6 -8 l 6 6 z M50 16 l -3 -10 l 3 8 l 3 -8 l -3 10 z M68 24 l 6 -8 l -6 6 z" />
      </g>
    </RichFrame>
  )),

  rich('kick', 'High kick', () => (
    <RichFrame>
      {/* Head */}
      <circle cx="38" cy="26" r="8" />
      {/* Torso angled forward */}
      <path d="M34 34 q 6 4 12 12 l -6 6 q -8 -6 -10 -14 z" />
      {/* Standing leg planted on the ground */}
      <path d="M40 50 q 4 8 4 18 q 0 6 -2 12 h -6 q 2 -8 0 -16 q -2 -8 -2 -12 z" />
      {/* Front foot of standing leg */}
      <path d="M30 80 h 14 v 4 h -14 z" />
      {/* High-kick leg extending out to the right */}
      <path d="M46 46 q 16 -6 30 -8 q 2 0 2 4 q -2 4 -6 4 q -12 2 -22 6 z" />
      {/* Kicking foot */}
      <path d="M76 38 l 10 -2 v 4 l -10 4 z" />
      {/* Back arm for balance */}
      <path d="M34 38 q -8 4 -10 12 l 4 4 q 4 -6 10 -10 z" />
    </RichFrame>
  )),

  rich('truck', 'Cement truck', () => (
    <RichFrame>
      {/* Truck cab (left) */}
      <path d="M18 56 h 16 v 18 h -16 z" />
      {/* Cab window — carve white */}
      <path fill="white" d="M22 60 h 8 v 8 h -8 z" />
      {/* Cement mixer drum (right) — a tilted ellipse on a frame */}
      <path d="M34 50 l 40 -6 q 8 12 0 28 l -40 -6 z" />
      {/* Mixer spiral lines */}
      <g fill="none" stroke="white" strokeWidth="2.5">
        <path d="M42 50 q 14 8 28 4" />
        <path d="M40 60 q 16 8 32 2" />
        <path d="M42 70 q 14 6 28 2" />
      </g>
      {/* Truck bed under the drum */}
      <path d="M34 70 h 50 v 6 h -50 z" />
      {/* Wheels */}
      <circle cx="28" cy="80" r="6" />
      <circle cx="48" cy="80" r="6" />
      <circle cx="70" cy="80" r="6" />
      {/* Wheel hubs */}
      <circle cx="28" cy="80" r="2" fill="white" />
      <circle cx="48" cy="80" r="2" fill="white" />
      <circle cx="70" cy="80" r="2" fill="white" />
    </RichFrame>
  )),

  rich('bullet', 'Bullet', () => (
    <RichFrame>
      {/* Bullet body (ogive top + cylindrical case) — drawn tilted to
          feel dynamic, like the reference. */}
      <g transform="rotate(-25 50 50)">
        {/* Ogive (rounded tip) */}
        <path d="M50 22 q 12 8 12 24 h -24 q 0 -16 12 -24 z" />
        {/* Casing */}
        <path d="M38 46 h 24 v 32 h -24 z" />
        {/* Rim ring at the bottom */}
        <path d="M36 76 h 28 v 4 h -28 z" />
        {/* Tip highlight — carve a thin white line */}
        <path fill="white" d="M48 28 q 0 8 -2 14 h 2 z" />
      </g>
      {/* Flame trail behind the bullet — three teardrop wisps */}
      <g>
        <path d="M22 56 q -8 -2 -10 -10 q 6 0 12 6 z" />
        <path d="M18 66 q -10 0 -14 -6 q 6 -2 14 2 z" />
        <path d="M22 76 q -8 4 -14 0 q 4 -4 12 -4 z" />
      </g>
    </RichFrame>
  )),
]

// ──────────────────────────────────────────────────────────────
// RichFrame — shared chrome for the "magnet" family. Provides the
// white circle background + thin black border, then renders the
// icon paths inside. Children are black-filled by default.
// ──────────────────────────────────────────────────────────────

function RichFrame({ children }: { children: React.ReactNode }) {
  return (
    <g>
      <circle cx="50" cy="50" r="48" fill="white" stroke="black" strokeWidth="2" />
      <g fill="black">{children}</g>
    </g>
  )
}

export const AVATAR_IDS: AvatarId[] = AVATARS.map(a => a.id)

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === 'string' && AVATAR_IDS.includes(value as AvatarId)
}

/**
 * Renders the chosen avatar inside a circular surface. Falls back to a
 * neutral monogram of the name's first letter if no avatar is set.
 */
export function Avatar({
  avatar,
  name,
  size = 36,
  className = '',
}: {
  avatar?: AvatarId | null | undefined
  name?: string
  size?: number
  className?: string
}) {
  const def = avatar ? AVATARS.find(a => a.id === avatar) : null

  // Rich avatars draw their own circular surface inside the SVG —
  // the wrapper just provides sizing + a layout-safe rounded mask
  // so they never spill outside the intended footprint.
  if (def && def.style === 'rich') {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full overflow-hidden flex-shrink-0 ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <svg viewBox="0 0 100 100" width={size} height={size}>
          {def.render()}
        </svg>
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-nxtup-line text-white flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {def ? (
        <svg
          viewBox="0 0 24 24"
          width={Math.round(size * 0.55)}
          height={Math.round(size * 0.55)}
        >
          {def.render()}
        </svg>
      ) : (
        <span
          className="font-bold uppercase text-nxtup-muted"
          style={{ fontSize: Math.round(size * 0.4) }}
        >
          {(name?.trim()[0] ?? '?').toUpperCase()}
        </span>
      )}
    </span>
  )
}

/**
 * Grid picker. Click an icon to select it. Pass `value=null` to clear.
 */
export function AvatarPicker({
  value,
  onChange,
  size = 44,
  allowClear = true,
}: {
  value: AvatarId | null
  onChange: (next: AvatarId | null) => void
  size?: number
  allowClear?: boolean
}) {
  return (
    <div
      className="grid gap-2"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${size + 12}px, 1fr))`,
      }}
    >
      {allowClear && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="No avatar"
          aria-pressed={value === null}
          className={`flex items-center justify-center rounded-full border transition-colors ${
            value === null
              ? 'border-white text-white'
              : 'border-nxtup-dim text-nxtup-muted hover:border-nxtup-muted'
          }`}
          style={{ width: size, height: size }}
        >
          <svg viewBox="0 0 24 24" width={size * 0.45} height={size * 0.45}>
            <path
              {...STROKE}
              d="M5 5l14 14M19 5 5 19"
            />
          </svg>
        </button>
      )}
      {AVATARS.map(av => {
        const selected = value === av.id
        // Rich avatars are self-contained: their SVG includes the
        // circular surface, so the button itself just provides the
        // tap target and a selection ring. Stroke avatars use the
        // legacy dark-disc treatment.
        if (av.style === 'rich') {
          return (
            <button
              key={av.id}
              type="button"
              onClick={() => onChange(av.id)}
              aria-label={av.label}
              aria-pressed={selected}
              title={av.label}
              className={`relative flex items-center justify-center rounded-full transition-transform active:scale-95 ${
                selected ? 'ring-2 ring-white ring-offset-2 ring-offset-nxtup-bg' : ''
              }`}
              style={{ width: size, height: size }}
            >
              <svg viewBox="0 0 100 100" width={size} height={size}>
                {av.render()}
              </svg>
            </button>
          )
        }
        return (
          <button
            key={av.id}
            type="button"
            onClick={() => onChange(av.id)}
            aria-label={av.label}
            aria-pressed={selected}
            title={av.label}
            className={`flex items-center justify-center rounded-full border transition-colors ${
              selected
                ? 'border-white text-white bg-nxtup-line'
                : 'border-nxtup-dim text-nxtup-muted hover:text-white hover:border-nxtup-muted'
            }`}
            style={{ width: size, height: size }}
          >
            <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55}>
              {av.render()}
            </svg>
          </button>
        )
      })}
    </div>
  )
}
