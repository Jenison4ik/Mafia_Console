from django.urls import include, path
from rest_framework.routers import DefaultRouter

from mafia import views

router = DefaultRouter()
router.register(r"players", views.PlayerViewSet, basename="player")
router.register(r"tables", views.GameTableViewSet, basename="table")
router.register(r"evenings", views.EveningViewSet, basename="evening")
router.register(r"sessions", views.GameSessionViewSet, basename="session")

evening_players = views.EveningPlayerViewSet.as_view({"get": "list", "post": "create"})
evening_player_detail = views.EveningPlayerViewSet.as_view({"delete": "destroy"})
evening_players_quick = views.EveningPlayerViewSet.as_view({"post": "quick_create"})

evening_games = views.GameViewSet.as_view({"get": "list", "post": "create"})

urlpatterns = [
    path("auth/csrf/", views.CsrfCookieView.as_view()),
    path("auth/login/", views.LoginView.as_view()),
    path("auth/logout/", views.LogoutView.as_view()),
    path("auth/me/", views.MeView.as_view()),
    path("auth/users/", views.UserListView.as_view()),
    path("evenings/summary/", views.EveningSummaryView.as_view()),
    path("evenings/archive/", views.EveningArchiveView.as_view()),
    path("evenings/<int:evening_pk>/export.pdf", views.EveningExportPdfView.as_view()),
    path("settings/global/", views.GlobalSettingsView.as_view()),
    path("audit/", views.AuditLogView.as_view()),
    path("evenings/<int:evening_pk>/players/", evening_players),
    path("evenings/<int:evening_pk>/players/quick-create/", evening_players_quick),
    path("evenings/<int:evening_pk>/players/<int:pk>/", evening_player_detail),
    path("evenings/<int:evening_pk>/games/", evening_games),
    path("sessions/<int:pk>/export.pdf", views.SessionExportPdfView.as_view()),
    path("sessions/<int:pk>/players/<int:gsp_id>/", views.GameSessionPlayerUpdateView.as_view()),
    path("", include(router.urls)),
]
