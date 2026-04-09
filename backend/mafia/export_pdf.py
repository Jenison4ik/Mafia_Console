"""PDF через WeasyPrint: полный контент для печати."""

from django.template.loader import render_to_string

from mafia.models import Evening, GameSession
from mafia.utils import evening_display_title


def _html_to_pdf(html: str) -> bytes:
    from weasyprint import HTML

    return HTML(string=html).write_pdf()


def render_session_pdf(session_id: int) -> bytes:
    session = (
        GameSession.objects.select_related("game__evening", "table", "leader")
        .prefetch_related("players__player", "voting_rounds", "shooting_rounds")
        .get(pk=session_id)
    )
    ev = session.game.evening
    html = render_to_string(
        "export/session.html",
        {
            "session": session,
            "evening": ev,
            "evening_title": evening_display_title(ev),
        },
    )
    return _html_to_pdf(html)


def render_evening_pdf(evening_id: int) -> bytes:
    evening = Evening.objects.prefetch_related("evening_players__player").get(pk=evening_id)
    sessions = (
        GameSession.objects.filter(game__evening=evening)
        .select_related("game", "table", "leader")
        .prefetch_related("players__player")
        .order_by("game__game_number", "table_id")
    )
    html = render_to_string(
        "export/evening.html",
        {
            "evening": evening,
            "evening_title": evening_display_title(evening),
            "sessions": sessions,
        },
    )
    return _html_to_pdf(html)
