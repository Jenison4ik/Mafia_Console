from mafia.models import AuditLog


def log_action(user, action: str, entity: str = "", entity_id: int | None = None, payload=None):
    AuditLog.objects.create(
        user=user if user and user.is_authenticated else None,
        action=action,
        entity=entity,
        entity_id=entity_id,
        payload=payload,
    )
