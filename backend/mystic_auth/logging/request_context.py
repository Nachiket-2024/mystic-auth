"""The current request's correlation id, readable from any log line."""
from contextvars import ContextVar

request_id_ctx_var: ContextVar[str] = ContextVar("request_id", default="-")
