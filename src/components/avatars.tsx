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
  // ── Barbershop ──────────────────────────────────────────────
  | 'razor'
  | 'comb'
  | 'barber-pole'
  | 'mirror'
  | 'coffee'
  // ── Animales ────────────────────────────────────────────────
  | 'lion'
  | 'eagle'
  | 'dragon'
  | 'tiger'
  | 'bull'
  // ── Naturaleza ──────────────────────────────────────────────
  | 'sun'
  | 'moon'
  | 'lightning-bolt'
  | 'wave'
  | 'pine'
  // ── Símbolos / objetos ──────────────────────────────────────
  | 'trophy'
  | 'key'
  | 'shield'
  | 'lightbulb'
  | 'rocket'
  // ── Deportes ────────────────────────────────────────────────
  | 'baseball'
  | 'boxing-glove'
  | 'basketball'
  | 'tennis'
  | 'dumbbell'
  // ── Música ──────────────────────────────────────────────────
  | 'guitar'
  | 'headphones'
  | 'vinyl'
  | 'microphone'
  | 'piano'
  // ── Cultura DR / latina ─────────────────────────────────────
  | 'flag-do'
  | 'rooster'
  | 'palm'
  | 'dominoes'
  | 'maracas'
  | 'cigar'
  | 'plantain'
  | 'tambora'
  | 'coconut'
  // NOTE: The 'rich' family infrastructure is kept below (AvatarStyle
  // type, rich() helper, RichFrame component, render branch) but no
  // rich icons currently ship — my first attempt at hand-coded SVG
  // silhouettes (fist, joker, aztec, etc.) came out below the bar.
  // The infra is left wired so a designer can drop new ids here and
  // add rich() entries in AVATARS without touching the framework.

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

