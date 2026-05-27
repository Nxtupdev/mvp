# NXTUP Check-In Kiosk — Design Specification

**Status:** ready for implementation
**Created:** 2026-05-25
**Designed for:** tablet kiosk (1024×768 / 1366×1024 landscape, 768×1024 portrait) + customer phone via QR (375×812+)
**Stack:** Next.js 16 (App Router) + TypeScript + Tailwind + shadcn/ui + Framer Motion

---

## Style Direction

**Dark Mode Glass + Ultra-Minimal Typography Hierarchy** — a hybrid that leverages NXTUP's existing dark aesthetic, layers premium glassmorphism cards over a subtle aurora-tinted background, and lets massive Geist typography do the heavy lifting (Linear/Vercel-grade). We use Liquid Glass touches only at hero moments (logo reveal, success celebration) where moderate-perf cost is justified. Everything else stays OLED-friendly and ultra-fast — no decorative animations on the form fields, no parallax, no scroll-jacking. The result reads as "Apple Vision Pro meets Linear" without sacrificing the 60fps the tablet needs to feel responsive under finger contact.

### Why not the auto-recommended "Liquid Glass" alone

Liquid Glass scored highest in the auto-recommendation but has ⚠ moderate-poor performance + ⚠ text contrast issues. Kiosks need 100% reliability — a sluggish animation on a $200 tablet kills the premium feel faster than no animation. We adopt its hero accents (logo reveal, success burst) but build the everyday UI on Dark Mode (⚡ excellent perf, ✓ WCAG AAA) + Glassmorphism (⚠ good perf — acceptable).

---

## Color Palette

### Base (always available)

| Token | Hex | Usage |
|---|---|---|
| `--bg-base` | `#0A0A0B` | Page background — near-black, not pure |
| `--bg-elevated` | `#18181B` | Cards, surfaces (zinc-900) |
| `--bg-glass` | `rgba(255, 255, 255, 0.04)` | Glassmorphism surface — with `backdrop-blur-xl` |
| `--bg-glass-strong` | `rgba(255, 255, 255, 0.08)` | Glassmorphism hover state |
| `--border-subtle` | `rgba(255, 255, 255, 0.08)` | Default borders |
| `--border-strong` | `rgba(255, 255, 255, 0.16)` | Focus borders, important separators |
| `--text-primary` | `#FAFAFA` | Headings, body text |
| `--text-secondary` | `#A1A1AA` | Subtitles, helper text |
| `--text-muted` | `#71717A` | Disclaimers, hints |
| `--accent-emerald` | `#34D399` | Primary CTAs, success states (matches NXTUP green) |
| `--accent-emerald-hover` | `#10B981` | CTA hover |
| `--accent-emerald-glow` | `rgba(52, 211, 153, 0.4)` | Box shadows for primary CTA |

### Aurora gradient (hero backgrounds — splash & success only)

```css
background:
  radial-gradient(ellipse at 30% 20%, rgba(52, 211, 153, 0.15), transparent 50%),
  radial-gradient(ellipse at 70% 80%, rgba(20, 184, 166, 0.12), transparent 50%),
  radial-gradient(ellipse at 50% 50%, rgba(99, 102, 241, 0.08), transparent 60%),
  #0A0A0B;
```

Subtle, doesn't compete with content. The emerald and teal tints reinforce NXTUP brand without screaming.

### Semantic colors (carry over from existing NXTUP)

| State | Color |
|---|---|
| Active / success | `#34D399` |
| Busy / error | `#F87171` (lightened from existing red for dark theme) |
| Break / warning | `#FBBF24` (lightened amber) |
| Info | `#60A5FA` |

---

## Typography

