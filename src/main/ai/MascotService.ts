// Scans resources/mascot/ for mascot skins and always offers the built-in SVG
// "Byte" default (which needs no .riv). Each on-disk skin is a `<name>.riv` plus
// a sibling `<name>.json` metadata file ({name, description, thumbnail}).
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import type { MascotSkin } from '@shared/types/entities'

const DEFAULT_SKIN: MascotSkin = {
  id: 'default',
  name: 'Byte (default)',
  description: 'The built-in blue gel companion. Offline, always available.',
  builtin: true,
  riv: null,
  thumbnail: null,
}

/** resources/mascot in dev (project root) and in the packaged app. */
function mascotDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'mascot')
    : path.join(app.getAppPath(), 'resources', 'mascot')
}

export function getAvailableSkins(): MascotSkin[] {
  const skins: MascotSkin[] = [DEFAULT_SKIN]
  try {
    const dir = mascotDir()
    if (!fs.existsSync(dir)) return skins
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.riv')) continue
      const base = file.slice(0, -4)
      const rivPath = path.join(dir, file)
      const metaPath = path.join(dir, `${base}.json`)
      let meta: Partial<MascotSkin> = {}
      if (fs.existsSync(metaPath)) {
        try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) } catch { /* ignore bad json */ }
      }
      const thumb = meta.thumbnail ? path.join(dir, meta.thumbnail) : null
      skins.push({
        id: base,
        name: meta.name ?? base,
        description: meta.description ?? '',
        builtin: false,
        riv: rivPath,
        thumbnail: thumb && fs.existsSync(thumb) ? thumb : null,
      })
    }
  } catch { /* directory missing or unreadable — just the default */ }
  return skins
}
