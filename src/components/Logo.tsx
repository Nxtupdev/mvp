type Props = {
  className?: string
  variant?: 'wordmark' | 'mark'
  /**
   * Surface tone the logo sits on.
   * - 'light' → original art (black letters, brand colors). Use on light surfaces.
   * - 'dark'  → silhouette to white (current art has black letters; filter is interim
   *            until a proper white-letter variant is exported).
   */
  tone?: 'light' | 'dark'
}

export default function Logo({
  className,
  variant = 'wordmark',
  tone = 'light',
}: Props) {
  const src = variant === 'mark' ? '/brand/isotipo.png' : '/brand/logo.png'
  // brightness(0) → solid black, invert(1) → solid white.
  // Loses red/blue accents; replace when /brand/logo-white.png exists.
  const darkFilter = tone === 'dark' ? '[filter:brightness(0)_invert(1)]' : ''
  return (
    // Plain <img> on purpose: small PNG, no LCP concern, simplest sizing via className.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="NXTUP"
      className={[className, darkFilter].filter(Boolean).join(' ')}
    />
  )
}
