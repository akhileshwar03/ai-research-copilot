from sqlalchemy.orm import Session

from app.db.models.humanizer_run import HumanizerRun


class HumanizerRunRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, user_id: int, input_text: str, output_text: str, style: str) -> HumanizerRun:
        run = HumanizerRun(user_id=user_id, input_text=input_text, output_text=output_text, style=style)
        self.db.add(run)
        self.db.flush()
        return run

    def list_by_user_id(self, user_id: int, skip: int = 0, limit: int = 50) -> list[HumanizerRun]:
        return (
            self.db.query(HumanizerRun)
            .filter(HumanizerRun.user_id == user_id)
            .order_by(HumanizerRun.id.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def count_by_user_id(self, user_id: int) -> int:
        return self.db.query(HumanizerRun).filter(HumanizerRun.user_id == user_id).count()

    def get_by_id_and_user(self, run_id: int, user_id: int) -> HumanizerRun | None:
        return (
            self.db.query(HumanizerRun)
            .filter(HumanizerRun.id == run_id, HumanizerRun.user_id == user_id)
            .first()
        )

    def delete(self, run: HumanizerRun) -> None:
        self.db.delete(run)

    def delete_all_by_user_id(self, user_id: int) -> int:
        return self.db.query(HumanizerRun).filter(HumanizerRun.user_id == user_id).delete()
