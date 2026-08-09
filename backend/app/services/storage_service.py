"""File storage abstraction: local disk for dev, Cloudflare R2 (S3-compatible) for prod.

Render's free web disk is ephemeral — it can be wiped on every redeploy. R2
gives durable, private object storage; access is only ever granted through
short-lived presigned URLs, never a public-read bucket. Local disk stays the
default in development so no cloud account is required to run the app.
"""

from __future__ import annotations

import logging
import os
from typing import Protocol

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class StorageService(Protocol):
    def save(self, stored_filename: str, content: bytes) -> None: ...

    def read(self, stored_filename: str) -> bytes: ...

    def exists(self, stored_filename: str) -> bool: ...

    def delete(self, stored_filename: str) -> None: ...

    def presigned_url(self, stored_filename: str, filename: str, expires_in: int = 300) -> str | None:
        """Return a short-lived download URL, or None if this backend can't produce one
        (the caller should fall back to streaming bytes through the backend instead)."""
        ...


class LocalStorageService:
    """Stores files on the local disk under settings.uploads_dir."""

    def __init__(self, base_dir: str):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)

    def _path(self, stored_filename: str) -> str:
        return os.path.join(self.base_dir, os.path.basename(stored_filename))

    def save(self, stored_filename: str, content: bytes) -> None:
        with open(self._path(stored_filename), "wb") as fh:
            fh.write(content)

    def read(self, stored_filename: str) -> bytes:
        with open(self._path(stored_filename), "rb") as fh:
            return fh.read()

    def exists(self, stored_filename: str) -> bool:
        return os.path.exists(self._path(stored_filename))

    def delete(self, stored_filename: str) -> None:
        path = self._path(stored_filename)
        if os.path.exists(path):
            os.remove(path)

    def presigned_url(self, stored_filename: str, filename: str, expires_in: int = 300) -> str | None:
        return None


class R2StorageService:
    """Stores files in a private Cloudflare R2 bucket via the S3-compatible API."""

    def __init__(self, account_id: str, access_key_id: str, secret_access_key: str, bucket_name: str):
        import boto3
        from botocore.config import Config

        self.bucket_name = bucket_name
        self.client = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            config=Config(signature_version="s3v4", region_name="auto"),
        )

    def save(self, stored_filename: str, content: bytes) -> None:
        self.client.put_object(
            Bucket=self.bucket_name,
            Key=stored_filename,
            Body=content,
            ContentType="application/pdf",
        )

    def read(self, stored_filename: str) -> bytes:
        response = self.client.get_object(Bucket=self.bucket_name, Key=stored_filename)
        return response["Body"].read()

    def exists(self, stored_filename: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self.client.head_object(Bucket=self.bucket_name, Key=stored_filename)
            return True
        except ClientError:
            return False

    def delete(self, stored_filename: str) -> None:
        self.client.delete_object(Bucket=self.bucket_name, Key=stored_filename)

    def presigned_url(self, stored_filename: str, filename: str, expires_in: int = 300) -> str | None:
        return self.client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self.bucket_name,
                "Key": stored_filename,
                "ResponseContentType": "application/pdf",
                "ResponseContentDisposition": f'inline; filename="{filename}"',
            },
            ExpiresIn=expires_in,
        )


_storage_service: StorageService | None = None


def get_storage_service() -> StorageService:
    global _storage_service
    if _storage_service is not None:
        return _storage_service

    settings = get_settings()
    if settings.r2_account_id and settings.r2_access_key_id and settings.r2_secret_access_key and settings.r2_bucket_name:
        logger.info("storage_backend=r2 bucket=%s", settings.r2_bucket_name)
        _storage_service = R2StorageService(
            account_id=settings.r2_account_id,
            access_key_id=settings.r2_access_key_id,
            secret_access_key=settings.r2_secret_access_key,
            bucket_name=settings.r2_bucket_name,
        )
    else:
        logger.info("storage_backend=local dir=%s", settings.uploads_dir)
        _storage_service = LocalStorageService(base_dir=settings.uploads_dir)

    return _storage_service
