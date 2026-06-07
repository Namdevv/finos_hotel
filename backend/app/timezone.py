"""Timezone helpers for business dates.

System timestamps stay in SQLite UTC (`datetime('now')`). Business dates such
as transaction date defaults use the configured hotel timezone.
"""
import datetime as dt
from typing import cast
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .config import get_settings


def app_timezone() -> dt.tzinfo:
    try:
        return cast(dt.tzinfo, ZoneInfo(get_settings().timezone))
    except ZoneInfoNotFoundError:
        return dt.timezone(dt.timedelta(hours=7), name="Asia/Ho_Chi_Minh")


def local_today() -> dt.date:
    return dt.datetime.now(app_timezone()).date()
