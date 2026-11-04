import json
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class PasskeyNameSchema(BaseModel):
    name: str = Field(min_length=1, max_length=64)

    def normalized_name(self) -> str:
        return self.name.strip()


class PasskeyBulkRemoveSchema(BaseModel):
    """Either explicit `ids` (1-10) or `all: true`, never both or neither."""

    ids: list[int] | None = Field(default=None, min_length=1, max_length=10)
    all: bool = False

    @model_validator(mode="after")
    def _exactly_one_target(self) -> PasskeyBulkRemoveSchema:
        if self.all == (self.ids is not None):
            raise ValueError("Provide either ids or all=true")
        return self


class PasskeyStepUpPasswordSchema(BaseModel):
    password: str = Field(min_length=1, max_length=1024)


class PasskeyRegistrationFinishSchema(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    credential: dict[str, Any]

    def normalized_name(self) -> str:
        return self.name.strip()

    @field_validator("credential")
    @classmethod
    def _bound_credential_size(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value, separators=(",", ":"))) > 100_000:
            raise ValueError("credential response is too large")
        return value


class PasskeyAuthenticationFinishSchema(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = Field(min_length=1, max_length=2048)
    rawId: str = Field(min_length=1, max_length=2048)
    type: str = Field(pattern="^public-key$")
    response: dict[str, Any]

    @field_validator("response")
    @classmethod
    def _bound_response_size(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value, separators=(",", ":"))) > 100_000:
            raise ValueError("credential response is too large")
        return value
