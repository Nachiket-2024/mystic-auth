import logging
import os

from logging.handlers import TimedRotatingFileHandler
from pythonjsonlogger import jsonlogger

from ..core.settings import settings
from .correlation_id_middleware import request_id_ctx_var


class RequestIdFilter(logging.Filter):
    """Injects the current request's correlation ID (if any) into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        # Defaults to "-" outside of a request, e.g. startup logs.
        record.request_id = request_id_ctx_var.get()
        return True


LOG_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'logs')
os.makedirs(LOG_DIR, exist_ok=True)
ACCESS_LOG_PATH = os.path.join(LOG_DIR, 'access.log')


def get_logger(name: str = "base_logger") -> logging.Logger:
    """
    Returns a logger configured with a JSON formatter (including the request
    correlation ID), a rotating access-log file handler, and a stdout handler
    for container log aggregation (e.g. `docker logs`).
    """
    logger = logging.getLogger(name)
    logger.setLevel(settings.LOG_LEVEL)

    if not logger.handlers:
        formatter = jsonlogger.JsonFormatter(
            '%(asctime)s %(levelname)s %(name)s %(request_id)s %(message)s'
        )
        request_id_filter = RequestIdFilter()

        access_handler = TimedRotatingFileHandler(
            ACCESS_LOG_PATH,
            when="midnight",
            interval=1,
            backupCount=0
        )
        access_handler.setLevel(logging.INFO)
        access_handler.setFormatter(formatter)
        access_handler.addFilter(request_id_filter)

        stream_handler = logging.StreamHandler()
        stream_handler.setLevel(logging.INFO)
        stream_handler.setFormatter(formatter)
        stream_handler.addFilter(request_id_filter)

        logger.addHandler(access_handler)
        logger.addHandler(stream_handler)

    return logger
