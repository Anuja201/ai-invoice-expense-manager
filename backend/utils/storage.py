"""
utils/storage.py
Cloud-Ready Storage Abstraction Layer for InvoiceAI.

STORAGE_BACKEND (env var) controls permanent file storage:
  local  (default) -- saves to uploads/ directory; for local development only.
                      Files served via /api/files/<storage_key>.
  s3     -- AWS S3 bucket. Requires: boto3 + AWS_S3_BUCKET, AWS_ACCESS_KEY_ID,
             AWS_SECRET_ACCESS_KEY, AWS_S3_REGION env vars.
  gcs    -- Google Cloud Storage. Requires: google-cloud-storage + GCS_BUCKET,
             GOOGLE_APPLICATION_CREDENTIALS env vars.

Workflow (all backends):
  1. Incoming file is written to an OS temp file (never the uploads/ folder).
  2. OCR runs on the temp path.
  3. store_file() uploads the temp file to the configured backend.
  4. The temp file is deleted (always, via context manager).
  5. Only storage_key + file_url are persisted in MySQL -- no local absolute paths.
"""

import os
import uuid
import logging
import shutil
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass

logger = logging.getLogger("storage")

STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local").strip().lower()
_LOCAL_UPLOAD_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    os.getenv("UPLOAD_FOLDER", "uploads"),
)
_S3_BUCKET = os.getenv("AWS_S3_BUCKET", "")
_S3_REGION = os.getenv("AWS_S3_REGION", "us-east-1")
_S3_PUBLIC_BASE_URL = os.getenv("AWS_S3_PUBLIC_BASE_URL", "").rstrip("/")
_GCS_BUCKET = os.getenv("GCS_BUCKET", "")


@dataclass
class StorageResult:
    storage_key: str
    file_url: str
    original_filename: str
    backend: str


@contextmanager
def temp_file(file_stream, original_filename: str):
    suffix = os.path.splitext(original_filename)[1] or ""
    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=suffix)
        try:
            with os.fdopen(fd, "wb") as f:
                shutil.copyfileobj(file_stream, f)
        except Exception:
            os.close(fd)
            raise
        yield tmp_path
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError as exc:
                logger.warning(f"[storage] Could not delete temp file {tmp_path}: {exc}")


def store_file(temp_path: str, original_filename: str, subfolder: str = "invoices") -> StorageResult:
    storage_key = _build_key(original_filename, subfolder)
    if STORAGE_BACKEND == "s3":
        return _store_s3(temp_path, storage_key, original_filename)
    if STORAGE_BACKEND == "gcs":
        return _store_gcs(temp_path, storage_key, original_filename)
    return _store_local(temp_path, storage_key, original_filename)


def delete_file(storage_key: str) -> None:
    if not storage_key:
        return
    if STORAGE_BACKEND == "s3":
        _delete_s3(storage_key)
    elif STORAGE_BACKEND == "gcs":
        _delete_gcs(storage_key)
    else:
        _delete_local(storage_key)


def get_local_serve_path() -> str:
    return _LOCAL_UPLOAD_ROOT


def _build_key(original_filename: str, subfolder: str) -> str:
    try:
        from werkzeug.utils import secure_filename
        safe = secure_filename(original_filename) or "upload"
    except ImportError:
        safe = os.path.basename(original_filename).replace(" ", "_") or "upload"
    from datetime import datetime
    prefix = datetime.utcnow().strftime("%Y%m%d%H%M%S") + "_" + uuid.uuid4().hex[:8]
    sub = subfolder.strip("/") or "uploads"
    return f"{sub}/{prefix}_{safe}"


def _store_local(temp_path, storage_key, original_filename):
    dest = os.path.join(_LOCAL_UPLOAD_ROOT, storage_key)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copy2(temp_path, dest)
    logger.info(f"[storage:local] stored -> {storage_key}")
    return StorageResult(storage_key=storage_key, file_url=f"/api/files/{storage_key}",
                         original_filename=original_filename, backend="local")


def _delete_local(storage_key):
    dest = os.path.join(_LOCAL_UPLOAD_ROOT, storage_key)
    if os.path.exists(dest):
        try:
            os.remove(dest)
        except OSError as exc:
            logger.warning(f"[storage:local] delete failed for {storage_key}: {exc}")


def _store_s3(temp_path, storage_key, original_filename):
    if not _S3_BUCKET:
        raise RuntimeError("AWS_S3_BUCKET env var is not set for STORAGE_BACKEND=s3")
    try:
        import boto3
    except ImportError:
        raise RuntimeError("boto3 is required for S3. Install: pip install boto3")
    try:
        s3 = boto3.client("s3", region_name=_S3_REGION)
        s3.upload_file(temp_path, _S3_BUCKET, storage_key)
        if _S3_PUBLIC_BASE_URL:
            file_url = f"{_S3_PUBLIC_BASE_URL}/{storage_key}"
        else:
            file_url = f"https://{_S3_BUCKET}.s3.{_S3_REGION}.amazonaws.com/{storage_key}"
        return StorageResult(storage_key=storage_key, file_url=file_url,
                             original_filename=original_filename, backend="s3")
    except Exception as exc:
        raise RuntimeError(f"S3 upload failed: {exc}") from exc


def _delete_s3(storage_key):
    if not _S3_BUCKET:
        return
    try:
        import boto3
        s3 = boto3.client("s3", region_name=_S3_REGION)
        s3.delete_object(Bucket=_S3_BUCKET, Key=storage_key)
    except Exception as exc:
        logger.warning(f"[storage:s3] delete failed for {storage_key}: {exc}")


def _store_gcs(temp_path, storage_key, original_filename):
    if not _GCS_BUCKET:
        raise RuntimeError("GCS_BUCKET env var is not set for STORAGE_BACKEND=gcs")
    try:
        from google.cloud import storage as _gcs
    except ImportError:
        raise RuntimeError("google-cloud-storage required. Install: pip install google-cloud-storage")
    try:
        client = _gcs.Client()
        bucket = client.bucket(_GCS_BUCKET)
        blob = bucket.blob(storage_key)
        blob.upload_from_filename(temp_path)
        file_url = f"https://storage.googleapis.com/{_GCS_BUCKET}/{storage_key}"
        return StorageResult(storage_key=storage_key, file_url=file_url,
                             original_filename=original_filename, backend="gcs")
    except Exception as exc:
        raise RuntimeError(f"GCS upload failed: {exc}") from exc


def _delete_gcs(storage_key):
    if not _GCS_BUCKET:
        return
    try:
        from google.cloud import storage as _gcs
        _gcs.Client().bucket(_GCS_BUCKET).blob(storage_key).delete()
    except Exception as exc:
        logger.warning(f"[storage:gcs] delete failed for {storage_key}: {exc}")
