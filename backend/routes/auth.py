from fastapi import (
    APIRouter,
    HTTPException,
    Depends,
)

from pydantic import BaseModel

from sqlalchemy.orm import Session

from passlib.context import (
    CryptContext
)

from jose import jwt

from db.database import (
    SessionLocal
)

from models.user import User

SECRET_KEY = "supersecretkey"

ALGORITHM = "HS256"

router = APIRouter()

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

class AuthRequest(BaseModel):

    email: str

    password: str

def get_db():

    db = SessionLocal()

    try:

        yield db

    finally:

        db.close()

@router.post("/register")
def register(
    request: AuthRequest,
    db: Session = Depends(
        get_db
    )
):

    existing_user = (
        db.query(User)
        .filter(
            User.email ==
            request.email
        )
        .first()
    )

    if existing_user:

        raise HTTPException(
            status_code=400,
            detail="User already exists"
        )

    hashed_password = (
        pwd_context.hash(
            request.password
        )
    )

    user = User(
        email=request.email,
        hashed_password=
        hashed_password
    )

    db.add(user)

    db.commit()

    return {
        "message":
        "User created"
    }

@router.post("/login")
def login(
    request: AuthRequest,
    db: Session = Depends(
        get_db
    )
):

    user = (
        db.query(User)
        .filter(
            User.email ==
            request.email
        )
        .first()
    )

    if not user:

        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )

    valid_password = (
        pwd_context.verify(
            request.password,
            user.hashed_password
        )
    )

    if not valid_password:

        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )

    token = jwt.encode(
        {
            "sub": user.email
        },
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    return {
        "token": token
    }