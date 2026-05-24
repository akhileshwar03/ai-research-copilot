from functools import lru_cache

from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.repositories.document_repository import DocumentRepository
from app.db.repositories.message_repository import MessageRepository
from app.db.repositories.otp_repository import OtpRepository
from app.db.repositories.session_repository import SessionRepository
from app.db.repositories.user_repository import UserRepository
from app.db.session import get_db
from app.modules.rag.embedding_service import EmbeddingService
from app.modules.rag.ingestion_service import IngestionService
from app.modules.rag.retrieval_service import RetrievalService
from app.modules.rag.vector_store_manager import VectorStoreManager
from app.services.ai_service import AIService
from app.services.auth_service import AuthService
from app.services.chat_service import ChatService
from app.services.document_service import DocumentService
from app.services.email_service import EmailService
from app.services.health_service import HealthService
from app.services.otp_service import OtpService
from app.services.session_service import SessionService


@lru_cache
def get_vector_store_manager() -> VectorStoreManager:
    return VectorStoreManager()


@lru_cache
def get_embedding_service() -> EmbeddingService:
    return EmbeddingService()


@lru_cache
def get_ai_service() -> AIService:
    return AIService()


@lru_cache
def get_email_service() -> EmailService:
    return EmailService()


def get_auth_service(db: Session = Depends(get_db)) -> AuthService:
    return AuthService(user_repo=UserRepository(db))


def get_otp_service(db: Session = Depends(get_db)) -> OtpService:
    return OtpService(
        otp_repo=OtpRepository(db),
        user_repo=UserRepository(db),
        email_service=get_email_service(),
    )


def get_session_service(db: Session = Depends(get_db)) -> SessionService:
    return SessionService(
        session_repo=SessionRepository(db),
        message_repo=MessageRepository(db),
        user_repo=UserRepository(db),
    )


def get_document_service(db: Session = Depends(get_db)) -> DocumentService:
    vector_store = get_vector_store_manager()
    ingestion_service = IngestionService(
        embedding_service=get_embedding_service(),
        vector_store=vector_store,
    )
    return DocumentService(
        document_repo=DocumentRepository(db),
        ingestion_service=ingestion_service,
        vector_store=vector_store,
    )


def get_chat_service() -> ChatService:
    retrieval_service = RetrievalService(
        embedding_service=get_embedding_service(),
        vector_store=get_vector_store_manager(),
    )
    return ChatService(retrieval_service=retrieval_service, ai_service=get_ai_service())


def get_health_service() -> HealthService:
    return HealthService(
        vector_store=get_vector_store_manager(),
        ai_service=get_ai_service(),
    )
