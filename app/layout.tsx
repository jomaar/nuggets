import type { Metadata, Viewport } from 'next'
import { DM_Sans } from 'next/font/google'
import BottomNav from '@/components/BottomNav'
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
`,
          }}
        />
      </head>
      <body>
        <BottomNav />
        <div className="max-w-2xl mx-auto px-4 pb-24">
          {children}
          <p className="text-center pb-1" style={{ fontSize: '10px', color: 'var(--muted)' }}>
            {buildVersion}
          </p>
          <p className="text-center pb-4 flex justify-center gap-4" style={{ fontSize: '10px' }}>
            <a href="/impressum" style={{ color: 'var(--muted)' }}>Impressum</a>
            <a href="/datenschutz" style={{ color: 'var(--muted)' }}>Datenschutz</a>
          </p>
        </div>
      </body>
    </html>
  )
}
