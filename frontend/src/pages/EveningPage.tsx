import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../api";
import { useAuth } from "../auth";
import "./EveningPage.css";

type Evening = {
  id: number;
  name: string;
  event_date: string;
  event_type: string;
  price_per_game: string;
  display_title: string;
  effective_price: string;
};

type Ep = {
  id: number;
  player: { id: number; nickname: string; first_name: string };
  games_played: number;
  paid_amount: string;
};

type GameRow = {
  id: number;
  evening: number;
  game_number: number;
  session_ids: number[];
};

type TableRow = { id: number; name: string };
type PlayerHit = { id: number; display_label: string; nickname: string };

function formatEveningTitle(evening: Evening) {
  return `${evening.display_title} · ${evening.event_date}`;
}

function toggleId(list: number[], id: number) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export default function EveningPage() {
  const { id } = useParams();
  if (!id) return <EveningHub />;
  return <EveningDetail eveningId={Number(id)} />;
}

function EveningHub() {
  const { me } = useAuth();
  const nav = useNavigate();
  const [past, setPast] = useState<Evening[]>([]);
  const [upcoming, setUpcoming] = useState<Evening[]>([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archQ, setArchQ] = useState("");
  const [archDate, setArchDate] = useState("");
  const [archRes, setArchRes] = useState<Evening[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    const s = await apiJson<{ past: Evening[]; upcoming: Evening[] }>(
      "/evenings/summary/",
    );
    setPast(s.past);
    setUpcoming(s.upcoming);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function searchArchive() {
    const q = new URLSearchParams();
    if (archQ) q.set("q", archQ);
    if (archDate) q.set("date", archDate);
    const list = await apiJson<Evening[]>(`/evenings/archive/?${q.toString()}`);
    setArchRes(list);
  }

  return (
    <div className="shell">
      <header
        className="row evening-hub-header"
      >
        <h1 className="evening-hub-title">Вечера</h1>
        <div className="row">
          {me?.is_staff && (
            <button
              type="button"
              className="btn"
              onClick={() => setCreateOpen(true)}
            >
              + Вечер
            </button>
          )}
          <Link className="btn" to="/admin">
            Админка
          </Link>
        </div>
      </header>

      <section className="stack">
        <h2 className="muted evening-section-title">
          Ближайшие (до 3)
        </h2>
        {upcoming.map((e) => (
          <button
            key={e.id}
            type="button"
            className="btn evening-nav-btn"
            onClick={() => nav(`/evening/${e.id}`)}
          >
            {formatEveningTitle(e)}
          </button>
        ))}
        <h2 className="muted evening-section-title evening-section-title-spaced">
          Прошедшие (до 3)
        </h2>
        {past.map((e) => (
          <button
            key={e.id}
            type="button"
            className="btn evening-nav-btn"
            onClick={() => nav(`/evening/${e.id}`)}
          >
            {formatEveningTitle(e)}
          </button>
        ))}
      </section>

      <section className="evening-archive-section">
        <button
          type="button"
          className="btn"
          onClick={() => setArchiveOpen((v) => !v)}
        >
          {archiveOpen ? "Скрыть архив" : "Календарь / архив"}
        </button>
        {archiveOpen && (
          <div className="card stack evening-archive-card">
            <input
              placeholder="Поиск по названию"
              value={archQ}
              onChange={(e) => setArchQ(e.target.value)}
            />
            <input
              type="date"
              value={archDate}
              onChange={(e) => setArchDate(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void searchArchive()}
            >
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
                  {formatEveningTitle(e)}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {createOpen && me?.is_staff && (
        <CreateEveningModal
          onClose={() => setCreateOpen(false)}
          onCreated={(eid) => nav(`/evening/${eid}`)}
        />
      )}
    </div>
  );
}

function CreateEveningModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [eventType, setEventType] = useState("regular");
  const [price, setPrice] = useState("500");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const body: Record<string, unknown> = {
        name,
        event_date: eventDate,
        event_type: eventType,
      };
      if (eventType === "regular") body.price_per_game = price;
      const ev = await apiJson<Evening>("/evenings/", {
        method: "POST",
        body: JSON.stringify(body),
      });
      onCreated(ev.id);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  }

  return (
    <div className="evening-modal-overlay evening-modal-overlay-bottom">
      <form
        className="card stack evening-modal-form"
        onSubmit={submit}
      >
        <h2 className="evening-modal-title">Новый вечер</h2>
        <label>
          <span className="muted">Название</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span className="muted">Дата</span>
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            required
          />
        </label>
        <label>
          <span className="muted">Тип</span>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
          >
            <option value="regular">Обычный</option>
            <option value="tournament">Турнир</option>
          </select>
        </label>
        {eventType === "regular" && (
          <label>
            <span className="muted">Цена за игру (₽)</span>
            <input value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
        )}
        {err && <p className="evening-error">{err}</p>}
        <div className="row evening-row-end">
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn-primary">
            Создать
          </button>
        </div>
      </form>
    </div>
  );
}

function EveningDetail({ eveningId }: { eveningId: number }) {
  const { me } = useAuth();
  const nav = useNavigate();
  const [ev, setEv] = useState<Evening | null>(null);
  const [eps, setEps] = useState<Ep[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [games, setGames] = useState<GameRow[]>([]);
  const [statsOpen, setStatsOpen] = useState(false);
  const [playerQ, setPlayerQ] = useState("");
  const [searchHits, setSearchHits] = useState<PlayerHit[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [gameNo, setGameNo] = useState(1);
  const [selTables, setSelTables] = useState<number[]>([]);
  const [fabOpen, setFabOpen] = useState(false);
  const sessionLinks = useMemo(
    () =>
      games.flatMap((game) =>
        game.session_ids.map((sessionId) => ({
          gameNumber: game.game_number,
          sessionId,
        })),
      ),
    [games],
  );

  const load = useCallback(async () => {
    const [e, pl, tb, gs] = await Promise.all([
      apiJson<Evening>(`/evenings/${eveningId}/`),
      apiJson<Ep[]>(`/evenings/${eveningId}/players/`),
      apiJson<TableRow[]>("/tables/"),
      apiJson<GameRow[]>(`/evenings/${eveningId}/games/`),
    ]);
    setEv(e);
    setEps(pl);
    setTables(tb);
    setGames(gs);
  }, [eveningId]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!playerQ.trim()) return;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const r = await apiJson<PlayerHit[]>(
            `/players/?q=${encodeURIComponent(playerQ)}`,
          );
          setSearchHits(r);
        } catch {
          setSearchHits([]);
        }
      })();
    }, 250);
    return () => clearTimeout(t);
  }, [playerQ]);

  async function addPlayer(pid: number) {
    await apiJson(`/evenings/${eveningId}/players/`, {
      method: "POST",
      body: JSON.stringify({ player_id: pid }),
    });
    setAddOpen(false);
    setPlayerQ("");
    await load();
  }

  async function removeEp(epId: number) {
    if (!confirm("Удалить игрока из вечера?")) return;
    await apiJson(`/evenings/${eveningId}/players/${epId}/`, {
      method: "DELETE",
    });
    await load();
  }

  async function startGame() {
    if (!selTables.length) {
      alert("Выберите столы");
      return;
    }
    const g = await apiJson<GameRow>(`/evenings/${eveningId}/games/`, {
      method: "POST",
      body: JSON.stringify({ game_number: gameNo, table_ids: selTables }),
    });
    await load();
    const sid = g.session_ids[0];
    if (sid) nav(`/session/${sid}`);
  }

  if (!ev) return <p className="shell muted">Загрузка…</p>;

  return (
    <div className="shell">
      <header
        className="row evening-detail-header"
      >
        <div>
          <Link to="/evening" className="muted evening-back-link">
            ← Все вечера
          </Link>
          <h1 className="evening-detail-title">{ev.display_title}</h1>
          <p className="muted evening-detail-subtitle">
            {ev.event_date} ·{" "}
            {ev.event_type === "tournament" ? "Турнир" : "Обычный"} ·{" "}
            {ev.event_type === "tournament" ? "0 ₽" : `${ev.effective_price} ₽`}{" "}
            за игру
          </p>
        </div>
        {me?.is_staff && (
          <Link className="btn" to="/admin">
            ⚙
          </Link>
        )}
      </header>

      <section className="card stack evening-players-section">
        <div className="row evening-row-between">
          <strong>Игроки</strong>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setAddOpen(true)}
          >
            + Игрок
          </button>
        </div>
        {eps.map((ep) => (
          <div
            key={ep.id}
            className="row evening-row-between"
          >
            <span>
              {ep.player.nickname} · игр {ep.games_played} · {ep.paid_amount} ₽
            </span>
            {ep.games_played === 0 && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void removeEp(ep.id)}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </section>

      <section className="card stack evening-start-game-section">
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
            <label key={t.id} className="row evening-table-label">
              <input
                type="checkbox"
                checked={selTables.includes(t.id)}
                onChange={() => setSelTables((s) => toggleId(s, t.id))}
              />
              {t.name}
            </label>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void startGame()}
        >
          Начать игру
        </button>
      </section>

      <section className="evening-stats-section">
        <button
          type="button"
          className="btn evening-full-width"
          onClick={() => setStatsOpen((x) => !x)}
        >
          Статистика вечера {statsOpen ? "▼" : "▶"}
        </button>
        {statsOpen && (
          <div className="card stack evening-stats-card">
            <p className="muted evening-no-margin">
              Игр в базе: {games.length}. Сессии:{" "}
              {games.flatMap((g) => g.session_ids).join(", ") || "—"}
            </p>
          </div>
        )}
      </section>

      <div className="row evening-session-links">
        {sessionLinks.map(({ gameNumber, sessionId }) => (
          <Link key={sessionId} className="btn" to={`/session/${sessionId}`}>
            Игра {gameNumber} · сессия {sessionId}
          </Link>
        ))}
      </div>

      <div className="fab">
        {fabOpen && (
          <div className="card stack evening-fab-card">
            <a
              className="btn evening-fab-link"
              href={`/api/evenings/${eveningId}/export.pdf`}
              target="_blank"
              rel="noreferrer"
            >
              PDF вечера
            </a>
          </div>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setFabOpen((x) => !x)}
        >
          Расчёт / экспорт
        </button>
      </div>

      {addOpen && (
        <div className="evening-add-overlay">
          <div className="card stack evening-add-card">
            <div className="row evening-row-between">
              <strong>Добавить игрока</strong>
              <button
                type="button"
                className="btn"
                onClick={() => setAddOpen(false)}
              >
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
              {(playerQ.trim() ? searchHits : []).map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  className="btn"
                  onClick={() => void addPlayer(hit.id)}
                >
                  {hit.nickname}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setQuickOpen(true)}
            >
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
            setQuickOpen(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function QuickPlayerModal({
  eveningId,
  onClose,
  onDone,
}: {
  eveningId: number;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [firstName, setFirstName] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await apiJson(`/evenings/${eveningId}/players/quick-create/`, {
        method: "POST",
        body: JSON.stringify({
          first_name: firstName,
          nickname,
          phone,
          social_url: "",
        }),
      });
      await onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  }

  return (
    <div className="evening-modal-overlay evening-modal-overlay-center">
      <form
        className="card stack evening-modal-form"
        onSubmit={submit}
      >
        <h2 className="evening-modal-title">Новый профиль</h2>
        <label>
          Имя *
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
        </label>
        <label>
          Ник *
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            required
          />
        </label>
        <label>
          Телефон
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        {err && <p className="evening-error">{err}</p>}
        <div className="row evening-row-end">
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn-primary">
            Сохранить и добавить
          </button>
        </div>
      </form>
    </div>
  );
}
