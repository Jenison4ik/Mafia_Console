from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from mafia.models import (
    Evening,
    EveningPlayer,
    Game,
    GameSession,
    GameSessionPlayer,
    GameTable,
    Player,
)
from mafia.services import game_session as gs


class GameFlowTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user("a", password="x", is_staff=True)
        self.eve = Evening.objects.create(
            name="Test",
            event_date="2026-04-01",
            event_type=Evening.EventType.REGULAR,
            price_per_game=Decimal("100"),
        )
        self.t = GameTable.objects.create(name="T1", sort_order=1)
        self.p1 = Player.objects.create(first_name="A", nickname="a1")
        self.p2 = Player.objects.create(first_name="B", nickname="b2")
        EveningPlayer.objects.create(evening=self.eve, player=self.p1)
        EveningPlayer.objects.create(evening=self.eve, player=self.p2)
        self.game = Game.objects.create(evening=self.eve, game_number=1)
        self.session = GameSession.objects.create(game=self.game, table=self.t)
        GameSessionPlayer.objects.create(session=self.session, player=self.p1, seat_number=1)
        GameSessionPlayer.objects.create(session=self.session, player=self.p2, seat_number=2)

    def test_start_and_vote_no_tie(self):
        gs.start_game(self.session)
        self.session.refresh_from_db()
        self.assertEqual(self.session.stage, GameSession.Stage.VOTING)
        gs.submit_votes_for_current_round(self.session, [1], {})
        gs.complete_voting_round(self.session)
        self.session.refresh_from_db()
        self.assertEqual(self.session.stage, GameSession.Stage.SHOOTING)

    def test_tournament_price_zero(self):
        ev = Evening.objects.create(
            event_date="2026-05-01",
            event_type=Evening.EventType.TOURNAMENT,
            price_per_game=Decimal("999"),
        )
        self.assertEqual(ev.effective_price(), 0)

    def test_recalculate_payments(self):
        ep = EveningPlayer.objects.get(evening=self.eve, player=self.p1)
        ep.games_played = 2
        ep.save()
        gs.recalculate_payments(self.eve.id)
        ep.refresh_from_db()
        self.assertEqual(ep.paid_amount, Decimal("200"))
