"""Бизнес-логика стадий бланка игры."""

from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import F, Max
from django.utils import timezone

from mafia.models import (
    EveningPlayer,
    GameSession,
    GameSessionPlayer,
    ShootingRound,
    TestamentEntry,
    VotingRound,
)


COMPLETION_WORD = "завершить"


def _live_seats(session: GameSession) -> int:
    return (
        session.players.filter(eliminated=False, excluded_by_fouls=False).count()
    )


def _compute_last_votes(nominations: list[int], votes: dict[str, Any], live: int) -> dict[str, int]:
    """Дополняет голоса: последний номинированный получает остаток."""
    out = {str(n): int(votes.get(str(n), votes.get(n, 0))) for n in nominations[:-1]}
    sum_others = sum(out.values())
    last = nominations[-1]
    out[str(last)] = max(0, live - sum_others)
    return out


def _max_vote_seats(votes: dict[str, int]) -> tuple[list[int], bool]:
    if not votes:
        return [], True
    mx = max(votes.values())
    leaders = [int(k) for k, v in votes.items() if v == mx]
    tie = len(leaders) > 1
    return leaders, tie


def add_foul(session: GameSession, seat_number: int, user) -> GameSessionPlayer:
    gsp = GameSessionPlayer.objects.get(session=session, seat_number=seat_number)
    if session.stage == GameSession.Stage.POST_EDIT and not user.is_staff:
        raise PermissionError("Фолы после игры может менять только администратор")
    if gsp.fouls >= 4:
        return gsp
    gsp.fouls += 1
    if gsp.fouls >= 4:
        gsp.extra_points = Decimal(str(gsp.extra_points)) - Decimal("0.7")
        gsp.excluded_by_fouls = True
        gsp.eliminated = True
    gsp.save()
    session.version += 1
    session.save(update_fields=["version"])
    return gsp


def start_game(session: GameSession) -> GameSession:
    if session.stage != GameSession.Stage.PREP:
        raise ValueError("Игра уже начата")
    if not session.players.exists():
        raise ValueError("Нет игроков")
    session.started_at = timezone.now()
    session.stage = GameSession.Stage.VOTING
    session.version += 1
    session.save(update_fields=["started_at", "stage", "version"])
    VotingRound.objects.create(session=session, index=1, kind=VotingRound.Kind.MAIN)
    return session


def submit_votes_for_current_round(
    session: GameSession, nominations: list[int], votes_input: dict[str, int]
) -> VotingRound:
    if session.stage not in (
        GameSession.Stage.VOTING,
        GameSession.Stage.REVOTING,
    ):
        raise ValueError("Сейчас не стадия голосования")
    rnd = session.voting_rounds.filter(completed=False).order_by("index").first()
    if not rnd:
        raise ValueError("Нет активного раунда голосования")
    live = _live_seats(session)
    if len(nominations) < 1:
        raise ValueError("Нужен хотя бы один номинированный")
    full_votes = _compute_last_votes(nominations, votes_input, live)
    rnd.nominations = nominations
    rnd.votes = full_votes
    mx_seats, tie = _max_vote_seats({k: int(v) for k, v in full_votes.items()})
    rnd.is_tie = tie
    rnd.save()
    session.version += 1
    session.save(update_fields=["version"])
    return rnd


def complete_voting_round(session: GameSession) -> GameSession:
    rnd = session.voting_rounds.filter(completed=False).order_by("index").first()
    if not rnd:
        raise ValueError("Нет незавершённого голосования")
    if session.stage == GameSession.Stage.VOTING:
        return _complete_main_vote(session, rnd)
    if session.stage == GameSession.Stage.REVOTING:
        return _complete_revote(session, rnd)
    raise ValueError("Неверная стадия")


def _eliminate_seat(session: GameSession, seat: int) -> None:
    gsp = GameSessionPlayer.objects.get(session=session, seat_number=seat)
    gsp.eliminated = True
    gsp.save(update_fields=["eliminated"])


def _complete_main_vote(session: GameSession, rnd: VotingRound) -> GameSession:
    votes = {int(k): v for k, v in rnd.votes.items()}
    _, tie = _max_vote_seats(votes)
    if tie:
        rnd.completed = True
        rnd.is_tie = True
        rnd.save()
        session.stage = GameSession.Stage.REVOTING
        session.version += 1
        session.save(update_fields=["stage", "version"])
        next_idx = session.voting_rounds.aggregate(m=Max("index"))["m"] or 0
        VotingRound.objects.create(
            session=session, index=next_idx + 1, kind=VotingRound.Kind.REVOTE
        )
        return session
    mx = max(votes.values())
    leaders = [s for s, vv in votes.items() if vv == mx]
    eliminated = leaders[0]
    rnd.eliminated_seat = eliminated
    rnd.is_tie = False
    rnd.completed = True
    rnd.save()
    _eliminate_seat(session, eliminated)
    session.stage = GameSession.Stage.SHOOTING
    session.version += 1
    session.save(update_fields=["stage", "version"])
    ShootingRound.objects.create(session=session, index=_next_shooting_index(session))
    return session


def _next_shooting_index(session: GameSession) -> int:
    return (session.shooting_rounds.aggregate(m=Max("index"))["m"] or 0) + 1


