from decimal import Decimal

from rest_framework import serializers

from mafia.models import (
    Evening,
    EveningPlayer,
    Game,
    GameSession,
    GameSessionPlayer,
    GameTable,
    GlobalSettings,
    Player,
    ShootingRound,
    User,
    VotingRound,
)


class UserBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "display_name", "is_staff")


class LoginSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()
    code = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        try:
            user = User.objects.get(pk=attrs["user_id"])
        except User.DoesNotExist as e:
            raise serializers.ValidationError("Пользователь не найден") from e
        code = (attrs.get("code") or "").strip()
        if user.login_code:
            if code != user.login_code:
                raise serializers.ValidationError("Неверный код")
        elif code and not user.check_password(code):
            raise serializers.ValidationError("Неверный код")
        attrs["user"] = user
        return attrs


class PlayerSerializer(serializers.ModelSerializer):
    display_label = serializers.SerializerMethodField()

    class Meta:
        model = Player
        fields = (
            "id",
            "first_name",
            "nickname",
            "phone",
            "social_url",
            "display_label",
        )

    def get_display_label(self, obj):
        return f"{obj.first_name}-{obj.nickname}"


class GameTableSerializer(serializers.ModelSerializer):
    class Meta:
        model = GameTable
        fields = ("id", "name", "sort_order")


class GlobalSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = GlobalSettings
        fields = ("default_price_per_game",)


class EveningSerializer(serializers.ModelSerializer):
    display_title = serializers.SerializerMethodField()
    effective_price = serializers.SerializerMethodField()

    class Meta:
        model = Evening
        fields = (
            "id",
            "name",
            "event_date",
            "event_type",
            "price_per_game",
            "display_title",
            "effective_price",
            "created_at",
        )
        read_only_fields = ("created_at",)

    def get_display_title(self, obj):
        from mafia.utils import evening_display_title

        return evening_display_title(obj)

    def get_effective_price(self, obj):
        return str(obj.effective_price())


class EveningPlayerSerializer(serializers.ModelSerializer):
    player = PlayerSerializer(read_only=True)
    player_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(), source="player", write_only=True
    )

    class Meta:
        model = EveningPlayer
        fields = ("id", "player", "player_id", "games_played", "paid_amount")


class GameSessionPlayerSerializer(serializers.ModelSerializer):
    nickname = serializers.CharField(source="player.nickname", read_only=True)

    class Meta:
        model = GameSessionPlayer
        fields = (
            "id",
            "player",
            "nickname",
            "seat_number",
            "fouls",
            "points",
            "extra_points",
            "role",
            "eliminated",
            "excluded_by_fouls",
        )


class VotingRoundSerializer(serializers.ModelSerializer):
    class Meta:
        model = VotingRound
        fields = (
            "id",
            "index",
            "kind",
            "nominations",
            "votes",
            "is_tie",
            "eliminated_seat",
            "completed",
        )


class ShootingRoundSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShootingRound
        fields = (
            "id",
            "index",
            "target_seat",
            "is_miss",
            "completed",
        )


class GameSessionDetailSerializer(serializers.ModelSerializer):
    players = GameSessionPlayerSerializer(many=True, read_only=True)
    voting_rounds = VotingRoundSerializer(many=True, read_only=True)
    shooting_rounds = ShootingRoundSerializer(many=True, read_only=True)
    testament_seats = serializers.SerializerMethodField()
    testament_completed = serializers.SerializerMethodField()
    leader = serializers.PrimaryKeyRelatedField(read_only=True)
    table_name = serializers.CharField(source="table.name", read_only=True)
    game_number = serializers.IntegerField(source="game.game_number", read_only=True)
    evening_title = serializers.SerializerMethodField()
    evening_date = serializers.DateField(source="game.evening.event_date", read_only=True)
    evening_id = serializers.IntegerField(source="game.evening_id", read_only=True)

    class Meta:
        model = GameSession
        fields = (
            "id",
            "game",
            "table",
            "table_name",
            "game_number",
            "evening_title",
            "evening_date",
            "evening_id",
            "stage",
            "leader",
            "started_at",
            "first_blood_done",
            "post_edit_unlocked",
            "winner",
            "judge_signature_note",
            "protests",
            "version",
            "players",
            "voting_rounds",
            "shooting_rounds",
            "testament_seats",
            "testament_completed",
        )

    def get_testament_seats(self, obj):
        te = getattr(obj, "testament", None)
        return te.seats if te else []

    def get_testament_completed(self, obj):
        te = getattr(obj, "testament", None)
        return te.completed if te else False

    def get_evening_title(self, obj):
        from mafia.utils import evening_display_title

        return evening_display_title(obj.game.evening)


class GameSessionWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = GameSession
        fields = ("winner", "judge_signature_note", "protests")


class GameBriefSerializer(serializers.ModelSerializer):
    session_ids = serializers.SerializerMethodField()

    class Meta:
        model = Game
        fields = ("id", "evening", "game_number", "session_ids")

    def get_session_ids(self, obj):
        return list(obj.sessions.values_list("id", flat=True))


class GameSessionPlayerPatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = GameSessionPlayer
        fields = ("seat_number", "fouls", "points", "extra_points", "role")

    def validate(self, attrs):
        session = self.instance.session
        if "role" in attrs and session.stage != GameSession.Stage.POST_EDIT:
            raise serializers.ValidationError({"role": "Роли доступны после завершения игры"})
        if "fouls" in attrs:
            if session.stage == GameSession.Stage.POST_EDIT and not self.context["request"].user.is_staff:
                raise serializers.ValidationError(
                    {"fouls": "После игры фолы может менять только администратор"}
                )
        return attrs
