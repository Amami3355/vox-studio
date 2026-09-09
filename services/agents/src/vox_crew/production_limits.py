"""Generated from Production productionLimitsSchema. Run pnpm --filter @vox/production contracts."""
from pydantic import BaseModel, ConfigDict, Field


class ProductionLimits(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    maxCalls: int | None = Field(default=None, ge=1, le=9007199254740991)
    maxSearches: int | None = Field(default=None, ge=1, le=9007199254740991)
    maxImages: int | None = Field(default=None, ge=0, le=9007199254740991)
    maxTakes: int | None = Field(default=None, ge=1, le=9007199254740991)
    maxImageCorrections: int | None = Field(default=None, ge=0, le=9007199254740991)
    maxEditorialCorrections: int | None = Field(default=None, ge=0, le=9007199254740991)
    maxFilmCorrections: int | None = Field(default=None, ge=0, le=9007199254740991)
    maxTechnicalRepairs: int | None = Field(default=None, ge=0, le=9007199254740991)
