from functools import lru_cache

from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.repositories.document_repository import DocumentRepository
from app.db.repositories.humanizer_run_repository import HumanizerRunRepository
from app.db.repositories.message_repository import MessageRepository
from app.db.repositories.otp_repository import OtpRepository
from app.db.repositories.realtime_repository import RealtimeMessageRepository, RealtimeSessionRepository
from app.db.repositories.session_repository import SessionRepository
from app.db.repositories.user_repository import UserRepository
from app.db.session import get_db
from app.modules.rag.embedding_service import EmbeddingService
from app.modules.rag.ingestion_service import IngestionService
from app.modules.rag.pgvector_store import PgVectorStore
from app.modules.rag.retrieval_service import RetrievalService
from app.services.ai_service import AIService
from app.services.auth_service import AuthService
from app.services.chat_service import ChatService
from app.services.checker_service import CheckerService
from app.services.document_service import DocumentService
from app.services.email_service import EmailService
from app.services.health_service import HealthService
from app.services.humanizer_service import HumanizerService
from app.services.otp_service import OtpService
from app.services.paper_analyzer_service import PaperAnalyzerService
from app.services.realtime_service import RealtimeService
from app.services.realtime_session_service import RealtimeSessionService
from app.services.session_service import SessionService
from app.services.web_search_service import WebSearchService
from app.services.writing_feedback_service import WritingFeedbackService


@lru_cache
def get_vector_store_manager() -> PgVectorStore:
    return PgVectorStore()


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


def get_humanizer_service(db: Session = Depends(get_db)) -> HumanizerService:
    return HumanizerService(
        ai_service=get_ai_service(),
        run_repo=HumanizerRunRepository(db),
        user_repo=UserRepository(db),
    )


def get_checker_service() -> CheckerService:
    return CheckerService(ai_service=get_ai_service())


def get_writing_feedback_service() -> WritingFeedbackService:
    return WritingFeedbackService(ai_service=get_ai_service())


def get_paper_analyzer_service() -> PaperAnalyzerService:
    return PaperAnalyzerService()


@lru_cache
def get_web_search_service() -> WebSearchService:
    return WebSearchService()


def get_realtime_service() -> RealtimeService:
    return RealtimeService(ai_service=get_ai_service(), web_search_service=get_web_search_service())


def get_realtime_session_service(db: Session = Depends(get_db)) -> RealtimeSessionService:
    return RealtimeSessionService(
        session_repo=RealtimeSessionRepository(db),
        message_repo=RealtimeMessageRepository(db),
        user_repo=UserRepository(db),
    )


def get_health_service() -> HealthService:
    return HealthService(
        vector_store=get_vector_store_manager(),
        ai_service=get_ai_service(),
    )
