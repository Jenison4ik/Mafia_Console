import calendar

from mafia.models import Evening


def evening_display_title(ev: Evening) -> str:
    if ev.name and ev.name.strip():
        return ev.name.strip()
    # локаль проще русскими вручную
    weekdays_ru = [
        "понедельник",
        "вторник",
        "среда",
        "четверг",
        "пятница",
        "суббота",
        "воскресенье",
    ]
    ru = weekdays_ru[ev.event_date.weekday()]
    return f"вечер {ru}"


def list_evening_split(now: date | None = None):
    """3 прошедших и 3 предстоящих относительно сегодня."""
    from django.utils import timezone

    today = now or timezone.localdate()
    past = (
        Evening.objects.filter(event_date__lt=today)
        .order_by("-event_date", "-id")[:3]
    )
    upcoming = (
        Evening.objects.filter(event_date__gte=today)
        .order_by("event_date", "id")[:3]
    )
    return list(past), list(upcoming)
