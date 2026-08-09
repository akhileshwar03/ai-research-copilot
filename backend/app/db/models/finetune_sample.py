from sqlalchemy import Column, DateTime, Integer, String, Text, func

from app.db.session import Base


class FinetuneSample(Base):
    """One training example for the Humaniser LoRA fine-tune (Phase 2).
    Not used by the live app — offline tooling only (backend/scripts/finetune/)."""

    __tablename__ = "finetune_samples"

    id = Column(Integer, primary_key=True, index=True)
    human_text = Column(Text, nullable=False)
    # Nullable until Step 3 (AI-ify) fills it in — unless the source dataset
    # already provided a paired AI version, in which case Step 1 sets it directly.
    ai_text = Column(Text, nullable=True)
    word_count = Column(Integer, nullable=False)
    source = Column(String, nullable=False, index=True)
    license = Column(String, nullable=False)
    # Nullable until Step 2 (tag.py) assigns normal / clear_structured / simple_formal.
    style = Column(String, nullable=True, index=True)
    # collected -> tagged -> ai_ready -> exported
    status = Column(String, nullable=False, default="collected", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
