type Props = {
  url: string | null | undefined
  name: string
  /** Pixel size of the (square) bounding box. The logo is rendered
   *  centered inside via object-contain so its aspect ratio is
   *  preserved regardless of whether the source asset is square,
   *  wide, or tall. Defaults to 48px. */
  size?: number
  className?: string
}

/**
 * Renders the shop's uploaded logo inside a fixed square box.
 *
 * Why square + object-contain: gives every surface (dashboard
 * header, kiosk header, TV display, etc.) a predictable footprint
 * regardless of the logo asset's aspect ratio. Square circular
 * marks like Fade Factory's fill the box; wide text logos sit
 * centered with letterboxing. The alternative — `width: auto`
 * with only height fixed — caused logos to wildly differ in
 * horizontal footprint and threw off header alignment.
 *
 * If the shop hasn't uploaded a logo yet, this renders nothing.
 * Callers handle the fallback (typically: just show the shop name).
 */
export default function ShopLogo({ url, name, size = 48, className = '' }: Props) {
  if (!url) return null
  return (
    // Plain <img>: small PNG/SVG, no LCP concern, simplest sizing.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={`${name} logo`}
      style={{ height: size, width: size }}
      className={`object-contain ${className}`}
    />
  )
}
