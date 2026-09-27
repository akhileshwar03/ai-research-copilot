from sqlalchemy import Column, Date, ForeignKey, Integer, String

from app.db.session import Base


class ChatQuotaUsage(Base):
    """How many times a user has used a capped kind of chat request on a given UTC day.

    One row per (user, day, kind); ``count`` is incremented atomically by ``chat_quota.try_consume``.
    Deliberately just a counter -- no request text or document ids -- so it is safe to keep and to purge with
    the account (ON DELETE CASCADE).
    """

    __tablename__ = "chat_quota_usage"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    day = Column(Date, primary_key=True)
    kind = Column(String, primary_key=True)
    count = Column(Integer, nullable=False, default=0)
