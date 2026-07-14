from pydantic import BaseModel, EmailStr


class PasswordResetRequestSchema(BaseModel):
    email: EmailStr
