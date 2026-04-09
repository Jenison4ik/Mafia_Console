import { useCallback, useEffect, useRef, useState } from 'react'

const PRESETS = [
  { label: '30 сек', sec: 30 },
  { label: '1 мин', sec: 60 },
  { label: '1.5 мин', sec: 90 },
] as const

export function TimerBar() {
  const [active, setActive] = useState<number | null>(null)
  const [left, setLeft] = useState(0)
  const [warn, setWarn] = useState(false)
  const [flash, setFlash] = useState(false)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTick = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current)
    tickRef.current = null
  }, [])

  useEffect(() => () => clearTick(), [clearTick])

  function beep() {
    try {
      const ctx = new AudioContext()
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.connect(g)
      g.connect(ctx.destination)
      o.frequency.value = 880
      g.gain.value = 0.08
      o.start()
      setTimeout(() => {
        o.stop()
        ctx.close()
      }, 120)
    } catch {
      /* ignore */
    }
  }

  function startPreset(sec: number) {
    if (active === sec && left > 0) {
      clearTick()
      setActive(null)
      setLeft(0)
      setWarn(false)
      return
    }
    clearTick()
    setActive(sec)
    setLeft(sec)
    setWarn(false)
    tickRef.current = setInterval(() => {
      setLeft((s) => {
        const n = s - 1
        if (n <= 0) {
          clearTick()
          setActive(null)
          setFlash(true)
          setTimeout(() => setFlash(false), 2500)
          if (sec === 90) beep()
          return 0
        }
        if ((sec === 30 || sec === 60) && n <= 10) setWarn(true)
        else setWarn(false)
        return n
      })
    }, 1000)
  }

  const label = active ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '—'

  return (
    <div className={`timer-bar row ${warn ? 'timer-warn' : ''} ${flash ? 'flash-end' : ''}`} style={{ flexWrap: 'wrap' }}>
      <span className="muted" style={{ minWidth: 56 }}>
        {label}
      </span>
      {PRESETS.map((p) => (
        <button key={p.sec} type="button" className="btn" onClick={() => startPreset(p.sec)}>
          {p.label}
        </button>
      ))}
    </div>
  )
}
