import type { MetadataRoute } from 'next'

/**
 * Keep the whole app out of search indexes.
 *
 * Read access is deliberately open (see CLAUDE.md) — anyone with the URL may
 * read a nugget. Being *indexed* is a different thing though: it turns "you can
 * reach this if you know where it is" into "you can stumble over this while
 * searching for a Greek lemma". The notes are personal working material, so the
 * first is intended and the second is not.
 *
 * This is the crawler-facing half; nginx additionally sends `X-Robots-Tag:
 * noindex, nofollow` so a crawler that ignores robots.txt still gets told, and
 * so the rule survives even if this route is ever removed.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  }
}
