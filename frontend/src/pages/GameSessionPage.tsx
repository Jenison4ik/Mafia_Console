import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiJson } from "../api";
import { useAuth } from "../auth";
import { TimerBar } from "../components/TimerBar";

type GPlayer = {
  id: number;
  player: number;
  nickname: string;
  seat_number: number;
  fouls: number;
  points: string;
  extra_points: string;
  role: string;
  eliminated: boolean;
  excluded_by_fouls: boolean;
};

type Session = {
  id: number;
  evening_id: number;
  stage: string;
  evening_title: string;
  evening_date: string;
  game_number: number;
  table_name: string;
  leader: number | null;
  post_edit_unlocked: boolean;
  winner: string;
  protests: string;
  version: number;
  players: GPlayer[];
  voting_rounds: {
    id: number;
    index: number;
    kind: string;
    nominations: number[];
    votes: Record<string, number>;
    is_tie: boolean;
    completed: boolean;
  }[];
  shooting_rounds: {
    id: number;
    index: number;
    target_seat: number | null;
    is_miss: boolean;
    completed: boolean;
  }[];
  testament_seats: number[];
  testament_completed: boolean;
};

const WINNERS = [
  { value: "peaceful_win", label: "Победа Мирных" },
  { value: "mafia_win", label: "Победа Мафии" },
  { value: "ppk_mafia", label: "ППК Победа Мафии" },
  { value: "ppk_peaceful", label: "ППК Победа Мирных" },
  { value: "draw", label: "Ничья" },
];

const ROLES = [
  { value: "", label: "—" },
  { value: "peaceful", label: "Мирный" },
  { value: "mafia", label: "Мафия" },
  { value: "don", label: "Дон" },
  { value: "sheriff", label: "Шериф" },
];

