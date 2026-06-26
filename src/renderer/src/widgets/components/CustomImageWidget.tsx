import { useState } from 'react'
import { ImagePlus, RefreshCw } from 'lucide-react'
import { api } from '../../lib/ipc'
import { Button } from '../../components/ui/Button'
import type { WidgetProps } from '../types'

// Displays a user-chosen image. The image is stored as a data URL in this
// instance's config (`image`) — reusing the same picker the appearance
// background uses (`api.app.chooseBackgroundImage`), which returns a data URL.
// `fit` toggles cover/contain.
export default function CustomImageWidget({ config, setConfig, editing }: WidgetProps) {
  const [loading, setLoading] = useState(false)
  const image = typeof config.image === 'string' ? config.image : null
  const fit = config.fit === 'contain' ? 'contain' : 'cover'

  const choose = async () => {
    setLoading(true)
    const r = await api.app.chooseBackgroundImage()
    setLoading(false)
    if (r.ok && r.data) setConfig({ image: r.data })
  }

  if (!image) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-3 text-center">
        <ImagePlus size={20} className="text-zinc-600" />
        <p className="t-caption text-zinc-500">No image yet.</p>
        <Button variant="secondary" size="sm" loading={loading} onClick={choose}>Choose image</Button>
      </div>
    )
  }

  return (
    <div className="h-full w-full relative group overflow-hidden rounded-md">
      <img src={image} alt="" className="h-full w-full" style={{ objectFit: fit }} />
      {editing && (
        <button onClick={choose} title="Replace image"
          className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-black/50 text-white/90 hover:bg-black/70 transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      )}
    </div>
  )
}
