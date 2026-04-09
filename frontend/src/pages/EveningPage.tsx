import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiJson } from '../api'
import { useAuth } from '../auth'

type Evening = {
  id: number
  name: string
  event_date: string
  event_type: string
  price_per_game: string
  display_title: string
  effective_price: string
}

type Ep = {
  id: number
  player: { id: number; nickname: string; first_name: string }
  games_played: number
  paid_amount: string
}

type GameRow = { id: number; evening: number; game_number: number; session_ids: number[] }

type TableRow = { id: number; name: string }

export default function EveningPage() {
  const { id } = useParams()
  if (!id) return <EveningHub />
  return <EveningDetail eveningId={Number(id)} />
}

function EveningHub() {
  const { me } = useAuth()
  const nav = useNavigate()
  const [past, setPast] = useState<Evening[]>([])
  const [upcoming, setUpcoming] = useState<Evening[]>([])
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archQ, setArchQ] = useState('')
  const [archDate, setArchDate] = useState('')
  const [archRes, setArchRes] = useState<Evening[]>([])
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(async () => {
    const s = await apiJson<{ past: Evening[]; upcoming: Evening[] }>('/evenings/summary/')
    setPast(s.past)
    setUpcoming(s.upcoming)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function searchArchive() {
    const q = new URLSearchParams()
    if (archQ) q.set('q', archQ)
    if (archDate) q.set('date', archDate)
    const list = await apiJson<Evening[]>(`/evenings/archive/?${q.toString()}`)
    setArchRes(list)
  }

  return (
    <div className="shell">
      <header className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ fontSize: '1.2rem', margin: 0 }}>Вечера</h1>
        <div className="row">
          {me?.is_staff && (
            <button type="button" className="btn" onClick={() => setCreateOpen(true)}>
              + Вечер
            </button>
          )}
          <Link className="btn" to="/admin">
            Админка
          </Link>
        </div>
      </header>

      <section className="stack">
        <h2 className="muted" style={{ fontSize: '0.95rem', margin: 0 }}>
          Ближайшие (до 3)
        </h2>
        {upcoming.map((e) => (
          <button
            key={e.id}
            type="button"
            className="btn"
            style={{ justifyContent: 'flex-start', textAlign: 'left' }}
            onClick={() => nav(`/evening/${e.id}`)}
          >
            {e.display_title} · {e.event_date}
          </button>
        ))}
        <h2 className="muted" style={{ fontSize: '0.95rem', margin: '8px 0 0' }}>
          Прошедшие (до 3)
        </h2>
        {past.map((e) => (
          <button
            key={e.id}
            type="button"
            className="btn"
            style={{ justifyContent: 'flex-start', textAlign: 'left' }}
            onClick={() => nav(`/evening/${e.id}`)}
          >
            {e.display_title} · {e.event_date}
          </button>
        ))}
      </section>

      <section style={{ marginTop: 20 }}>
        <button type="button" className="btn" onClick={() => setArchiveOpen((v) => !v)}>
          {archiveOpen ? 'Скрыть архив' : 'Календарь / архив'}
        </button>
        {archiveOpen && (
          <div className="card stack" style={{ marginTop: 10 }}>
            <input placeholder="Поиск по названию" value={archQ} onChange={(e) => setArchQ(e.target.value)} />
            <input type="date" value={archDate} onChange={(e) => setArchDate(e.target.value)} />
            <button type="button" className="btn btn-primary" onClick={() => void searchArchive()}>
              Найти
            </button>
            <div className="stack">
              {archRes.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="btn"
                  onClick={() => nav(`/evening/${e.id}`)}
                >
                  {e.display_title} · {e.event_date}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {createOpen && me?.is_staff && (
        <CreateEveningModal onClose={() => setCreateOpen(false)} onCreated={(eid) => nav(`/evening/${eid}`)} />
      )}
    </div>
  )
}

function CreateEveningModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: number) => void
}) {
  const [name, setName] = useState('')
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [eventType, setEventType] = useState('regular')
  const [price, setPrice] = useState('500')
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    try {
      const body: Record<string, unknown> = {
        name,
        event_date: eventDate,
        event_type: eventType,
      }
      if (eventType === 'regular') body.price_per_game = price
      const ev = await apiJson<Evening>('/evenings/', { method: 'POST', body: JSON.stringify(body) })
      onCreated(ev.id)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 12,
      }}
    >
      <form className="card stack" style={{ width: '100%', maxWidth: 400 }} onSubmit={submit}>
        <h2 style={{ margin: 0 }}>Новый вечер</h2>
        <label>
          <span className="muted">Название</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span className="muted">Дата</span>
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
        </label>
        <label>
          <span className="muted">Тип</span>
          <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
            <option value="regular">Обычный</option>
            <option value="tournament">Турнир</option>
          </select>
        </label>
        {eventType === 'regular' && (
          <label>
            <span className="muted">Цена за игру (₽)</span>
            <input value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
        )}
        {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn-primary">
            Создать
          </button>
        </div>
      </form>
    </div>
  )
}