def _complete_revote(session: GameSession, rnd: VotingRound) -> GameSession:
    votes = {int(k): v for k, v in rnd.votes.items()}
    _, tie = _max_vote_seats(votes)
    if tie:
        rnd.completed = True
        rnd.is_tie = True
        rnd.save()
        session.stage = GameSession.Stage.LIFT_PENDING
        session.version += 1
        session.save(update_fields=["stage", "version"])
        return session
    mx = max(votes.values())
    leaders = [s for s, vv in votes.items() if vv == mx]
    eliminated = leaders[0]
    rnd.eliminated_seat = eliminated
    rnd.is_tie = False
    rnd.completed = True
    rnd.save()
    _eliminate_seat(session, eliminated)
    session.stage = GameSession.Stage.SHOOTING
    session.version += 1
    session.save(update_fields=["stage", "version"])
    ShootingRound.objects.create(session=session, index=_next_shooting_index(session))
    return session


def resolve_lift(session: GameSession, eliminate_all_nominated: bool) -> GameSession:
    if session.stage != GameSession.Stage.LIFT_PENDING:
        raise ValueError("Нет ожидания поднятия")
    rnd = session.voting_rounds.order_by("-index").first()
    if not rnd:
        raise ValueError("Нет раунда")
    rnd.completed = True
    rnd.save()
    noms = rnd.nominations or []
    if eliminate_all_nominated:
        for seat in noms:
            try:
                _eliminate_seat(session, int(seat))
            except GameSessionPlayer.DoesNotExist:
                pass
    session.stage = GameSession.Stage.SHOOTING
    session.version += 1
    session.save(update_fields=["stage", "version"])
    ShootingRound.objects.create(session=session, index=_next_shooting_index(session))
    return session


def submit_shooting(session: GameSession, target_seat: int | None, is_miss: bool) -> GameSession:
    if session.stage != GameSession.Stage.SHOOTING:
        raise ValueError("Не стадия стрельбы")
    sr = session.shooting_rounds.filter(completed=False).order_by("index").first()
    if not sr:
        raise ValueError("Нет раунда стрельбы")
    sr.target_seat = target_seat
    sr.is_miss = bool(is_miss)
    sr.save()
    return session


def complete_shooting_round(session: GameSession) -> GameSession:
    sr = session.shooting_rounds.filter(completed=False).order_by("index").first()
    if not sr:
        raise ValueError("Нет стрельбы")
    sr.completed = True
    if not sr.is_miss and sr.target_seat:
        gsp = GameSessionPlayer.objects.get(session=session, seat_number=sr.target_seat)
        gsp.eliminated = True
        gsp.save(update_fields=["eliminated"])
        if not session.first_blood_done:
            session.first_blood_done = True
            session.stage = GameSession.Stage.TESTAMENT
            session.version += 1
            session.save(update_fields=["first_blood_done", "stage", "version"])
            TestamentEntry.objects.get_or_create(session=session)
            sr.save()
            return session
    sr.save()
    session.stage = GameSession.Stage.VOTING
    session.version += 1
    session.save(update_fields=["stage", "version"])
    next_idx = (session.voting_rounds.aggregate(m=Max("index"))["m"] or 0) + 1
    VotingRound.objects.create(session=session, index=next_idx, kind=VotingRound.Kind.MAIN)
    return session


def submit_testament(session: GameSession, seats: list[int]) -> TestamentEntry:
    if session.stage != GameSession.Stage.TESTAMENT:
        raise ValueError("Нет завещания")
    te, _ = TestamentEntry.objects.get_or_create(session=session)
    te.seats = seats[:3]
    te.completed = False
    te.save()
    session.version += 1
    session.save(update_fields=["version"])
    return te


def complete_testament(session: GameSession) -> GameSession:
    te = getattr(session, "testament", None)
    if not te:
        raise ValueError("Нет завещания")
    te.completed = True
    te.save()
    session.stage = GameSession.Stage.VOTING
    session.version += 1
    session.save(update_fields=["stage", "version"])
    next_idx = (session.voting_rounds.aggregate(m=Max("index"))["m"] or 0) + 1
    VotingRound.objects.create(session=session, index=next_idx, kind=VotingRound.Kind.MAIN)
    return session


def try_complete_game(session: GameSession, word: str) -> GameSession:
    w = (word or "").strip().lower()
    if w != COMPLETION_WORD:
        raise ValueError("Нужно ввести слово «завершить»")
    if session.stage == GameSession.Stage.PREP:
        raise ValueError("Игра ещё не начата")
    if session.stage == GameSession.Stage.POST_EDIT:
        return session
    session.stage = GameSession.Stage.POST_EDIT
    session.post_edit_unlocked = True
    session.version += 1
    session.save(update_fields=["stage", "post_edit_unlocked", "version"])
    _increment_evening_games(session)
    return session


def _increment_evening_games(session: GameSession) -> None:
    if session.payment_counted:
        return
    evening = session.game.evening
    player_ids = session.players.values_list("player_id", flat=True)
    EveningPlayer.objects.filter(evening=evening, player_id__in=player_ids).update(
        games_played=F("games_played") + 1
    )
    session.payment_counted = True
    session.save(update_fields=["payment_counted"])


@transaction.atomic
def recalculate_payments(evening_id: int) -> None:
    from mafia.models import Evening

    ev = Evening.objects.get(pk=evening_id)
    price = ev.effective_price()
    for ep in EveningPlayer.objects.filter(evening=ev):
        ep.paid_amount = Decimal(price) * ep.games_played
        ep.save(update_fields=["paid_amount"])