// Available for when proper rich icons get added. Currently unused —
// see note on the AvatarId union above.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // ── Barbershop themed ─────────────────────────────────────────
  stroke('razor', 'Razor', () => (
    <g {...STROKE}>
      <path d="M3 21l7-7" />
      <path d="M10 14l8-8 3 3-8 8z" />
    </g>
  )),
  stroke('comb', 'Comb', () => (
    <g {...STROKE}>
      <rect x="3" y="9" width="18" height="5" rx="1" />
      <path d="M6 14v5M9 14v5M12 14v5M15 14v5M18 14v5" />
    </g>
  )),
  stroke('barber-pole', 'Barber pole', () => (
    <g {...STROKE}>
      <rect x="8" y="3" width="8" height="18" rx="1" />
      <path d="M8 7l8 4M8 11l8 4M8 15l8 4" />
    </g>
  )),
  stroke('mirror', 'Mirror', () => (
    <g {...STROKE}>
      <ellipse cx="12" cy="10" rx="6" ry="7" />
      <path d="M12 17v4M9 21h6" />
    </g>
  )),
  stroke('coffee', 'Coffee', () => (
    <g {...STROKE}>
      <path d="M4 9h13v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9z" />
      <path d="M17 12h2a2 2 0 0 1 0 4h-2" />
      <path d="M8 3v3M12 3v3" />
    </g>
  )),

  // ── Animales ──────────────────────────────────────────────────
  stroke('lion', 'Lion', () => (
    <g {...STROKE}>
      <circle cx="12" cy="13" r="5" />
      <path d="M12 3l2 3M12 3l-2 3M5 8l2 2M19 8l-2 2M3 13h3M18 13h3M5 19l2-2M19 19l-2-2" />
      <circle cx="10" cy="12" r="0.5" fill="currentColor" />
      <circle cx="14" cy="12" r="0.5" fill="currentColor" />
      <path d="M11 15h2" />
    </g>
  )),
  stroke('eagle', 'Eagle', () => (
    <g {...STROKE}>
      <path d="M12 4l-2 4-7 1 5 3-1 6 5-3 5 3-1-6 5-3-7-1z" />
    </g>
  )),
  stroke('dragon', 'Dragon', () => (
    <g {...STROKE}>
      <path d="M3 12c0-4 3-7 7-7h2l3 3 6-2-4 5 4 4-7 1-1 4-5-3c-3-1-5-2-5-5z" />
      <circle cx="17" cy="9" r="0.7" fill="currentColor" />
    </g>
  )),
  stroke('tiger', 'Tiger', () => (
    <g {...STROKE}>
      <circle cx="12" cy="13" r="6" />
      <path d="M8 4l2 3M16 4l-2 3M6 8l1 3M18 8l-1 3" />
      <circle cx="10" cy="12" r="0.5" fill="currentColor" />
      <circle cx="14" cy="12" r="0.5" fill="currentColor" />
      <path d="M11 15c.5.5 1 .5 2 0" />
    </g>
  )),
  stroke('bull', 'Bull', () => (
    <g {...STROKE}>
      <path d="M5 8c0-3 2-4 5-4M19 8c0-3-2-4-5-4" />
      <ellipse cx="12" cy="13" rx="6" ry="5" />
      <circle cx="10" cy="13" r="0.5" fill="currentColor" />
      <circle cx="14" cy="13" r="0.5" fill="currentColor" />
      <path d="M11 17h2" />
    </g>
  )),

  // ── Naturaleza ────────────────────────────────────────────────
  stroke('sun', 'Sun', () => (
    <g {...STROKE}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
    </g>
  )),
  stroke('moon', 'Moon', () => (
    <path {...STROKE} d="M20 14a8 8 0 1 1-9-11 7 7 0 0 0 9 11z" />
  )),
  stroke('lightning-bolt', 'Lightning', () => (
    <g {...STROKE}>
      <path d="M14 2 5 14h6l-2 8 10-12h-6l1-8z" />
      <path d="M3 7l3-2M3 12l4-1M3 17l3-1" />
    </g>
  )),
  stroke('wave', 'Wave', () => (
    <path
      {...STROKE}
      d="M2 9c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 19c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"
    />
  )),
  stroke('pine', 'Pine tree', () => (
    <g {...STROKE}>
      <path d="M12 2 7 9h3l-4 5h3l-4 5h14l-4-5h3l-4-5h3z" />
      <path d="M12 19v3" />
    </g>
  )),

  // ── Símbolos / objetos ────────────────────────────────────────
  stroke('trophy', 'Trophy', () => (
    <g {...STROKE}>
      <path d="M7 4h10v6a5 5 0 0 1-10 0V4z" />
      <path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />
      <path d="M10 15v3h4v-3M8 21h8" />
    </g>
  )),
  stroke('key', 'Key', () => (
    <g {...STROKE}>
      <circle cx="7" cy="12" r="4" />
      <path d="M11 12h10M19 10v4M16 12v3" />
    </g>
  )),
  stroke('shield', 'Shield', () => (
    <path
      {...STROKE}
      d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3z"
    />
  )),
  stroke('lightbulb', 'Lightbulb', () => (
    <g {...STROKE}>
      <path d="M9 17h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10c1 1 1 2 1 4h6c0-2 0-3 1-4a6 6 0 0 0-4-10z" />
    </g>
  )),
  stroke('rocket', 'Rocket', () => (
    <g {...STROKE}>
      <path d="M12 2c4 4 6 8 6 12l-3 3h-6l-3-3c0-4 2-8 6-12z" />
      <circle cx="12" cy="11" r="2" />
      <path d="M9 17l-3 3 1 2 3-2M15 17l3 3-1 2-3-2" />
    </g>
  )),

  // ── Deportes ──────────────────────────────────────────────────
  stroke('baseball', 'Baseball', () => (
    <g {...STROKE}>
      <circle cx="12" cy="12" r="9" />
      <path d="M5 7c2 2 2 8 0 10M19 7c-2 2-2 8 0 10" />
    </g>
  )),
  stroke('boxing-glove', 'Boxing glove', () => (
    <g {...STROKE}>
      <path d="M5 9c0-3 3-5 6-5h2c3 0 5 2 5 5v6c0 2-2 3-4 3h-5c-2 0-4-1-4-3v-2c-1 0-2-1-2-2s1-2 2-2V9z" />
      <path d="M5 17h12" />
    </g>
  )),
  stroke('basketball', 'Basketball', () => (
    <g {...STROKE}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3v18M6 6c2 4 2 8 0 12M18 6c-2 4-2 8 0 12" />
    </g>
  )),
  stroke('tennis', 'Tennis', () => (
    <g {...STROKE}>
      <ellipse cx="9" cy="9" rx="5" ry="5" />
      <path d="M5 5l8 8M5 9h8M9 5v8" />
      <path d="M13 13l6 6" />
      <path d="M19 19l2-2" />
    </g>
  )),
  stroke('dumbbell', 'Dumbbell', () => (
    <g {...STROKE}>
      <rect x="2" y="9" width="3" height="6" rx="1" />
      <rect x="19" y="9" width="3" height="6" rx="1" />
      <rect x="5" y="10.5" width="2" height="3" />
      <rect x="17" y="10.5" width="2" height="3" />
      <path d="M7 12h10" />
    </g>
  )),

  // ── Música ────────────────────────────────────────────────────
  stroke('guitar', 'Guitar', () => (
    <g {...STROKE}>
      <path d="M14 4l6 6-4 4-2-2-3 3a4 4 0 1 1-3-3l3-3-2-2 4-4z" />
      <circle cx="9" cy="15" r="1.5" />
    </g>
  )),
  stroke('headphones', 'Headphones', () => (
    <g {...STROKE}>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <rect x="2" y="14" width="5" height="7" rx="1.5" />
      <rect x="17" y="14" width="5" height="7" rx="1.5" />
    </g>
  )),
  stroke('vinyl', 'Vinyl', () => (
    <g {...STROKE}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </g>
  )),
  stroke('microphone', 'Microphone', () => (
    <g {...STROKE}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 12a7 7 0 0 0 14 0M12 19v3M9 22h6" />
    </g>
  )),
  stroke('piano', 'Piano', () => (
    <g {...STROKE}>
      <rect x="3" y="7" width="18" height="10" rx="1" />
      <path d="M7 7v6M11 7v6M15 7v6M19 7v6" />
      <rect x="5.5" y="7" width="2" height="4" fill="currentColor" />
      <rect x="9.5" y="7" width="2" height="4" fill="currentColor" />
      <rect x="13.5" y="7" width="2" height="4" fill="currentColor" />
      <rect x="17.5" y="7" width="2" height="4" fill="currentColor" />
    </g>
  )),

  // ── Cultura DR / latina ───────────────────────────────────────
  stroke('flag-do', 'Bandera DR', () => (
    <g {...STROKE}>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M3 12h18M12 5v14" />
      <rect x="10.5" y="10.5" width="3" height="3" />
    </g>
  )),
  stroke('rooster', 'Gallo', () => (
    <g {...STROKE}>
      <path d="M9 10c0-4 3-6 6-6 0 2-1 4-3 5 1 1 3 1 4 3 1 2 0 5-2 6h-2c0 2-1 4-3 4s-3-1-3-3 1-3 2-3v-3c-2 0-3-1-3-3z" />
      <circle cx="13" cy="9" r="0.5" fill="currentColor" />
      <path d="M15 11l3-1" />
    </g>
  )),
  stroke('palm', 'Palma', () => (
    <g {...STROKE}>
      <path d="M12 8c-3-4-7-4-9-2 2 0 3 1 4 2-2 0-4 1-5 3 2-1 4-1 5 0-2 1-3 3-3 5 2-2 4-3 6-2-1 2-2 4-1 6 1-2 3-3 5-3M12 8v14" />
    </g>
  )),
  stroke('dominoes', 'Dominó', () => (
    <g {...STROKE}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M4 12h16" />
      <circle cx="9" cy="7.5" r="0.7" fill="currentColor" />
      <circle cx="15" cy="7.5" r="0.7" fill="currentColor" />
      <circle cx="9" cy="16.5" r="0.7" fill="currentColor" />
      <circle cx="12" cy="16.5" r="0.7" fill="currentColor" />
      <circle cx="15" cy="16.5" r="0.7" fill="currentColor" />
    </g>
  )),
  stroke('maracas', 'Maracas', () => (
    <g {...STROKE}>
      <ellipse cx="8" cy="8" rx="3" ry="4" />
      <path d="M8 12l-2 6-2 2" />
      <ellipse cx="16" cy="8" rx="3" ry="4" />
      <path d="M16 12l2 6 2 2" />
    </g>
  )),
  stroke('cigar', 'Tabaco', () => (
    <g {...STROKE}>
      <path d="M3 13h15l3-1v4l-3-1H3z" />
      <path d="M6 13v3" />
      <path d="M19 4c1 1-1 2 0 3M22 6c1 1-1 2 0 3" />
    </g>
  )),
  stroke('plantain', 'Plátano', () => (
    <g {...STROKE}>
      <path d="M4 20c-1-8 5-15 13-15 1 2 1 4-1 5-2 8-7 12-12 10z" />
      <path d="M16 5l1-2" />
    </g>
  )),
  stroke('tambora', 'Tambora', () => (
    <g {...STROKE}>
      <ellipse cx="12" cy="6" rx="7" ry="2" />
      <ellipse cx="12" cy="18" rx="7" ry="2" />
      <path d="M5 6v12M19 6v12" />
      <path d="M9 6v12M15 6v12" />
    </g>
  )),
  stroke('coconut', 'Coco', () => (
    <g {...STROKE}>
      <circle cx="12" cy="13" r="8" />
      <circle cx="9" cy="11" r="0.8" fill="currentColor" />
      <circle cx="15" cy="11" r="0.8" fill="currentColor" />
      <ellipse cx="12" cy="15" rx="1.2" ry="0.8" fill="currentColor" />
      <path d="M10 3l2 3 2-3" />
    </g>
  )),

  // No 'rich' entries yet — see note on the AvatarId union above.
  // When real designs are ready, append them here as:
  //   rich('id', 'Label', () => <RichFrame>...</RichFrame>),
]

