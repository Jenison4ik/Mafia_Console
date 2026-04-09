import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiJson } from "../api";
import { useAuth } from "../auth";
import { TimerBar } from "../components/TimerBar";
import "./GameSessionPage.css";

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

type PrepSeat = { player_id: number; seat_number: number };
type EveningPlayer = { id: number; player: { id: number; nickname: string } };

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

const STAGE_LABELS: Record<string, string> = {
  prep: "Подготовка",
  voting: "Голосование",
  revoting: "Переголосование",
  lift_pending: "Поднятие",
  shooting: "Стрельба",
  testament: "Завещание",
  post_edit: "После игры",
};

function parseSeatNumbers(text: string): number[] {
  return text
    .split(/[,\s]+/)
    .map((part) => parseInt(part.trim(), 10))
    .filter((seat) => !Number.isNaN(seat));
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ошибка";
}

export default function GameSessionPage() {
  const { id } = useParams();
  const { me } = useAuth();

  const [session, setSession] = useState<Session | null>(null);
  const [err, setErr] = useState("");

  const [nomText, setNomText] = useState("1,2,3");
  const [voteParts, setVoteParts] = useState<Record<string, string>>({});
  const [shootTarget, setShootTarget] = useState("");
  const [shootMiss, setShootMiss] = useState(false);
  const [testSeats, setTestSeats] = useState(["", "", ""]);
  const [completeWord, setCompleteWord] = useState("");

  const [prepSeats, setPrepSeats] = useState<PrepSeat[]>([]);
  const [eveningPlayers, setEveningPlayers] = useState<EveningPlayer[]>([]);
  const [protestsLocal, setProtestsLocal] = useState("");

  const stageLabel = useMemo(() => {
    if (!session) return "";
    return STAGE_LABELS[session.stage] ?? session.stage;
  }, [session]);

  const sortedPlayers = useMemo(
    () =>
      session ? [...session.players].sort((a, b) => a.seat_number - b.seat_number) : [],
    [session],
  );

  const nominationSeats = useMemo(() => parseSeatNumbers(nomText), [nomText]);

  const load = useCallback(async () => {
    const data = await apiJson<Session>(`/sessions/${id}/`);
    setSession(data);
    setProtestsLocal(data.protests);

    if (data.stage === "prep" && data.players.length > 0) {
      setPrepSeats((prev) =>
        prev.length > 0
          ? prev
          : data.players.map((player) => ({
              player_id: player.player,
              seat_number: player.seat_number,
            })),
      );
    }

    const incompleteVoting = data.voting_rounds
      .filter((round) => !round.completed)
      .sort((a, b) => a.index - b.index)[0];

    if (incompleteVoting?.nominations?.length) {
      setNomText(incompleteVoting.nominations.join(","));
      const initialVotes: Record<string, string> = {};
      for (const seat of incompleteVoting.nominations.slice(0, -1)) {
        initialVotes[String(seat)] = String(incompleteVoting.votes[String(seat)] ?? "");
      }
      setVoteParts(initialVotes);
    }
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load().catch((error) => setErr(String(error)));
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!session || session.stage !== "prep" || !session.evening_id) return;
    if (session.players.length > 0) return;

    void (async () => {
      try {
        const eveningList = await apiJson<EveningPlayer[]>(
          `/evenings/${session.evening_id}/players/`,
        );
        setEveningPlayers(eveningList);
      } catch {
        setEveningPlayers([]);
      }
    })();
  }, [session]);

  const call = useCallback(
    async (path: string, body?: unknown) => {
      setErr("");
      try {
        await apiJson(`/sessions/${id}/${path}`, {
          method: "POST",
          body: body ? JSON.stringify(body) : undefined,
        });
        await load();
      } catch (error) {
        setErr(toErrorMessage(error));
      }
    },
    [id, load],
  );

  const patchSession = useCallback(
    async (body: Record<string, unknown>) => {
      setErr("");
      try {
        await apiJson(`/sessions/${id}/`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        await load();
      } catch (error) {
        setErr(toErrorMessage(error));
      }
    },
    [id, load],
  );

  const patchPlayer = useCallback(
    async (gameSessionPlayerId: number, body: Record<string, unknown>) => {
      setErr("");
      try {
        await apiJson(`/sessions/${id}/players/${gameSessionPlayerId}/`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        await load();
      } catch (error) {
        setErr(toErrorMessage(error));
      }
    },
    [id, load],
  );

  const submitVotes = useCallback(async () => {
    const nominations = parseSeatNumbers(nomText).slice(0, -1);
    const votes: Record<string, number> = {};
    for (const [seat, textValue] of Object.entries(voteParts)) {
      const parsed = parseInt(textValue, 10);
      if (!Number.isNaN(parsed)) votes[seat] = parsed;
    }
    await call("votes/", { nominations, votes });
  }, [call, nomText, voteParts]);

  const submitPrepPlayers = useCallback(async () => {
    await call("set_players/", { players: prepSeats });
  }, [call, prepSeats]);

  if (!session) {
    return (
      <div className="shell">
        <p>{err || "Загрузка…"}</p>
      </div>
    );
  }

  return (
    <div className="shell game-session-shell">
      <TimerBar />

      <header className="game-session-header">
        <Link
          to={`/evening/${session.evening_id}`}
          className="muted game-session-back-link"
        >
          ← К вечеру
        </Link>
        <h1 className="game-session-title">
          {session.evening_title} · {session.evening_date}
        </h1>
        <p className="muted game-session-subtitle">
          Стол {session.table_name} · Игра {session.game_number} · {stageLabel}
        </p>
      </header>

      {err && (
        <p className="game-session-error" role="alert">
          {err}
        </p>
      )}

      <section className="card stack game-session-section-first">
        <strong>Игроки</strong>
        <div className="game-session-table-wrap">
          <table className="game-session-table">
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
              {sortedPlayers.map((player) => (
                <tr
                  key={player.id}
                  className={player.eliminated || player.excluded_by_fouls ? "eliminated" : undefined}
                >
                  <td>{player.seat_number}</td>
                  <td>{player.nickname}</td>
                  <td>
                    {session.stage === "post_edit" && !me?.is_staff ? (
                      player.fouls
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void call("foul/", { seat_number: player.seat_number })}
                      >
                        +фол ({player.fouls})
                      </button>
                    )}
                  </td>
                  <td>{player.points}</td>
                  <td>{player.extra_points}</td>
                  <td>
                    {session.stage === "post_edit" ? (
                      <select
                        value={player.role}
                        onChange={(event) => void patchPlayer(player.id, { role: event.target.value })}
                      >
                        {ROLES.map((role) => (
                          <option key={role.value || "empty"} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      ROLES.find((role) => role.value === player.role)?.label || "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {session.stage === "prep" && (
        <section className="card stack game-session-section">
          <p className="muted">Назначьте места 1-10 и сохраните состав, затем «Старт».</p>
          {session.players.length === 0 && eveningPlayers.length > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() =>
                setPrepSeats(
                  eveningPlayers.map((eveningPlayer, index) => ({
                    player_id: eveningPlayer.player.id,
                    seat_number: index + 1,
                  })),
                )
              }
            >
              Взять всех игроков вечера
            </button>
          )}
          {prepSeats.map((row, index) => (
            <div key={index} className="row">
              <span>
                {eveningPlayers.find((eveningPlayer) => eveningPlayer.player.id === row.player_id)?.player
                  .nickname || `Игрок ${row.player_id}`}
              </span>
              <input
                type="number"
                min={1}
                max={10}
                value={row.seat_number}
                onChange={(event) => {
                  const next = [...prepSeats];
                  next[index] = { ...row, seat_number: Number(event.target.value) };
                  setPrepSeats(next);
                }}
                className="game-session-seat-input"
              />
            </div>
          ))}
          <button type="button" className="btn btn-primary" onClick={() => void submitPrepPlayers()}>
            Сохранить состав
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void call("start/")}>
            Начать игру
          </button>
        </section>
      )}

      {(session.stage === "voting" || session.stage === "revoting") && (
        <section className="card stack game-session-section">
          <strong>Голосование</strong>
          <label>
            <span className="muted">Номинированные (через запятую, последний - авто-голоса)</span>
            <input value={nomText} onChange={(event) => setNomText(event.target.value)} />
          </label>
          {nominationSeats.map((seat) => (
            <label key={seat}>
              Голоса за место {seat}
              <input
                value={voteParts[String(seat)] ?? ""}
                onChange={(event) =>
                  setVoteParts((prev) => ({
                    ...prev,
                    [String(seat)]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => void submitVotes()}>
              Записать голоса
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void call("votes/complete/")}>
              Завершить голосование
            </button>
          </div>
        </section>
      )}

      {session.stage === "lift_pending" && (
        <section className="card stack game-session-section">
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

      {session.stage === "shooting" && (
        <section className="card stack game-session-section">
          <strong>Стрельба</strong>
          <label>
            <input
              type="checkbox"
              checked={shootMiss}
              onChange={(event) => setShootMiss(event.target.checked)}
            />{" "}
            Промах (X)
          </label>
          {!shootMiss && (
            <label>
              Место цели
              <input value={shootTarget} onChange={(event) => setShootTarget(event.target.value)} />
            </label>
          )}
          <div className="row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                void call("shooting/", {
                  target_seat: shootMiss ? null : parseInt(shootTarget, 10) || null,
                  is_miss: shootMiss,
                })
              }
            >
              Записать выстрел
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void call("shooting/complete/")}>
              Завершить стрельбу
            </button>
          </div>
        </section>
      )}

      {session.stage === "testament" && (
        <section className="card stack game-session-section">
          <strong>Завещание (3 номера)</strong>
          {testSeats.map((value, index) => (
            <input
              key={index}
              value={value}
              onChange={(event) => {
                const next = [...testSeats];
                next[index] = event.target.value;
                setTestSeats(next);
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
                    .map((value) => parseInt(value, 10))
                    .filter((seat) => !Number.isNaN(seat)),
                })
              }
            >
              Сохранить
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void call("testament/complete/")}>
              Завершить завещание
            </button>
          </div>
        </section>
      )}

      {session.stage !== "prep" && session.stage !== "post_edit" && (
        <section className="card stack game-session-section">
          <strong>Завершить партию</strong>
          <label>
            Введите слово «завершить»
            <input value={completeWord} onChange={(event) => setCompleteWord(event.target.value)} />
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

      {session.stage === "post_edit" && (
        <section className="card stack game-session-section">
          <strong>Итог</strong>
          <select value={session.winner} onChange={(event) => void patchSession({ winner: event.target.value })}>
            <option value="">—</option>
            {WINNERS.map((winner) => (
              <option key={winner.value} value={winner.value}>
                {winner.label}
              </option>
            ))}
          </select>
          <label>
            Протесты / заметки
            <textarea
              value={protestsLocal}
              onChange={(event) => setProtestsLocal(event.target.value)}
              onBlur={() => void patchSession({ protests: protestsLocal })}
              rows={3}
            />
          </label>
        </section>
      )}

      <p className="game-session-export">
        <a className="btn" href={`/api/sessions/${id}/export.pdf`} target="_blank" rel="noreferrer">
          PDF бланка
        </a>
      </p>
    </div>
  );
}
