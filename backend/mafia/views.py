from django.contrib.auth import login, logout
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from mafia.audit import log_action
from mafia.models import (
    Evening,
    EveningPlayer,
    Game,
    GameSession,
    GameSessionPlayer,
    GameTable,
    GlobalSettings,
    Player,
    User,
)
from mafia.serializers import (
    EveningPlayerSerializer,
    EveningSerializer,
    GameBriefSerializer,
    GameSessionDetailSerializer,
    GameSessionPlayerPatchSerializer,
    GameSessionWriteSerializer,
    GameTableSerializer,
    GlobalSettingsSerializer,
    LoginSerializer,
    PlayerSerializer,
    UserBriefSerializer,
)
from mafia.services import game_session as gs
from mafia.utils import list_evening_split
from mafia.export_pdf import render_evening_pdf, render_session_pdf


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfCookieView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"ok": True})


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        ser = LoginSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = ser.validated_data["user"]
        login(request, user)
        log_action(user, "login", "user", user.id)
        return Response(UserBriefSerializer(user).data)


class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response({"ok": True})


class MeView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        if request.user.is_authenticated:
            return Response(UserBriefSerializer(request.user).data)
        return Response(None)


class UserListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        users = User.objects.all().order_by("id")
        return Response(UserBriefSerializer(users, many=True).data)


class PlayerViewSet(viewsets.ModelViewSet):
    queryset = Player.objects.all()
    serializer_class = PlayerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(first_name__icontains=q) | Q(nickname__icontains=q))
        return qs


class GameTableViewSet(viewsets.ModelViewSet):
    queryset = GameTable.objects.all()
    serializer_class = GameTableSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsAdminUser()]


class GlobalSettingsView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        s = GlobalSettings.get_solo()
        return Response(GlobalSettingsSerializer(s).data)

    def patch(self, request):
        s = GlobalSettings.get_solo()
        ser = GlobalSettingsSerializer(s, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        log_action(request.user, "settings_update", "GlobalSettings", s.id)
        return Response(ser.data)


class EveningSummaryView(APIView):
    def get(self, request):
        past, upcoming = list_evening_split()
        return Response(
            {
                "past": EveningSerializer(past, many=True).data,
                "upcoming": EveningSerializer(upcoming, many=True).data,
            }
        )


class EveningArchiveView(APIView):
    def get(self, request):
        q = request.query_params.get("q", "").strip()
        date_s = request.query_params.get("date")
        qs = Evening.objects.all()
        if q:
            qs = qs.filter(Q(name__icontains=q))
        if date_s:
            qs = qs.filter(event_date=date_s)
        return Response(EveningSerializer(qs.order_by("-event_date")[:200], many=True).data)


class EveningViewSet(viewsets.ModelViewSet):
    queryset = Evening.objects.all()
    serializer_class = EveningSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsAdminUser()]

    def perform_create(self, serializer):
        obj = serializer.save()
        price = GlobalSettings.get_solo().default_price_per_game
        if obj.event_type == Evening.EventType.REGULAR and "price_per_game" not in serializer.initial_data:
            obj.price_per_game = price
            obj.save(update_fields=["price_per_game"])
        log_action(self.request.user, "evening_create", "Evening", obj.id)


class EveningPlayerViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request, evening_pk=None):
        eps = EveningPlayer.objects.filter(evening_id=evening_pk).select_related("player")
        return Response(EveningPlayerSerializer(eps, many=True).data)

    @transaction.atomic
    def create(self, request, evening_pk=None):
        ser = EveningPlayerSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ep = ser.save(evening_id=evening_pk)
        gs.recalculate_payments(int(evening_pk))
        log_action(request.user, "evening_player_add", "EveningPlayer", ep.id)
        return Response(EveningPlayerSerializer(ep).data, status=201)

    @action(detail=False, methods=["post"], url_path="quick-create")
    def quick_create(self, request, evening_pk=None):
        pser = PlayerSerializer(data=request.data)
        pser.is_valid(raise_exception=True)
        player = Player.objects.create(**pser.validated_data)
        ep = EveningPlayer.objects.create(evening_id=evening_pk, player=player)
        gs.recalculate_payments(int(evening_pk))
        log_action(request.user, "player_quick_create", "Player", player.id)
        return Response(EveningPlayerSerializer(ep).data, status=201)

    def destroy(self, request, evening_pk=None, pk=None):
        ep = EveningPlayer.objects.get(pk=pk, evening_id=evening_pk)
        if ep.games_played > 0:
            return Response({"detail": "Удаление только при 0 игр"}, status=400)
        ep.delete()
        gs.recalculate_payments(int(evening_pk))
        log_action(request.user, "evening_player_remove", "EveningPlayer", int(pk))
        return Response(status=204)


class GameViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request, evening_pk=None):
        games = Game.objects.filter(evening_id=evening_pk).prefetch_related("sessions")
        return Response(GameBriefSerializer(games, many=True).data)

    @transaction.atomic
    def create(self, request, evening_pk=None):
        game_number = int(request.data.get("game_number", 1))
        table_ids = request.data.get("table_ids", [])
        game = Game.objects.create(evening_id=evening_pk, game_number=game_number)
        for tid in table_ids:
            GameSession.objects.get_or_create(game=game, table_id=tid)
        log_action(request.user, "game_create", "Game", game.id)
        return Response(GameBriefSerializer(game).data, status=201)


class GameSessionViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def retrieve(self, request, pk=None):
        session = GameSession.objects.select_related("game__evening", "table", "leader").prefetch_related(
            "players__player",
            "voting_rounds",
            "shooting_rounds",
        ).get(pk=pk)
        return Response(GameSessionDetailSerializer(session).data)

    def partial_update(self, request, pk=None):
        session = GameSession.objects.get(pk=pk)
        ser = GameSessionWriteSerializer(session, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        session.version += 1
        session.save(update_fields=["version"])
        return Response(GameSessionDetailSerializer(session).data)

    @action(detail=True, methods=["post"])
    def set_players(self, request, pk=None):
        session = GameSession.objects.get(pk=pk)
        if session.stage != GameSession.Stage.PREP:
            return Response({"detail": "Состав только в подготовке"}, status=400)
        items = request.data.get("players", [])
        GameSessionPlayer.objects.filter(session=session).delete()
        for row in items:
            GameSessionPlayer.objects.create(
                session=session,
                player_id=row["player_id"],
                seat_number=row["seat_number"],
            )
        session.version += 1
        session.save(update_fields=["version"])
        session.refresh_from_db()
        return Response(GameSessionDetailSerializer(session).data)

    @action(detail=True, methods=["post"])
    def set_leader(self, request, pk=None):
        session = GameSession.objects.get(pk=pk)
        if session.stage != GameSession.Stage.PREP:
            return Response({"detail": "Только в подготовке"}, status=400)
        lid = request.data.get("leader_id")
        session.leader_id = lid
        session.version += 1
        session.save(update_fields=["leader", "version"])
        return Response(GameSessionDetailSerializer(session).data)

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        session = GameSession.objects.get(pk=pk)
        try:
            gs.start_game(session)
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        session.refresh_from_db()
        return Response(GameSessionDetailSerializer(session).data)

    @action(detail=True, methods=["post"])
    def votes(self, request, pk=None):
        session = GameSession.objects.get(pk=pk)
        try:
            gs.submit_votes_for_current_round(
                session,
                request.data.get("nominations", []),
                request.data.get("votes", {}),
            )
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        session.refresh_from_db()
        return Response(GameSessionDetailSerializer(session).data)

    @action(detail=True, methods=["post"], url_path="votes/complete")
    def votes_complete(self, request, pk=None):
        session = GameSession.objects.get(pk=pk)
        try:
            gs.complete_voting_round(session)
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        session.refresh_from_db()
        return Response(GameSessionDetailSerializer(session).data)

    @action(detail=True, methods=["post"])
    def lift(self, request, pk=None):
        session = GameSession.objects.get(pk=pk)
        try:
            gs.resolve_lift(session, bool(request.data.get("eliminate_all")))
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        session.refresh_from_db()
        return Response(GameSessionDetailSerializer(session).data)

    @action(detail=True, methods=["post"])
    def shooting(self, request, pk=None):
        session = GameSession.objects.get(pk=pk)
        try:
            gs.submit_shooting(
                session,
                request.data.get("target_seat"),
                bool(request.data.get("is_miss")),
            )
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        session.refresh_from_db()
        return Response(GameSessionDetailSerializer(session).data)

    @action(detail=True, methods=["post"], url_path="shooting/complete")
    def shooting_complete(self, request, pk=None):
        session = GameSession.objects.get(pk=pk)
        try:
            gs.complete_shooting_round(session)
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        session.refresh_from_db()
        return Response(GameSessionDetailSerializer(session).data)

    @action(detail=True, methods=["post"])
    def testament(self, request, pk=None):
        session = GameSession.objects.get(pk=pk)
        try:
            gs.submit_testament(session, request.data.get("seats", []))
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        session.refresh_from_db()
        return Response(GameSessionDetailSerializer(session).data)

    @action(detail=True, methods=["post"], url_path="testament/complete")
    def testament_complete(self, request, pk=None):
        session = GameSession.objects.get(pk=pk)
        try:
            gs.complete_testament(session)
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        session.refresh_from_db()
        return Response(GameSessionDetailSerializer(session).data)

    @action(detail=True, methods=["post"])
    def complete_game(self, request, pk=None):
        session = GameSession.objects.get(pk=pk)
        try:
            gs.try_complete_game(session, request.data.get("word", ""))
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        session.refresh_from_db()
        gs.recalculate_payments(session.game.evening_id)
        return Response(GameSessionDetailSerializer(session).data)

    @action(detail=True, methods=["post"])
    def foul(self, request, pk=None):
        session = GameSession.objects.get(pk=pk)
        seat = int(request.data.get("seat_number", 0))
        try:
            gs.add_foul(session, seat, request.user)
        except PermissionError as e:
            return Response({"detail": str(e)}, status=403)
        except GameSessionPlayer.DoesNotExist:
            return Response({"detail": "Место не найдено"}, status=404)
        session.refresh_from_db()
        return Response(GameSessionDetailSerializer(session).data)

class EveningExportPdfView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, evening_pk=None):
        pdf_bytes = render_evening_pdf(int(evening_pk))
        resp = HttpResponse(pdf_bytes, content_type="application/pdf")
        resp["Content-Disposition"] = f'inline; filename="evening-{evening_pk}.pdf"'
        return resp


class SessionExportPdfView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        pdf_bytes = render_session_pdf(int(pk))
        resp = HttpResponse(pdf_bytes, content_type="application/pdf")
        resp["Content-Disposition"] = f'inline; filename="session-{pk}.pdf"'
        return resp


class AuditLogView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        from mafia.models import AuditLog

        rows = AuditLog.objects.all()[:500]
        data = [
            {
                "id": r.id,
                "action": r.action,
                "entity": r.entity,
                "entity_id": r.entity_id,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]
        return Response(data)


class GameSessionPlayerUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk, gsp_id):
        session = GameSession.objects.get(pk=pk)
        gsp = GameSessionPlayer.objects.get(session=session, pk=gsp_id)
        ser = GameSessionPlayerPatchSerializer(
            gsp, data=request.data, partial=True, context={"request": request}
        )
        ser.is_valid(raise_exception=True)
        ser.save()
        session.version += 1
        session.save(update_fields=["version"])
        session.refresh_from_db()
        session = GameSession.objects.select_related("game__evening", "table", "leader").prefetch_related(
            "players__player",
            "voting_rounds",
            "shooting_rounds",
        ).get(pk=pk)
        return Response(GameSessionDetailSerializer(session).data)
