import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { apiJson } from '../api'
import { useAuth } from '../auth'

type TableRow = { id: number; name: string; sort_order: number }

export default function AdminPage() {
  const { me } = useAuth()
  const [tables, setTables] = useState<TableRow[]>([])
  const [price, setPrice] = useState('')
  const [audit, setAudit] = useState<{ id: number; action: string; created_at: string }[]>([])

  const load = useCallback(async () => {
    const [t, g, a] = await Promise.all([
      apiJson<TableRow[]>('/tables/'),
      apiJson<{ default_price_per_game: string }>('/settings/global/'),
      apiJson<{ id: number; action: string; created_at: string }[]>('/audit/'),
    ])
    setTables(t)
    setPrice(g.default_price_per_game)
    setAudit(a)
  }, [])

  useEffect(() => {
    if (me?.is_staff) void load().catch(() => {})
  }, [me, load])

  if (!me?.is_staff) {
    return <Navigate to="/evening" replace />
  }

  async function savePrice() {
    await apiJson('/settings/global/', {
      method: 'PATCH',
      body: JSON.stringify({ default_price_per_game: price }),
    })
    await load()
  }

  return (
    <div className="shell">
      <Link to="/evening" className="btn" style={{ textDecoration: 'none', display: 'inline-block' }}>
        ← Назад
      </Link>
      <h1 style={{ fontSize: '1.2rem' }}>Админка</h1>

      <section className="card stack" style={{ marginTop: 12 }}>
        <h2 style={{ fontSize: '1rem', margin: 0 }}>Тариф по умолчанию (обычный вечер)</h2>
        <div className="row">
          <input value={price} onChange={(e) => setPrice(e.target.value)} style={{ maxWidth: 160 }} />
          <button type="button" className="btn btn-primary" onClick={() => void savePrice()}>
            Сохранить
          </button>
        </div>
      </section>

      <section className="card stack" style={{ marginTop: 12 }}>
        <h2 style={{ fontSize: '1rem', margin: 0 }}>Столы</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {tables.map((t) => (
            <li key={t.id}>
              {t.name} (порядок {t.sort_order})
            </li>
          ))}
        </ul>
        <p className="muted" style={{ margin: 0 }}>
          Редактирование столов — через Django Admin /api/admin/ (при необходимости).
        </p>
      </section>

      <section className="card stack" style={{ marginTop: 12 }}>
        <h2 style={{ fontSize: '1rem', margin: 0 }}>Журнал</h2>
        <div style={{ fontSize: '0.85rem', maxHeight: 280, overflow: 'auto' }}>
          {audit.map((r) => (
            <div key={r.id} className="muted">
              {r.created_at} — {r.action}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
