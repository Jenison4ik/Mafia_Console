from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from mafia.models import GameTable, GlobalSettings, Player


class Command(BaseCommand):
    help = "Демо-данные: пользователи, столы, настройки, пример игрока"

    def handle(self, *args, **options):
        User = get_user_model()
        GlobalSettings.get_solo()
        admin_u, _ = User.objects.get_or_create(
            username="admin",
            defaults={
                "display_name": "Админ",
                "is_staff": True,
                "is_superuser": True,
                "login_code": "admin",
            },
        )
        if not admin_u.has_usable_password():
            admin_u.set_password("admin")
        admin_u.login_code = "admin"
        admin_u.is_staff = True
        admin_u.save()

        judge, _ = User.objects.get_or_create(
            username="judge",
            defaults={"display_name": "Судья", "login_code": "1111"},
        )
        judge.login_code = "1111"
        judge.save()

        for i, name in enumerate(["Стол 1", "Стол 2", "Стол 3"], start=1):
            GameTable.objects.get_or_create(name=name, defaults={"sort_order": i})

        Player.objects.get_or_create(
            nickname="demo",
            defaults={"first_name": "Демо", "nickname": "demo"},
        )

        self.stdout.write(self.style.SUCCESS("OK: admin/admin, judge/1111"))
