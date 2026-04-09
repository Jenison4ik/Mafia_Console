from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class User(AbstractUser):
    """Администратор — is_staff; обычный пользователь для демо."""

    display_name = models.CharField("отображаемое имя", max_length=150, blank=True)
    login_code = models.CharField("код входа", max_length=32, blank=True)

    class Meta:
        verbose_name = "пользователь"
        verbose_name_plural = "пользователи"


class GlobalSettings(models.Model):
    singleton_id = models.PositiveSmallIntegerField(default=1, unique=True, editable=False)
    default_price_per_game = models.DecimalField(
        "цена за игру по умолчанию (₽)", max_digits=10, decimal_places=2, default=0
    )

    class Meta:
        verbose_name = "глобальные настройки"

    def save(self, *args, **kwargs):
        self.singleton_id = 1
        super().save(*args, **kwargs)

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(singleton_id=1)
        return obj


class Player(models.Model):
    first_name = models.CharField("имя", max_length=120)
    nickname = models.CharField("никнейм", max_length=120, db_index=True)
    phone = models.CharField("телефон", max_length=40, blank=True)
    social_url = models.URLField("соцсеть", blank=True)

    class Meta:
        verbose_name = "игрок"
        verbose_name_plural = "игроки"
        ordering = ["nickname"]

    def __str__(self):
        return f"{self.first_name}-{self.nickname}"


class GameTable(models.Model):
    name = models.CharField("название стола", max_length=64)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "стол"
        verbose_name_plural = "столы"
        ordering = ["sort_order", "id"]


class Evening(models.Model):
    class EventType(models.TextChoices):
        REGULAR = "regular", "Обычный"
        TOURNAMENT = "tournament", "Турнир"

    name = models.CharField("название", max_length=200, blank=True)
    event_date = models.DateField("дата")
    event_type = models.CharField(
        max_length=20, choices=EventType.choices, default=EventType.REGULAR
    )
    price_per_game = models.DecimalField(
        "цена за игру (₽), только для обычного",
        max_digits=10,
        decimal_places=2,
        default=0,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "вечер"
        verbose_name_plural = "вечера"
        ordering = ["-event_date", "-id"]

    def effective_price(self):
        if self.event_type == self.EventType.TOURNAMENT:
            return 0
        return self.price_per_game


class EveningPlayer(models.Model):
    evening = models.ForeignKey(Evening, on_delete=models.CASCADE, related_name="evening_players")
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name="evening_links")
    games_played = models.PositiveSmallIntegerField(default=0)
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        unique_together = [("evening", "player")]
        verbose_name = "игрок вечера"
        verbose_name_plural = "игроки вечера"


class Game(models.Model):
    evening = models.ForeignKey(Evening, on_delete=models.CASCADE, related_name="games")
    game_number = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])

    class Meta:
        unique_together = [("evening", "game_number")]
        ordering = ["game_number"]


class GameSession(models.Model):
    class Stage(models.TextChoices):
        PREP = "prep", "Подготовка"
        VOTING = "voting", "Голосование"
        REVOTING = "revoting", "Переголосование"
        LIFT_PENDING = "lift_pending", "Поднятие"
        SHOOTING = "shooting", "Стрельба"
        TESTAMENT = "testament", "Завещание"
        POST_EDIT = "post_edit", "Редактирование после игры"

    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="sessions")
    table = models.ForeignKey(GameTable, on_delete=models.PROTECT, related_name="sessions")
    stage = models.CharField(max_length=20, choices=Stage.choices, default=Stage.PREP)
    leader = models.ForeignKey(
        Player,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="led_sessions",
    )
    started_at = models.DateTimeField(null=True, blank=True)
    first_blood_done = models.BooleanField(default=False)
    post_edit_unlocked = models.BooleanField(default=False)
    winner = models.CharField(max_length=40, blank=True)
    judge_signature_note = models.CharField(max_length=200, blank=True)
    protests = models.TextField(blank=True)
    version = models.PositiveIntegerField(default=1)
    payment_counted = models.BooleanField(default=False)

    class Meta:
        unique_together = [("game", "table")]
        ordering = ["game_id", "table_id"]


class GameSessionPlayer(models.Model):
    class Role(models.TextChoices):
        EMPTY = "", "—"
        PEACEFUL = "peaceful", "Мирный"
        MAFIA = "mafia", "Мафия"
        DON = "don", "Дон"
        SHERIFF = "sheriff", "Шериф"

    session = models.ForeignKey(GameSession, on_delete=models.CASCADE, related_name="players")
    player = models.ForeignKey(Player, on_delete=models.CASCADE)
    seat_number = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(10)]
    )
    fouls = models.PositiveSmallIntegerField(default=0, validators=[MaxValueValidator(4)])
    points = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    extra_points = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.EMPTY, blank=True)
    eliminated = models.BooleanField(default=False)
    excluded_by_fouls = models.BooleanField(default=False)

    class Meta:
        unique_together = [("session", "seat_number"), ("session", "player")]
        ordering = ["seat_number"]


class VotingRound(models.Model):
    class Kind(models.TextChoices):
        MAIN = "main", "Основное"
        REVOTE = "revote", "Переголосование"

    session = models.ForeignKey(GameSession, on_delete=models.CASCADE, related_name="voting_rounds")
    index = models.PositiveSmallIntegerField()
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.MAIN)
    nominations = models.JSONField(default=list)
    votes = models.JSONField(default=dict)
    is_tie = models.BooleanField(default=False)
    eliminated_seat = models.PositiveSmallIntegerField(null=True, blank=True)
    completed = models.BooleanField(default=False)

    class Meta:
        unique_together = [("session", "index")]
        ordering = ["index"]


class ShootingRound(models.Model):
    session = models.ForeignKey(GameSession, on_delete=models.CASCADE, related_name="shooting_rounds")
    index = models.PositiveSmallIntegerField()
    target_seat = models.PositiveSmallIntegerField(null=True, blank=True)
    is_miss = models.BooleanField(default=False)
    completed = models.BooleanField(default=False)

    class Meta:
        unique_together = [("session", "index")]
        ordering = ["index"]


class TestamentEntry(models.Model):
    session = models.OneToOneField(GameSession, on_delete=models.CASCADE, related_name="testament")
    seats = models.JSONField(default=list)
    completed = models.BooleanField(default=False)


class AuditLog(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="audit_logs"
    )
    action = models.CharField(max_length=120)
    entity = models.CharField(max_length=80, blank=True)
    entity_id = models.PositiveIntegerField(null=True, blank=True)
    payload = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