export default function GameSessionPage() {
  const { id } = useParams();
  const { me } = useAuth();
  const [s, setS] = useState<Session | null>(null);
  const [err, setErr] = useState("");
  const [nomText, setNomText] = useState("1,2,3");
  const [voteParts, setVoteParts] = useState<Record<string, string>>({});
  const [shootTarget, setShootTarget] = useState("");
  const [shootMiss, setShootMiss] = useState(false);
  const [testSeats, setTestSeats] = useState(["", "", ""]);
  const [completeWord, setCompleteWord] = useState("");
  const [prepSeats, setPrepSeats] = useState<
    { player_id: number; seat_number: number }[]
  >([]);
  const [eveningPlayers, setEveningPlayers] = useState<
    { id: number; player: { id: number; nickname: string } }[]
  >([]);
  const [protestsLocal, setProtestsLocal] = useState("");

  const load = useCallback(async () => {
    const data = await apiJson<Session>(`/sessions/${id}/`);
    setS(data);
    const incomplete = data.voting_rounds
      .filter((v) => !v.completed)
      .sort((a, b) => a.index - b.index)[0];
    if (incomplete?.nominations?.length) {
      setNomText(incomplete.nominations.join(","));
      const votes: Record<string, string> = {};
      const noms = incomplete.nominations;
      for (let i = 0; i < noms.length - 1; i++) {
        const seat = noms[i];
        votes[String(seat)] = String(incomplete.votes[String(seat)] ?? "");
      }
      setVoteParts(votes);
    }
  }, [id]);

  useEffect(() => {
    void load().catch((e) => setErr(String(e)));
  }, [load]);

  useEffect(() => {
    if (s?.protests !== undefined) setProtestsLocal(s.protests);
  }, [s?.protests]);

  useEffect(() => {
    if (!s || s.stage !== "prep") return;
    if (prepSeats.length) return;
    if (s.players.length) {
      setPrepSeats(
        s.players.map((p) => ({
          player_id: p.player,
          seat_number: p.seat_number,
        })),
      );
    }
  }, [s, prepSeats.length]);

  useEffect(() => {
    if (!s || s.stage !== "prep" || !s.evening_id) return;
    if (s.players.length) return;
    void (async () => {
      try {
        const ep = await apiJson<
          { id: number; player: { id: number; nickname: string } }[]
        >(`/evenings/${s.evening_id}/players/`);
        setEveningPlayers(ep);
      } catch {
        setEveningPlayers([]);
      }
    })();
  }, [s]);

  const stageLabel = useMemo(() => {
    if (!s) return "";
    const m: Record<string, string> = {
      prep: "Подготовка",
      voting: "Голосование",
      revoting: "Переголосование",
      lift_pending: "Поднятие",
      shooting: "Стрельба",
      testament: "Завещание",
      post_edit: "После игры",
    };
    return m[s.stage] || s.stage;
  }, [s]);

  async function call(path: string, body?: unknown) {
    setErr("");
    try {
      await apiJson(`/sessions/${id}/${path}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  }

  async function patchSession(body: Record<string, unknown>) {
    setErr("");
    try {
      await apiJson(`/sessions/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  }

  async function patchPlayer(gspId: number, body: Record<string, unknown>) {
    setErr("");
    try {
      await apiJson(`/sessions/${id}/players/${gspId}/`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  }

  async function applyPrep() {
    await call("set_players/", { players: prepSeats });
  }

  function submitVotes() {
    const nominations = nomText
      .split(/[,\s]+/)
      .map((x) => parseInt(x.trim(), 10))
      .filter((x) => !Number.isNaN(x));
    const votes: Record<string, number> = {};
    for (const k of Object.keys(voteParts)) {
      const v = parseInt(voteParts[k], 10);
      if (!Number.isNaN(v)) votes[k] = v;
    }
    return call("votes/", { nominations, votes });
  }

  if (!s) {
    return (
      <div className="shell">
        <p>{err || "Загрузка…"}</p>
      </div>
    );
  }

  return (
    <div className="shell" style={{ maxWidth: 800, paddingTop: 0 }}>
      <TimerBar />
      <header style={{ marginTop: 8 }}>
        <Link
          to={`/evening/${s.evening_id}`}
          className="muted"
          style={{ fontSize: "0.85rem" }}
        >
          ← К вечеру
        </Link>
        <h1 style={{ fontSize: "1.1rem", margin: "6px 0 0" }}>
          {s.evening_title} · {s.evening_date}
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          Стол {s.table_name} · Игра {s.game_number} · {stageLabel}
        </p>
      </header>

      {err && (
        <p style={{ color: "var(--danger)", margin: "8px 0" }} role="alert">
          {err}
        </p>
      )}

      <section className="card stack" style={{ marginTop: 10 }}>
        <strong>Игроки</strong>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.9rem",
            }}
          >
            <thead>
              <tr>
                <th>#</th>
                <th>Ник</th>
                <th>Фолы</th>
                <th>Баллы</th>
                <th>Доп</th>
                <th>Роль</th>
              </tr>
            </thead>
            <tbody>
              {[...s.players]
                .sort((a, b) => a.seat_number - b.seat_number)
                .map((p) => (
                  <tr
                    key={p.id}
                    className={
                      p.eliminated || p.excluded_by_fouls
                        ? "eliminated"
                        : undefined
                    }
                  >
                    <td>{p.seat_number}</td>
                    <td>{p.nickname}</td>
                    <td>
                      {s.stage === "post_edit" && !me?.is_staff ? (
                        p.fouls
                      ) : (
                        <button
                          type="button"
                          className="btn"
                          onClick={() =>
                            void call("foul/", { seat_number: p.seat_number })
                          }
                        >
                          +фол ({p.fouls})
                        </button>
                      )}
                    </td>
                    <td>{p.points}</td>
                    <td>{p.extra_points}</td>
                    <td>
                      {s.stage === "post_edit" ? (
                        <select
                          value={p.role}
                          onChange={(e) =>
                            void patchPlayer(p.id, { role: e.target.value })
                          }
                        >
                          {ROLES.map((r) => (
                            <option key={r.value || "empty"} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        ROLES.find((r) => r.value === p.role)?.label || "—"
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {s.stage === "prep" && (
        <section className="card stack" style={{ marginTop: 12 }}>
          <p className="muted">
            Назначьте места 1–10 и сохраните состав, затем «Старт».
          </p>
          {s.players.length === 0 && eveningPlayers.length > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() =>
                setPrepSeats(
                  eveningPlayers.map((ep, i) => ({
                    player_id: ep.player.id,
                    seat_number: i + 1,
                  })),
                )
              }
            >
              Взять всех игроков вечера
            </button>
          )}
          {prepSeats.map((row, idx) => (
            <div key={idx} className="row">
              <span>
                {eveningPlayers.find((e) => e.player.id === row.player_id)
                  ?.player.nickname || `Игрок ${row.player_id}`}
              </span>
              <input
                type="number"
                min={1}
                max={10}
                value={row.seat_number}
                onChange={(e) => {
                  const n = [...prepSeats];
                  n[idx] = { ...row, seat_number: Number(e.target.value) };
                  setPrepSeats(n);
                }}
                style={{ maxWidth: 80 }}
              />
            </div>
          ))}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void applyPrep()}
          >
            Сохранить состав
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void call("start/")}
          >
            Начать игру
          </button>
        </section>
      )}

      {(s.stage === "voting" || s.stage === "revoting") && (
        <section className="card stack" style={{ marginTop: 12 }}>
          <strong>Голосование</strong>
          <label>
            <span className="muted">
              Номинированные (через запятую, последний — авто-голоса)
            </span>
            <input
              value={nomText}
              onChange={(e) => setNomText(e.target.value)}
            />
          </label>
          {nomText
            .split(/[,\s]+/)
            .map((x) => parseInt(x.trim(), 10))
            .filter((x) => !Number.isNaN(x))
            .map((seat) => {
              console.log(seat);
              return (
                <label key={seat}>
                  Голоса за место {seat}
                  <input
                    value={voteParts[String(seat)] ?? ""}
                    onChange={(e) =>
                      setVoteParts((v) => ({
                        ...v,
                        [String(seat)]: e.target.value,
                      }))
                    }
                  />
                </label>
              );
            })}
          <div className="row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void submitVotes()}
            >
              Записать голоса
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void call("votes/complete/")}
            >
              Завершить голосование
            </button>
          </div>
        </section>
      )}

      {s.stage === "lift_pending" && (
        <section className="card stack" style={{ marginTop: 12 }}>
          <strong>Поднятие</strong>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void call("lift/", { eliminate_all: true })}
          >
            Поднятие (все выбывают)
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void call("lift/", { eliminate_all: false })}
          >
            Завершить без поднятия (ничья)
          </button>
        </section>
      )}

      {s.stage === "shooting" && (
        <section className="card stack" style={{ marginTop: 12 }}>
          <strong>Стрельба</strong>
          <label>
            <input
              type="checkbox"
              checked={shootMiss}
              onChange={(e) => setShootMiss(e.target.checked)}
            />{" "}
            Промах (X)
          </label>
          {!shootMiss && (
            <label>
              Место цели
              <input
                value={shootTarget}
                onChange={(e) => setShootTarget(e.target.value)}
              />
            </label>
          )}
          <div className="row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                void call("shooting/", {
                  target_seat: shootMiss
                    ? null
                    : parseInt(shootTarget, 10) || null,
                  is_miss: shootMiss,
                })
              }
            >
              Записать выстрел
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void call("shooting/complete/")}
            >
              Завершить стрельбу
            </button>
          </div>
        </section>
      )}

      {s.stage === "testament" && (
        <section className="card stack" style={{ marginTop: 12 }}>
          <strong>Завещание (3 номера)</strong>
          {testSeats.map((v, i) => (
            <input
              key={i}
              value={v}
              onChange={(e) => {
                const n = [...testSeats];
                n[i] = e.target.value;
                setTestSeats(n);
              }}
            />
          ))}
          <div className="row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                void call("testament/", {
                  seats: testSeats
                    .map((x) => parseInt(x, 10))
                    .filter((x) => !Number.isNaN(x)),
                })
              }
            >
              Сохранить
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void call("testament/complete/")}
            >
              Завершить завещание
            </button>
          </div>
        </section>
      )}

      {s.stage !== "prep" && s.stage !== "post_edit" && (
        <section className="card stack" style={{ marginTop: 12 }}>
          <strong>Завершить партию</strong>
          <label>
            Введите слово «завершить»
            <input
              value={completeWord}
              onChange={(e) => setCompleteWord(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void call("complete_game/", { word: completeWord })}
          >
            Завершить игру
          </button>
        </section>
      )}

      {s.stage === "post_edit" && (
        <section className="card stack" style={{ marginTop: 12 }}>
          <strong>Итог</strong>
          <select
            value={s.winner}
            onChange={(e) => void patchSession({ winner: e.target.value })}
          >
            <option value="">—</option>
            {WINNERS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
          <label>
            Протесты / заметки
            <textarea
              value={protestsLocal}
              onChange={(e) => setProtestsLocal(e.target.value)}
              onBlur={() => void patchSession({ protests: protestsLocal })}
              rows={3}
            />
          </label>
        </section>
      )}

      <p style={{ marginTop: 16 }}>
        <a
          className="btn"
          href={`/api/sessions/${id}/export.pdf`}
          target="_blank"
          rel="noreferrer"
        >
          PDF бланка
        </a>
      </p>
    </div>
  );
}
