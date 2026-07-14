from pydantic import BaseModel, EmailStr, Field


class SignupSchema(BaseModel):
    # Capped so an unbounded string can't be stored/displayed/logged indefinitely
    name: str = Field(..., max_length=100)
    email: EmailStr
    # Capped so an arbitrarily large string isn't fed straight into Argon2 hashing
    password: str = Field(..., max_length=128)