// ──────────────────────────────────────────────────────────────
// RichFrame — shared chrome for the "magnet" family. Provides the
// white circle background + thin black border, then renders the
// icon paths inside. Children are black-filled by default. Kept
// even though no rich icons ship today so future additions can
// drop straight in.
// ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
 * True for any string the Avatar component knows how to render — a
 * built-in id OR a URL pointing at a custom shop_avatars asset.
 * Used by the normalize() helpers in pages so URL avatars don't get
 * silently dropped on the floor by old isAvatarId-only checks.
 */
export function isRenderableAvatar(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (isAvatarId(value)) return true
  if (value.startsWith('/') || value.startsWith('http')) return true
  return false
}

/**
 * Catalogue entry shared across the picker + render paths. Each shop
 * fetches its own list and passes it down to any Avatar / AvatarPicker
 * that needs to display custom icons.
 */
export type ShopAvatar = {
  id: string
  label: string
  image_url: string
  sort_order: number
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
  // Widened from AvatarId so we can also accept arbitrary URLs
  // pointing at per-shop custom images (shop_avatars.image_url).
  avatar?: string | null | undefined
  name?: string
  size?: number
  className?: string
}) {
  // URL-style avatar (custom shop asset) — render as <img>. Same
  // circular wrapper as the built-in path so callers don't need to
  // know which family was selected.
  //
  // The img sits inside the wrapper at ~84% size so the source
  // image's own circle (which goes nearly edge-to-edge of its
  // 172x188 cell) gets visible margin and isn't clipped by the
  // wrapper's rounded-full mask. object-contain on top guarantees
  // the full source remains visible without cropping.
  if (typeof avatar === 'string' && (avatar.startsWith('/') || avatar.startsWith('http'))) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full overflow-hidden flex-shrink-0 bg-white ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatar}
          alt=""
          width={Math.round(size * 0.84)}
          height={Math.round(size * 0.84)}
          className="object-contain"
          style={{ width: '84%', height: '84%' }}
        />
      </span>
    )
  }

  const def = avatar && isAvatarId(avatar) ? AVATARS.find(a => a.id === avatar) : null

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
 *
 * Accepts an optional `shopAvatars` list — when present, the shop's
 * custom magnet-style icons are shown ABOVE the generic stroke pool
 * in a separate section. Selecting one calls onChange with the image
 * URL (not the row id), so the barber.avatar column can be read by
 * the Avatar component without a join.
 */
