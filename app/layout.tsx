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
  viewportFit: 'cover',
}

const buildVersion = process.env.NEXT_PUBLIC_BUILD_VERSION ?? 'dev'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={dmSans.variable}>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
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
