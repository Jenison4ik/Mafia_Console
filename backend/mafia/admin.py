from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from mafia.models import (
    AuditLog,
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


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    fieldsets = BaseUserAdmin.fieldsets + (("Демо", {"fields": ("display_name", "login_code")}),)
    list_display = ("username", "display_name", "is_staff", "login_code")


@admin.register(GlobalSettings)
class GlobalSettingsAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return not GlobalSettings.objects.exists()


admin.site.register(Player)
admin.site.register(GameTable)
admin.site.register(Evening)
admin.site.register(EveningPlayer)
admin.site.register(Game)
admin.site.register(GameSession)
admin.site.register(GameSessionPlayer)
admin.site.register(VotingRound)
admin.site.register(ShootingRound)
admin.site.register(AuditLog)