function EveningDetail({ eveningId }: { eveningId: number }) {
  const { me } = useAuth()
  const nav = useNavigate()
  const [ev, setEv] = useState<Evening | null>(null)
  const [eps, setEps] = useState<Ep[]>([])
  const [tables, setTables] = useState<TableRow[]>([])
  const [games, setGames] = useState<GameRow[]>([])
  const [statsOpen, setStatsOpen] = useState(false)
  const [playerQ, setPlayerQ] = useState('')
  const [searchHits, setSearchHits] = useState<{ id: number; display_label: string; nickname: string }[]>(
    []
  )
  const [addOpen, setAddOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [gameNo, setGameNo] = useState(1)
  const [selTables, setSelTables] = useState<number[]>([])
  const [fabOpen, setFabOpen] = useState(false)

  const load = useCallback(async () => {
    const [e, pl, tb, gs] = await Promise.all([
      apiJson<Evening>(`/evenings/${eveningId}/`),
      apiJson<Ep[]>(`/evenings/${eveningId}/players/`),
      apiJson<TableRow[]>('/tables/'),
      apiJson<GameRow[]>(`/evenings/${eveningId}/games/`),
    ])
    setEv(e)
    setEps(pl)
    setTables(tb)
    setGames(gs)
  }, [eveningId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!playerQ.trim()) {
      setSearchHits([])
      return
    }
    const t = setTimeout(() => {
      void (async () => {
        try {
          const r = await apiJson<{ id: number; display_label: string; nickname: string }[]>(
            `/players/?q=${encodeURIComponent(playerQ)}`
          )
          setSearchHits(r)
        } catch {
          setSearchHits([])
        }
      })()
    }, 250)
    return () => clearTimeout(t)
  }, [playerQ])

  async function addPlayer(pid: number) {
    await apiJson(`/evenings/${eveningId}/players/`, {
      method: 'POST',
      body: JSON.stringify({ player_id: pid }),
    })
    setAddOpen(false)
    setPlayerQ('')
    await load()
  }

  async function removeEp(epId: number) {
    if (!confirm('Удалить игрока из вечера?')) return
    await apiJson(`/evenings/${eveningId}/players/${epId}/`, { method: 'DELETE' })
    await load()
  }

  async function startGame() {
    if (!selTables.length) {
      alert('Выберите столы')
      return
    }
    const g = await apiJson<GameRow>(`/evenings/${eveningId}/games/`, {
      method: 'POST',
      body: JSON.stringify({ game_number: gameNo, table_ids: selTables }),
    })
    await load()
    const sid = g.session_ids[0]
    if (sid) nav(`/session/${sid}`)
  }

  if (!ev) return <p className="shell muted">Загрузка…</p>

  return (
    <div className="shell">
      <header className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Link to="/evening" className="muted" style={{ fontSize: '0.85rem' }}>
            ← Все вечера
          </Link>
          <h1 style={{ fontSize: '1.25rem', margin: '6px 0 0' }}>{ev.display_title}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {ev.event_date} · {ev.event_type === 'tournament' ? 'Турнир' : 'Обычный'} ·{' '}
            {ev.event_type === 'tournament' ? '0 ₽' : `${ev.effective_price} ₽`} за игру
          </p>
        </div>
        {me?.is_staff && (
          <Link className="btn" to="/admin">
            ⚙
          </Link>
        )}
      </header>

      <section className="card stack" style={{ marginTop: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>Игроки</strong>
          <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
            + Игрок
          </button>
        </div>
        {eps.map((ep) => (
          <div key={ep.id} className="row" style={{ justifyContent: 'space-between' }}>
            <span>
              {ep.player.nickname} · игр {ep.games_played} · {ep.paid_amount} ₽
            </span>
            {ep.games_played === 0 && (
              <button type="button" className="btn btn-danger" onClick={() => void removeEp(ep.id)}>
                ✕
              </button>
            )}
          </div>
        ))}
      </section>

      <section className="card stack" style={{ marginTop: 12 }}>
        <strong>Начать игру</strong>
        <label>
          <span className="muted">Номер игры</span>
          <input
            type="number"
            min={1}
            value={gameNo}
            onChange={(e) => setGameNo(Number(e.target.value))}
          />
        </label>
        <div className="muted">Столы</div>
        <div className="row">
          {tables.map((t) => (
            <label key={t.id} className="row" style={{ gap: 6 }}>
              <input
                type="checkbox"
                checked={selTables.includes(t.id)}
                onChange={() =>
                  setSelTables((s) =>
                    s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id]
                  )
                }
              />
              {t.name}
            </label>
          ))}
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void startGame()}>
          Начать игру
        </button>
      </section>

      <section style={{ marginTop: 12 }}>
        <button type="button" className="btn" style={{ width: '100%' }} onClick={() => setStatsOpen((x) => !x)}>
          Статистика вечера {statsOpen ? '▼' : '▶'}
        </button>
        {statsOpen && (
          <div className="card stack" style={{ marginTop: 8 }}>
            <p className="muted" style={{ margin: 0 }}>
              Игр в базе: {games.length}. Сессии: {games.flatMap((g) => g.session_ids).join(', ') || '—'}
            </p>
          </div>
        )}
      </section>

      <div className="row" style={{ marginTop: 16, gap: 8 }}>
        {games.flatMap((g) =>
          g.session_ids.map((sid) => (
            <Link key={sid} className="btn" to={`/session/${sid}`}>
              Игра {g.game_number} · сессия {sid}
            </Link>
          ))
        )}
      </div>

      <div className="fab">
        {fabOpen && (
          <div className="card stack" style={{ minWidth: 200 }}>
            <a
              className="btn"
              style={{ textAlign: 'center', textDecoration: 'none' }}
              href={`/api/evenings/${eveningId}/export.pdf`}
              target="_blank"
              rel="noreferrer"
            >
              PDF вечера
            </a>
          </div>
        )}
        <button type="button" className="btn btn-primary" onClick={() => setFabOpen((x) => !x)}>
          Расчёт / экспорт
        </button>
      </div>

      {addOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 90,
            padding: 12,
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          <div className="card stack" style={{ width: '100%', maxWidth: 480 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>Добавить игрока</strong>
              <button type="button" className="btn" onClick={() => setAddOpen(false)}>
                ✕
              </button>
            </div>
            <label>
              <span className="muted">Поиск (Имя-Ник)</span>
              <input
                value={playerQ}
                onChange={(e) => setPlayerQ(e.target.value)}
                placeholder="Имя-Ник"
              />
            </label>
            <div className="stack">
              {searchHits.map((h) => (
                <button key={h.id} type="button" className="btn" onClick={() => void addPlayer(h.id)}>
                  {h.nickname}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-primary" onClick={() => setQuickOpen(true)}>
              Создать / изменить профиль
            </button>
          </div>
        </div>
      )}

      {quickOpen && (
        <QuickPlayerModal
          eveningId={eveningId}
          onClose={() => setQuickOpen(false)}
          onDone={async () => {
            setQuickOpen(false)
            await load()
          }}
        />
      )}
    </div>
  )
}

function QuickPlayerModal({
  eveningId,
  onClose,
  onDone,
}: {
  eveningId: number
  onClose: () => void
  onDone: () => void | Promise<void>
}) {
  const [firstName, setFirstName] = useState('')
  const [nickname, setNickname] = useState('')
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    try {
      await apiJson(`/evenings/${eveningId}/players/quick-create/`, {
        method: 'POST',
        body: JSON.stringify({
          first_name: firstName,
          nickname,
          phone,
          social_url: '',
        }),
      })
      await onDone()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
    >
      <form className="card stack" style={{ width: '100%', maxWidth: 400 }} onSubmit={submit}>
        <h2 style={{ margin: 0 }}>Новый профиль</h2>
        <label>
          Имя *
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </label>
        <label>
          Ник *
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} required />
        </label>
        <label>
          Телефон
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn-primary">
            Сохранить и добавить
          </button>
        </div>
      </form>
    </div>
  )
}
