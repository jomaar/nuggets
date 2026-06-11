import {
  Cross, Briefcase, HeartPulse, BookOpen, Tag,
  Brain, Lightbulb, Atom, Microscope, Code2, Cpu, Globe,
  Scale, Landmark, GraduationCap, Palette, Music, Dumbbell,
  Leaf, Sparkles, Star, Heart, Coins, Rocket,
  type LucideIcon,
} from 'lucide-react'

/**
 * The set of icons a domain may use. `Domain.icon` (DB) stores one of these
 * keys; this registry maps the key back to its Lucide component. It is the
 * single source of truth for both rendering here and the icon picker in the
 * admin UI (Session B). Add a new icon by adding one entry.
 */
export const DOMAIN_ICON_REGISTRY: Record<string, LucideIcon> = {
  Cross, Briefcase, HeartPulse, BookOpen, Tag,
  Brain, Lightbulb, Atom, Microscope, Code2, Cpu, Globe,
  Scale, Landmark, GraduationCap, Palette, Music, Dumbbell,
  Leaf, Sparkles, Star, Heart, Coins, Rocket,
}

/**
 * Legacy slug → icon map. Used only as a fallback when a domain has no `icon`
 * value in the DB yet, so existing domains keep their look until migrated.
 */
const LEGACY_SLUG_ICONS: Record<string, LucideIcon> = {
  faith:    Cross,       // Glaube & Bibel
  business: Briefcase,   // Business & Technik
  health:   HeartPulse,  // Gesundheit & Fitness
  books:    BookOpen,    // Bücher & Ideen
}

/**
 * Legacy hand-picked colours per slug, plus a palette used to derive a stable
 * colour for unknown slugs. Both are fallbacks for when a domain has no `color`
 * value in the DB yet.
 */
const LEGACY_SLUG_COLORS: Record<string, string> = {
  business: '#2563EB', // blue
  books:    '#7C3AED', // violet
  health:   '#DC2626', // red
  faith:    '#CA8A04', // gold
}
const COLOR_PALETTE = [
  '#2563EB', '#7C3AED', '#DC2626', '#CA8A04',
  '#0891B2', '#16A34A', '#DB2777', '#EA580C',
]

/**
 * Fallback colour for a domain slug (hand-picked, else deterministic from the
 * palette). Used when the DB has no `color` for the domain.
 */
export function domainColor(slug: string): string {
  if (LEGACY_SLUG_COLORS[slug]) return LEGACY_SLUG_COLORS[slug]
  let hash = 0
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0
  return COLOR_PALETTE[hash % COLOR_PALETTE.length]
}

/**
 * Resolves the colour to render for a domain: the DB `color` if present,
 * otherwise the legacy slug-based fallback.
 */
export function resolveDomainColor(slug: string, color?: string | null): string {
  return color || domainColor(slug)
}

interface DomainIconProps {
  /** Domain slug — used for legacy fallbacks when `icon`/`color` are absent. */
  slug: string
  /** Lucide icon key from the DB (`Domain.icon`); preferred over the slug map. */
  icon?: string | null
  /** Accent colour from the DB (`Domain.color`); preferred over the palette. */
  color?: string | null
  size?: number
  className?: string
  /** Render in the domain's own colour instead of inheriting the text colour. */
  colored?: boolean
}

/**
 * Renders the Lucide icon for a domain. Icon and colour come from the DB
 * (`icon`/`color` props); when those are missing it falls back to the legacy
 * slug-based maps so older domains still render. By default the icon inherits
 * the surrounding text colour (currentColor); with `colored` it uses the
 * domain's own colour.
 */
export default function DomainIcon({
  slug, icon, color, size = 14, className, colored = false,
}: DomainIconProps) {
  const Icon = (icon && DOMAIN_ICON_REGISTRY[icon]) || LEGACY_SLUG_ICONS[slug] || Tag
  return (
    <Icon
      size={size}
      strokeWidth={1.75}
      className={className}
      color={colored ? resolveDomainColor(slug, color) : undefined}
    />
  )
}
