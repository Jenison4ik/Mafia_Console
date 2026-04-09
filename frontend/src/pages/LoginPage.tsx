import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiJson } from '../api'
import { useAuth } from '../auth'

type UserOpt = { id: number; username: string; display_name: string; is_staff: boolean }

export default function LoginPage() {
  const nav = useNavigate()
  const { refresh, me } = useAuth()
  const [users, setUsers] = useState<UserOpt[]>([])
  const [userId, setUserId] = useState<number | ''>('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        await apiJson('/auth/csrf/')
        const u = await apiJson<UserOpt[]>('/auth/users/')
        setUsers(u)
        if (u.length) setUserId(u[0].id)
      } catch {
        setErr('Нет связи с сервером')
      }
    })()
  }, [])

  useEffect(() => {
    if (me) nav('/evening', { replace: true })
  }, [me, nav])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    setLoading(true)
    try {
      await apiJson('/auth/csrf/')
      await apiJson('/auth/login/', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, code }),
      })
      await refresh()
      nav('/evening')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="shell" style={{ maxWidth: 420 }}>
      <h1 style={{ fontSize: '1.35rem', marginTop: 24 }}>Мафия организатОр</h1>
      <p className="muted">Выберите профиль и введите код (у админа: admin)</p>
      <form className="stack card" onSubmit={onSubmit} style={{ marginTop: 16 }}>
        <label>
          <span className="muted">Профиль</span>
          <select
            value={userId === '' ? '' : String(userId)}
            onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : '')}
            required
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name || u.username}
                {u.is_staff ? ' (админ)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted">Код</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="код входа"
            autoComplete="off"
          />
        </label>
        {err && <p style={{ color: 'var(--danger)', margin: 0 }}>{err}</p>}
        <button className="btn btn-primary" type="submit" disabled={loading || userId === ''}>
          Войти
        </button>
      </form>
    </div>
  )
}