export function AvatarPicker({
  value,
  onChange,
  size = 44,
  allowClear = true,
  shopAvatars,
}: {
  // Widened from AvatarId to string so URL-based shop avatars round-trip.
  value: string | null
  onChange: (next: string | null) => void
  size?: number
  allowClear?: boolean
  shopAvatars?: ShopAvatar[]
}) {
  const hasShopAvatars = shopAvatars && shopAvatars.length > 0
  const sortedShopAvatars = hasShopAvatars
    ? [...shopAvatars].sort((a, b) => a.sort_order - b.sort_order)
    : []

  return (
    <div className="flex flex-col gap-5">
      {/* Section 1 — shop-specific avatars, only when the shop has any. */}
      {hasShopAvatars && (
        <section>
          <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-2">
            Íconos del shop
          </p>
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${size + 12}px, 1fr))`,
            }}
          >
            {sortedShopAvatars.map(av => {
              const selected = value === av.image_url
              return (
                <button
                  key={av.id}
                  type="button"
                  onClick={() => onChange(av.image_url)}
                  aria-label={av.label}
                  aria-pressed={selected}
                  title={av.label}
                  className={`relative flex items-center justify-center rounded-full overflow-hidden transition-transform active:scale-95 bg-white ${
                    selected ? 'ring-2 ring-white ring-offset-2 ring-offset-nxtup-bg' : ''
                  }`}
                  style={{ width: size, height: size }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={av.image_url}
                    alt=""
                    width={Math.round(size * 0.84)}
                    height={Math.round(size * 0.84)}
                    // Same trick as Avatar: image sits inside the
                    // circular wrapper at ~84% so the source PNG's
                    // own circle doesn't get clipped by rounded-full.
                    className="object-contain"
                    style={{ width: '84%', height: '84%' }}
                  />
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Section 2 — generic stroke pool. Always shown. The "no avatar"
          clear button lives at the front of this section so it's still
          reachable even when a shop has its own custom icons. */}
      <section>
        {hasShopAvatars && (
          <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-2">
            Genéricos
          </p>
        )}
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
                <path {...STROKE} d="M5 5l14 14M19 5 5 19" />
              </svg>
            </button>
          )}
          {AVATARS.map(av => {
            const selected = value === av.id
            // Rich avatars (if any) are self-contained — see Avatar
            // for the same branching. Stroke avatars use the legacy
            // dark-disc treatment.
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
      </section>
    </div>
  )
}
