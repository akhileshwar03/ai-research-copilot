"""Document management endpoints."""

import logging
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_admin
from app.api.dependencies.services import (
    get_document_service,
    get_vector_store_manager,
)
from app.core.exceptions import AppError
from app.db.models.document import Document
from app.db.models.user import User
from app.db.session import get_db
from app.services.admin_analytics import (
    document_summary,
    size_class_filter,
)
from app.services.admin_audit import record_admin_action
from app.services.document_service import DocumentService
from app.api.routes.admin._common import (
    MessageResponse,
    AdminDocument,
    AdminDocumentList,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Document management ────────────────────────────────────────────────────────

@router.get("/documents/summary")
def get_documents_summary(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Totals, status breakdown and size classes for every stored document (unaffected by list filters)."""
    return document_summary(db)


@router.get("/documents", response_model=AdminDocumentList)
def list_all_documents(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    q: str = Query(default="", description="Filter by document name or owner email"),
    status: str = Query(default="all", description="all | ready | processing | failed | empty"),
    size: Literal["all", "small", "medium", "large"] = Query(default="all", description="Size class"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(Document)
    if q:
        pattern = f"%{q}%"
        query = query.filter((Document.original_filename.ilike(pattern)) | (Document.user_email.ilike(pattern)))
    if status != "all":
        query = query.filter(Document.upload_status == status)
    size_clause = size_class_filter(size)
    if size_clause is not None:
        query = query.filter(size_clause)
    total = query.count()
    docs = query.order_by(Document.created_at.desc()).offset(skip).limit(limit).all()
    return AdminDocumentList(
        documents=[
            AdminDocument(
                id=d.stored_filename,
                name=d.original_filename,
                owner_email=d.user_email,
                size_bytes=d.size_bytes,
                upload_status=d.upload_status,
                error_message=d.error_message,
                page_count=d.page_count,
                pinned=bool(d.pinned),
                created_at=d.created_at,
            )
            for d in docs
        ],
        total=total,
        skip=skip,
        limit=limit,
    )


def _get_document_or_404(db: Session, document_id: str) -> Document:
    doc = db.query(Document).filter(Document.stored_filename == document_id).first()
    if not doc:
        raise AppError(code="DOCUMENT_NOT_FOUND", message="Document not found", status_code=404)
    return doc


@router.delete("/documents/{document_id}", response_model=MessageResponse)
def delete_any_document(
    document_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    service: DocumentService = Depends(get_document_service),
):
    """Remove a document (file, vectors, and row) on the owner's behalf."""
    doc = _get_document_or_404(db, document_id)
    name, owner = doc.original_filename, doc.user_email
    service.delete_document(filename=document_id, user_email=owner or "")
    record_admin_action(db, admin_email=admin.email, action="document.delete", target=name, details={"owner": owner})
    return MessageResponse(message=f"Deleted {name}")


@router.post("/documents/{document_id}/reingest", response_model=MessageResponse)
def reingest_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    service: DocumentService = Depends(get_document_service),
):
    """Re-run ingestion for a document whose first pass failed or produced
    nothing (e.g. after a vision/embedding outage). Existing chunks are
    dropped first so a retry never duplicates them."""
    doc = _get_document_or_404(db, document_id)
    if doc.upload_status == "processing":
        raise AppError(code="ALREADY_PROCESSING", message="This document is already being processed", status_code=409)

    try:
        get_vector_store_manager().delete_by_source(document_id)
    except Exception:
        logger.exception("admin_reingest_vector_cleanup_failed stored=%s", document_id)

    doc.upload_status = "processing"
    doc.error_message = None
    db.commit()
    background_tasks.add_task(service.process_upload_background, document_id)
    record_admin_action(
        db, admin_email=admin.email, action="document.reingest", target=doc.original_filename, details={"owner": doc.user_email}
    )
    return MessageResponse(message=f"Re-ingestion started for {doc.original_filename}")


