import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import type { WidgetProps } from '../types'

// Live clock + date. `format24h` config switches 12/24-hour display.
export default function ClockWidget({ config }: WidgetProps) {
  const [now, setNow] = useState(() => Date.now())
  const h24 = config.format24h === true || config.format24h === 'true'

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      <p className="tnum text-zinc-100 font-semibold leading-none"
        style={{ fontSize: 'clamp(1.75rem, 6vw, 3rem)' }}>
        {format(now, h24 ? 'HH:mm' : 'h:mm')}
        {!h24 && <span className="text-zinc-500 text-[0.5em] ml-1">{format(now, 'a')}</span>}
      </p>
      <p className="t-caption text-zinc-500 mt-2">{format(now, 'EEEE, MMMM d')}</p>
    </div>
  )
}
