import type { Metadata, Viewport } from 'next'
import './globals.css'

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
  themeColor: '#f5f0e8',
  width: 'device-width',
  initialScale: 1,
}

const buildVersion = process.env.NEXT_PUBLIC_BUILD_VERSION ?? 'dev'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        <div className="max-w-2xl mx-auto px-4 pb-24">
          {children}
          <p className="text-center pb-2" style={{ fontSize: '10px', color: 'var(--border)' }}>
            {buildVersion}
          </p>
        </div>
      </body>
    </html>
  )
}
