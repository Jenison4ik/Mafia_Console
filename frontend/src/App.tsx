import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import LoginPage from './pages/LoginPage'
import EveningPage from './pages/EveningPage'
import GameSessionPage from './pages/GameSessionPage'
import AdminPage from './pages/AdminPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth()
  if (loading) {
    return (
      <div className="shell">
        <p className="muted">Загрузка…</p>
      </div>
    )
  }
  if (!me) {
    return <Navigate to="/login" replace />
  }
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/evening"
        element={
          <RequireAuth>
            <EveningPage />
          </RequireAuth>
        }
      />
      <Route
        path="/evening/:id"
        element={
          <RequireAuth>
            <EveningPage />
          </RequireAuth>
        }
      />
      <Route
        path="/session/:id"
        element={
          <RequireAuth>
            <GameSessionPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminPage />
          </RequireAuth>
        }
      />
      <Route path="/" element={<Navigate to="/evening" replace />} />
      <Route path="*" element={<Navigate to="/evening" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
