from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings

# Rate limiting is disabled in non-production environments so tests can run
# without exhausting per-IP quotas. Set RATE_LIMIT_ENABLED=true to force-enable.
_enabled = get_settings().rate_limit_enabled

limiter = Limiter(key_func=get_remote_address, enabled=_enabled)
