type Props = {
  url: string | null | undefined
  name: string
  /** Pixel height of the logo. Width auto. */
  size?: number
  className?: string
}

/**
 * Renders the shop's uploaded logo. If no logo, renders nothing — callers
 * should handle the fallback (typically: just show the shop name).
 */
export default function ShopLogo({ url, name, size = 48, className = '' }: Props) {
  if (!url) return null
  return (
    // Plain <img>: small PNG/SVG, no LCP concern, simplest sizing.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={`${name} logo`}
      style={{ height: size, width: 'auto' }}
      className={`object-contain ${className}`}
    />
  )
}
