/**
 * generate-icons.mjs
 *
 * Rasterizes the brand logo (nuggets-logo.svg) into all app icon assets:
 *   - public/icon-192.png      (PWA manifest + apple-touch-icon, opaque white bg)
 *   - public/icon-512.png      (PWA manifest)
 *   - app/favicon.ico          (16/32/48 px, PNG-encoded entries)
 *
 * iOS home-screen icons must not be transparent, so the logo is composited
 * onto an opaque white background with uniform padding. Run with:
 *   node scripts/generate-icons.mjs
 */
import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SVG_PATH = join(ROOT, 'assets', 'nuggets-logo.svg')

// Fraction of the canvas the logo occupies (the rest is padding around it).
const LOGO_SCALE = 0.82
// Opaque background — iOS icons may not be transparent.
const BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 }

/**
 * Render the logo SVG onto an opaque white square of the given size.
 * Returns a PNG buffer.
 */
async function renderSquare(svg, size) {
  const inner = Math.round(size * LOGO_SCALE)
  // The source SVG carries generous internal whitespace; trim it on a white
  // matte first so the logo fills the padded box instead of looking lost.
  const logo = await sharp(svg)
    .flatten({ background: BACKGROUND })
    .trim({ background: '#ffffff' })
    .resize(inner, inner, { fit: 'contain', background: BACKGROUND })
    .png()
    .toBuffer()

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer()
}

/**
 * Build a .ico container that embeds one PNG image per requested size.
 * PNG-in-ICO is supported by all modern browsers and Windows Vista+.
 */
function buildIco(pngEntries) {
  const count = pngEntries.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: 1 = icon
  header.writeUInt16LE(count, 4)

  const directory = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  pngEntries.forEach((entry, index) => {
    const base = index * 16
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 0) // width
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 1) // height
    directory.writeUInt8(0, base + 2) // palette colors
    directory.writeUInt8(0, base + 3) // reserved
    directory.writeUInt16LE(1, base + 4) // color planes
    directory.writeUInt16LE(32, base + 6) // bits per pixel
    directory.writeUInt32LE(entry.data.length, base + 8) // size in bytes
    directory.writeUInt32LE(offset, base + 12) // offset
    offset += entry.data.length
  })

  return Buffer.concat([header, directory, ...pngEntries.map((e) => e.data)])
}

async function main() {
  const svg = await readFile(SVG_PATH)

  const icon192 = await renderSquare(svg, 192)
  const icon512 = await renderSquare(svg, 512)
  await writeFile(join(ROOT, 'public', 'icon-192.png'), icon192)
  await writeFile(join(ROOT, 'public', 'icon-512.png'), icon512)

  const faviconSizes = [16, 32, 48]
  const faviconEntries = await Promise.all(
    faviconSizes.map(async (size) => ({ size, data: await renderSquare(svg, size) })),
  )
  await writeFile(join(ROOT, 'app', 'favicon.ico'), buildIco(faviconEntries))

  console.log('Generated: public/icon-192.png, public/icon-512.png, app/favicon.ico')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