**Pairing: Geist Sans + Geist Mono** (Vercel's open-source font, available via Google Fonts as `Geist`).

Rationale: Matches the "Linear / Vercel / Stripe" reference Frank gave. Modern geometric sans-serif with excellent readability at large sizes. Has variable weights (100-900) so we can use ultra-light for elegance and ultra-bold for impact in the same family.

### Imports

```tsx
// src/app/layout.tsx
import { Geist, Geist_Mono } from 'next/font/google'

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })
```

```ts
// tailwind.config.ts
fontFamily: {
  sans: ['var(--font-geist-sans)', 'Inter', 'system-ui', 'sans-serif'],
  mono: ['var(--font-geist-mono)', 'monospace'],
}
```

### Type scale per screen (tablet sizes — phone uses 0.75× scale)

| Element | Tablet | Phone | Weight | Tracking |
|---|---|---|---|---|
| Display (splash hero) | `text-7xl` (72px) | `text-5xl` (48px) | `font-light` (300) | `-0.04em` |
| H1 (welcome) | `text-5xl` (48px) | `text-4xl` (36px) | `font-bold` (700) | `-0.02em` |
| H2 (section header) | `text-3xl` (30px) | `text-2xl` (24px) | `font-semibold` (600) | `-0.015em` |
| Body large (instructions) | `text-xl` (20px) | `text-lg` (18px) | `font-normal` (400) | normal |
| Body | `text-base` (16px) | `text-sm` (14px) | `font-normal` (400) | normal |
| Button label | `text-lg` (18px) | `text-base` (16px) | `font-medium` (500) | `0.01em` |
| Numeric display (queue #, ETA) | `text-9xl` (128px) | `text-7xl` (72px) | `font-bold` (700) | `-0.05em` `font-mono` |
| Persistent header | `text-sm` (14px) | `text-xs` (12px) | `font-medium` (500) | `0.05em` uppercase |

---

## Layout Specs — Screen by Screen

### Persistent across all screens

```
┌──────────────────────────────────────────────────────────────────┐
│  ╔═══════════════════════════════════════════════════════════╗  │
│  ║ [logo] FADE FACTORY                3 esperando · 6-10 min ║  │  ← Persistent header
│  ╚═══════════════════════════════════════════════════════════╝  │
│                                                                  │
│                                                                  │
│                    [SCREEN CONTENT]                              │
│                                                                  │
│                                                                  │
│                                                                  │
│                                                                  │
│                                                                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Persistent header specs:**
- Height: `h-16` (64px)
- Padding horizontal: `px-8` (32px)
- Background: `bg-bg-elevated/60 backdrop-blur-xl`
- Border-bottom: `border-b border-border-subtle`
- Left: shop logo (h-8) + shop name (text-sm font-semibold)
- Right: queue stats (text-sm text-text-secondary)
- Stats update via Realtime subscription
- No animation on stats updates (they change frequently, would be distracting)

---

### Screen 1 — Splash + Language

```
┌──────────────────────────────────────────────────────────────────┐
│  [HEADER]                                                        │
│                                                                  │
│                                                                  │
│                                                                  │
│                       ╔═══════════════╗                          │
│                       ║   SHOP LOGO   ║   ← animated reveal      │
│                       ║   (large, 120px) ║                       │
│                       ╚═══════════════╝                          │
│                                                                  │
│                                                                  │
│                       Bienvenido                                 │
│                       Welcome                                    │
│                                                                  │
│                       (text-7xl, font-light, gradient text)      │
│                                                                  │
│                                                                  │
│                                                                  │
│         ┌────────────────────┐  ┌────────────────────┐           │
│         │                    │  │                    │           │
│         │     Español        │  │     English        │           │
│         │                    │  │                    │           │
│         └────────────────────┘  └────────────────────┘           │
│                                                                  │
│         (h-32, glass cards, hover lift + emerald border)         │
│                                                                  │
│                                                                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Layout details:**
- Container: `flex flex-col items-center justify-center min-h-screen`
- Logo: centered, max 120×120px, animated reveal on mount (see animations)
- Welcome text: dual-language stacked. "Bienvenido" first (Spanish primary for DR/USA market), "Welcome" below with reduced opacity. Both gradient-text:
  ```css
  background: linear-gradient(135deg, #FAFAFA 0%, rgba(52, 211, 153, 0.8) 100%);
  background-clip: text;
  color: transparent;
  ```
- Language buttons: two glass cards side-by-side
  - Width: `w-80` (320px) each
  - Height: `h-32` (128px)
  - Background: `bg-glass backdrop-blur-xl border border-border-subtle`
  - Hover/focus: `bg-glass-strong border-accent-emerald shadow-[0_0_40px_var(--accent-emerald-glow)]` + slight `scale-[1.02]`
  - Active: same as hover + brief `scale-[0.98]` on tap
  - Text: `text-2xl font-medium`
  - Touch target: well above 56px minimum

### Screen 2 — Phone Number Entry

```
┌──────────────────────────────────────────────────────────────────┐
│  [HEADER]                                                        │
│                                                                  │
│   ← Volver                                Paso 1 de 3            │
│                                           ▰▰▱▱ (progress dots)   │
│                                                                  │
│                                                                  │
│                                                                  │
│                Tu número de teléfono                             │
│                (text-5xl, font-bold, gradient on first word)     │
│                                                                  │
│                Te buscaremos en nuestro sistema                  │
│                (text-xl, text-text-secondary)                    │
│                                                                  │
│                                                                  │
│              ┌────────────────────────────────┐                  │
│              │ 🇺🇸 +1   (___) ___-____         │  ← Tap to focus  │
│              └────────────────────────────────┘                  │
│                                                                  │
│              (h-20, large input, mono-spaced number)             │
│                                                                  │
│                                                                  │
│              ┌─────┐ ┌─────┐ ┌─────┐                             │
│              │  1  │ │  2  │ │  3  │                             │
│              └─────┘ └─────┘ └─────┘                             │
│              ┌─────┐ ┌─────┐ ┌─────┐                             │
│              │  4  │ │  5  │ │  6  │   ← numeric keypad on       │
│              └─────┘ └─────┘ └─────┘     KIOSK MODE only         │
│              ┌─────┐ ┌─────┐ ┌─────┐                             │
│              │  7  │ │  8  │ │  9  │   (h-20 w-20 each, gap-4)   │
│              └─────┘ └─────┘ └─────┘                             │
│              ┌─────┐ ┌─────┐ ┌─────┐                             │
│              │  ✕  │ │  0  │ │  ←  │                             │
│              └─────┘ └─────┘ └─────┘                             │
│                                                                  │
│                                                                  │
│              ┌────────────────────────────────┐                  │
│              │        Continuar               │  ← disabled      │
│              └────────────────────────────────┘     until valid  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Layout details:**
- Back button top-left, progress indicator top-right
- Hero question + helper text
- Phone input: large, centered, monospace tabular-nums
- Numeric keypad: 3×4 grid, only on kiosk mode (detect via `?mode=kiosk` or screen width). On customer phone, hide and let system keyboard handle.
- Continue button: full-width glass card, disabled state has reduced opacity + cursor-not-allowed, enabled has emerald glow
- Format validation: real-time formatting `(XXX) XXX-XXXX` after country code

### Screen 3a — New Customer (combined form)

```
┌──────────────────────────────────────────────────────────────────┐
│  [HEADER]                                                        │
│                                                                  │
│   ← Volver                                Paso 2 de 3            │
│                                           ▰▰▰▱ (progress dots)   │
│                                                                  │
│                                                                  │
│                Cuéntanos un poco                                 │
│                                                                  │
│                                                                  │
│                ┌────────────────┐ ┌────────────────┐             │
│                │ Nombre         │ │ Apellido       │             │
│                │ [______________]│ │ [______________]│             │
│                └────────────────┘ └────────────────┘             │
│                                                                  │
│                                                                  │
│                ¿Qué servicio?                                    │
│                                                                  │
│                ┌─────────┐ ┌─────────┐ ┌─────────┐               │
│                │ Haircut │ │ Combo   │ │ Beard   │  ← service    │
│                │ 30 min  │ │ 60 min  │ │ 15 min  │     cards     │
│                └─────────┘ └─────────┘ └─────────┘               │
│                                                                  │
│                                                                  │
│                ¿Cómo nos conociste?                              │
│                                                                  │
│                ┌────────┐ ┌────────┐ ┌────────┐                  │
│                │ Walk-by│ │ Google │ │  IG    │  ← 6 icon        │
│                └────────┘ └────────┘ └────────┘     buttons      │
│                ┌────────┐ ┌────────┐ ┌────────┐                  │
│                │ TikTok │ │ Friend │ │ Other  │                  │
│                └────────┘ └────────┘ └────────┘                  │
│                                                                  │
│                Skip →  (text-sm text-text-muted, underline)      │
│                                                                  │
│              ┌────────────────────────────────┐                  │
│              │        Continuar               │                  │
│              └────────────────────────────────┘                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Layout details:**
- 3 sections vertically stacked with `gap-12` between
- Each section has an H2 + content
- Section reveal: as user fills/selects in one section, the next one gets a subtle fade-up animation (not block — they're all visible from start, just the *highlight* shifts)
- Name: two text inputs side-by-side, `h-16` each
- Service cards: horizontal `grid-cols-3 gap-4`, each card `h-32`, shows name (text-xl) + duration (text-sm text-muted). Selected state: emerald border + glow
- Source: `grid-cols-3 gap-3`, smaller cards `h-20`, with icon (Lucide) + text. Selected state same emerald accent
- Skip link: below source grid, text-only, optional
- Continue button: bottom, full-width, disabled until first_name + service selected (last_name and source are optional)

### Screen 3b — Returning Customer (variant)

```
┌──────────────────────────────────────────────────────────────────┐
│  [HEADER]                                                        │
│                                                                  │
│   ← Volver                                Paso 2 de 2            │
│                                           ▰▰▱ (progress dots)    │
│                                                                  │
│                                                                  │
│                                                                  │
│                ┌─────────────────────────────────┐               │
│                │   ✨ animated badge                │              │
│                │   Visita #6 con nosotros        │               │
│                └─────────────────────────────────┘               │
│                                                                  │
│                ¡Bienvenido de vuelta, Juan!                      │
│                (text-5xl, font-bold, gradient text)              │
│                                                                  │
│                                                                  │
│                ¿Qué servicio hoy?                                │
│                                                                  │
│                ┌─────────┐ ┌─────────┐ ┌─────────┐               │
│                │ Haircut │ │ Combo   │ │ Beard   │               │
│                │ 30 min  │ │ 60 min  │ │ 15 min  │               │
│                └─────────┘ └─────────┘ └─────────┘               │
│                                                                  │
│                                                                  │
│              ┌────────────────────────────────┐                  │
│              │        Continuar               │                  │
│              └────────────────────────────────┘                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Layout details:**
- Visit count badge: glass pill at top, with sparkle icon, animated entry from above
- Personalized welcome: huge text with name interpolated, gradient on the name
- Service selection: same cards as new customer
- No source step (already captured in first visit)
- Continue when service selected

### Screen 4 — Success

```
┌──────────────────────────────────────────────────────────────────┐
│  [HEADER]                                                        │
│                                                                  │
│                                                                  │
│                                                                  │
│                         ╔═══╗                                    │
│                         ║ ✓ ║   ← animated SVG checkmark         │
│                         ╚═══╝     (emerald glow burst)           │
│                                                                  │
│                                                                  │
│                ¡Bienvenido, John!                                │
│                (text-5xl, gradient)                              │
│                                                                  │
│                                                                  │
│                Estás en la cola                                  │
│                (text-xl, text-secondary)                         │
│                                                                  │
│                                                                  │
│            ┌────────────────┐    ┌────────────────┐              │
│            │ POSICIÓN       │    │ ESPERA ESTIMADA│              │
│            │                │    │                │              │
│            │      #3        │    │   6-10 min     │              │
│            │ (text-9xl mono)│    │ (text-5xl mono)│              │
│            │                │    │                │              │
│            └────────────────┘    └────────────────┘              │
│                                                                  │
│                                                                  │
│                                                                  │
│           Relájate, te llamamos cuando esté tu barbero.          │
│           (text-lg, text-secondary)                              │
│                                                                  │
│                                                                  │
│              ┌────────────────────────────────┐                  │
│              │            Listo               │                  │
│              └────────────────────────────────┘                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Layout details:**
- Centered, generous vertical spacing
- Checkmark: SVG with `path` animation (draws itself) + emerald aurora burst behind it
- Welcome: personalized with first name, gradient text
- Two stat cards side by side: position + ETA. Massive numbers in mono font (the "wow" moment).
- Reassuring message
- Single CTA "Listo" — when tapped, returns to splash screen for next customer

---

## Animation Specifications

All animations should use Framer Motion. All durations respect `prefers-reduced-motion`.

### Page transitions (between screens)

```tsx
const screenVariants = {
  initial: { opacity: 0, y: 24, filter: 'blur(8px)' },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] }
  },
  exit: {
    opacity: 0,
    y: -24,
    filter: 'blur(8px)',
    transition: { duration: 0.3, ease: [0.7, 0, 0.84, 0] }
  }
}
```

### Hero logo reveal (splash only)

```tsx
const logoVariants = {
  initial: { opacity: 0, scale: 0.92 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      delay: 0.1
    }
  }
}
```

### Welcome text fade-in (splash)

```tsx
const welcomeVariants = {
  initial: { opacity: 0, y: 12 },
  animate: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
      delay: 0.5 + custom * 0.1  // stagger
    }
  })
}
```

### Language button entrance (splash)

```tsx
const buttonContainerVariants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.12, delayChildren: 0.9 }
  }
}

const buttonVariants = {
  initial: { opacity: 0, y: 16, scale: 0.95 },
  animate: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] }
  }
}
```

### Tap feedback (any button)

```tsx
whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
```

### Success checkmark draw

```tsx
const checkmarkVariants = {
  initial: { pathLength: 0, opacity: 0 },
  animate: {
    pathLength: 1,
    opacity: 1,
    transition: { duration: 0.6, ease: [0.65, 0, 0.35, 1], delay: 0.2 }
  }
}

// Wrap in motion.svg with motion.path
// Combined with surrounding aurora burst:
const burstVariants = {
  initial: { opacity: 0, scale: 0.5 },
  animate: {
    opacity: [0, 0.6, 0],
    scale: [0.5, 2, 3],
    transition: { duration: 1.2, ease: 'easeOut' }
  }
}
```

### Progress indicator update

```tsx
// Dots fill in left-to-right as user progresses
const dotVariants = {
  inactive: { backgroundColor: 'rgba(255,255,255,0.1)', scale: 1 },
  active: {
    backgroundColor: '#34D399',
    scale: 1.15,
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] }
  }
}
```

### Reduced motion fallback

```tsx
import { useReducedMotion } from 'framer-motion'

const shouldReduceMotion = useReducedMotion()
const variants = shouldReduceMotion ? reducedVariants : fullVariants

// reducedVariants: just opacity changes, no movement/blur
```

---

## shadcn/ui Components Used

### Direct uses (off-the-shelf)
- `Button` — language buttons, source buttons (variant: ghost + custom classes)
- `Input` — phone, name fields
- `Card` — service cards (with custom glass treatment)
- `Form` + `FormField` + `FormItem` + `FormControl` + `FormMessage` (react-hook-form + zod)

### Custom components needed

| Component | Purpose | Location |
|---|---|---|
| `<KioskHeader />` | Persistent header with shop logo + queue stats | `src/app/q/[shop_id]/_components/KioskHeader.tsx` |
| `<ScreenContainer />` | Wraps each screen with animation variants + aurora bg | `src/app/q/[shop_id]/_components/ScreenContainer.tsx` |
| `<ProgressDots />` | Step indicator (▰▰▱▱) with smooth fill | `src/app/q/[shop_id]/_components/ProgressDots.tsx` |
| `<NumericKeypad />` | Touch-optimized 3×4 keypad for kiosk mode | `src/app/q/[shop_id]/_components/NumericKeypad.tsx` |
| `<GlassCard />` | Reusable glassmorphism container | `src/components/GlassCard.tsx` |
| `<LanguagePicker />` | Two big language buttons | `src/app/q/[shop_id]/_components/LanguagePicker.tsx` |
| `<PhoneInput />` | Phone with country code + live formatting | `src/app/q/[shop_id]/_components/PhoneInput.tsx` |
| `<ServiceCardGrid />` | Grid of selectable service cards | `src/app/q/[shop_id]/_components/ServiceCardGrid.tsx` |
| `<SourcePicker />` | 6 icon buttons + Skip for referral source | `src/app/q/[shop_id]/_components/SourcePicker.tsx` |
| `<SuccessCheckmark />` | Animated SVG checkmark with aurora burst | `src/app/q/[shop_id]/_components/SuccessCheckmark.tsx` |
| `<QueueStatBlock />` | Display block for position/ETA on success screen | `src/app/q/[shop_id]/_components/QueueStatBlock.tsx` |

### Icon library

**Lucide React** (matches NXTUP existing convention). Specific icons used:

| Source | Icon |
|---|---|
| Walk-by | `MapPin` |
| Google | `Chrome` (or custom Google G if brand-accurate is needed) |
| Instagram | `Instagram` |
| TikTok | custom SVG (Lucide doesn't have it — use Simple Icons SVG inline) |
| Friend | `Users` |
| Other | `MoreHorizontal` |
| Back | `ChevronLeft` |
| Success check | custom path animation (not Lucide) |

---

## Accessibility Requirements

| Requirement | Implementation |
|---|---|
| WCAG AAA contrast | All text on `--bg-base` or `--bg-elevated` passes 7:1. Helper text passes 4.5:1. |
| Touch target ≥ 56px | All buttons `h-14` or larger. Keypad keys `h-20`. |
| Focus visible | `focus-visible:ring-2 focus-visible:ring-accent-emerald focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base` |
| Keyboard navigation | Tab order matches visual order. Enter submits, Escape goes back. |
| Form labels | All inputs have `<Label>` or `aria-label`. |
| Reduced motion | `useReducedMotion()` from Framer Motion, simplifies all entrance animations. |
| Screen reader | ARIA live regions for queue position + ETA changes. `aria-live="polite"`. |
| Language tag | `<html lang="es">` switches based on user selection — affects screen reader pronunciation. |

---

## Performance Budgets

| Metric | Target |
|---|---|
| First Contentful Paint | < 1.2s on tablet |
| Largest Contentful Paint | < 2.0s |
| Time to Interactive | < 2.5s |
| Animation FPS | 60fps sustained (use `will-change: transform, opacity` on animated elements) |
| Bundle size (route) | < 200kb gzipped |

**Performance tactics:**
- Fonts: subset to Latin only, use `next/font` with `display: swap`
- Animations: only transform + opacity (GPU-accelerated)
- Glass effects: limit backdrop-blur to max 3 simultaneous layers
- Logo: serve as optimized SVG or WebP
- Service icons: inline SVG (Lucide tree-shakes)
- Realtime subscription: only the persistent header subscribes (queue stats); rest of flow doesn't need realtime

---

## Sample Implementation

See `planning/design/samples/splash-screen.tsx` for a production-grade implementation of Screen 1 (Splash + Language). This is the proof of execution — use it as the reference quality bar for the other 3 screens.

---

## Open Questions

- [ ] Logo aspect ratio — square crop for splash, or original aspect? (Need to confirm with Fade Factory's logo asset)
- [ ] Numeric keypad on kiosk: should it support Enter key for submit, or only via the Continue button below? (UX testing decision)
- [ ] Skip behavior on source picker: if Skipped, does it default to "other" in DB or stay NULL? (Current spec: stays NULL, only captured when user picks something)
- [ ] Phone country code: hardcoded +1 (US/DR/Canada) or configurable per shop? (V1: hardcoded +1, V2: per shop settings)
