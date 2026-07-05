import type { Metadata, Viewport } from 'next'
import { DM_Sans } from 'next/font/google'
import BottomNav from '@/components/BottomNav'
import { OwnerProvider } from '@/components/OwnerContext'
import { isOwner } from '@/lib/auth'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Nuggets',
  description: 'Deine Wissens-Nuggets – immer zur rechten Zeit',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Nuggets',
  },
}

export const viewport: Viewport = {
  themeColor: '#FFFFFF',
  width: 'device-width',
  initialScale: 1,
  // Lock pinch-zoom: accidental zoom gestures kept breaking the layout.
  // Font size is adjusted via iOS system text-size settings instead.
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

const buildVersion = process.env.NEXT_PUBLIC_BUILD_VERSION ?? 'dev'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Owner status is read once here from the session cookie and shared via context,
  // so individual pages no longer each fetch /api/auth/me on mount.
  const owner = await isOwner()
  return (
    <html lang="de" className={dmSans.variable}>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* CSS Custom Highlight API rules for in-nugget search. Kept inline
            (not in globals.css) because the Tailwind v4 / Lightning CSS build
            optimizer rejects the ::highlight() functional pseudo-element. The
            referenced CSS vars are defined globally on :root in globals.css. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
::highlight(search-all) { background: var(--hl-yellow); color: var(--ink); }
::highlight(search-current) { background: var(--accent); color: #fff; }
::highlight(annotation) { background: color-mix(in srgb, var(--accent) 12%, transparent); text-decoration: underline dotted var(--accent); text-decoration-thickness: 2px; text-underline-offset: 0.2em; }
::highlight(annotation-active) { background: color-mix(in srgb, var(--accent) 26%, transparent); }
`,
          }}
        />
        {/* Apply the saved nugget reading font size before first paint, so the
            text never flashes at the default size first. Mirrors the key/clamp
            in lib/nuggetFontSize.ts. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=parseInt(localStorage.getItem('nugget-font-size'),10);if(s>=13&&s<=24)document.documentElement.style.setProperty('--nugget-font-size',s+'px')}catch(e){}`,
          }}
        />
      </head>
      <body>
        <OwnerProvider initialIsOwner={owner}>
          <BottomNav />
          <div className="max-w-2xl mx-auto px-4 pb-24">
            {children}
            <p className="no-print text-center pb-1" style={{ fontSize: '10px', color: 'var(--muted)' }}>
              {buildVersion}
            </p>
            <p className="no-print text-center pb-4 flex justify-center gap-4" style={{ fontSize: '10px' }}>
              <a href="/impressum" style={{ color: 'var(--muted)' }}>Impressum</a>
              <a href="/datenschutz" style={{ color: 'var(--muted)' }}>Datenschutz</a>
            </p>
          </div>
        </OwnerProvider>
      </body>
    </html>
  )
}
