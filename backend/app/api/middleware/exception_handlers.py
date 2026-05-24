import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.exceptions import AppError

logger = logging.getLogger(__name__)


def _request_id_from_request(request: Request) -> str:
    return getattr(request.state, "request_id", "") or request.headers.get("x-request-id", "")


def _error_payload(code: str, message: str, request_id: str, details=None):
    payload = {
        "error": {
            "code": code,
            "message": message,
            "request_id": request_id,
            "details": details or {},
        },
        # Backward compatibility for existing clients that read `detail`.
        "detail": message,
    }
    return payload


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_payload(exc.code, exc.message, _request_id_from_request(request), exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content=_error_payload(
                "VALIDATION_ERROR",
                "Validation failed",
                _request_id_from_request(request),
                {"errors": exc.errors()},
            ),
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        message = str(exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_payload("HTTP_ERROR", message, _request_id_from_request(request)),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content=_error_payload("INTERNAL_ERROR", "Internal server error", _request_id_from_request(request)),
        )
