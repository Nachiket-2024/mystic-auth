from pydantic import BaseModel, EmailStr, Field


class LoginSchema(BaseModel):
    email: EmailStr
    # Capped at the same length signup allows, so an arbitrarily large string
    # isn't fed straight into Argon2 hashing.
    password: str = Field(..., max_length=128)
