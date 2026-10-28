"""Pydantic v2 request and response schemas for OPSENTINEL REST endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

SourceType = Literal[
    "application_log",
    "error_log",
    "deployment",
    "incident",
    "runbook",
    "architecture",
    "troubleshooting",
]

IncidentStatus = Literal["investigating", "identified", "mitigated", "resolved"]
SeverityLevel = Literal["SEV-1", "SEV-2", "SEV-3"]


class KnowledgeIngestRequest(BaseModel):
    """Payload to ingest new telemetry, logs, deployments, incidents, runbooks, or docs."""

    id: str | None = Field(default=None, description="Optional deterministic artifact ID")
    title: str = Field(..., min_length=3, max_length=280)
    source_type: SourceType
    service: str = Field(..., min_length=2, max_length=96)
    environment: str = Field(default="production", max_length=48)
    severity: str = Field(default="INFO", max_length=32)
    version: str | None = Field(default=None, max_length=64)
    raw_content: str = Field(..., min_length=10)
    metadata: dict[str, Any] = Field(default_factory=dict)


class KnowledgeDocumentOut(BaseModel):
    """Ingested document summary returned by knowledge endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    source_type: str
    service: str
    environment: str
    severity: str
    version: str | None = None
    raw_content: str
    doc_metadata: dict[str, Any] = Field(default_factory=dict)
    chunk_count: int = 0
    created_at: datetime


class RetrievedChunkOut(BaseModel):
    """Single RAG chunk retrieved via hybrid pgvector + keyword RRF search."""

    chunk_id: str
    document_id: str
    title: str
    source_type: str
    service: str
    environment: str
    severity: str
    content: str
    vector_score: float
    lexical_score: float
    hybrid_score: float
    metadata: dict[str, Any] = Field(default_factory=dict)


class SemanticSearchRequest(BaseModel):
    """Direct RAG search inspection request."""

    query: str = Field(..., min_length=2)
    service: str | None = None
    source_types: list[SourceType] | None = None
    top_k: int = Field(default=8, ge=1, le=25)


class PossibleCauseItem(BaseModel):
    """Ranked root cause hypothesis with probability and causal mechanism."""

    rank: int
    cause: str
    probability: float = Field(..., ge=0.0, le=1.0)
    mechanism: str
    supporting_sources: list[str] = Field(default_factory=list)


class LogPatternMatch(BaseModel):
    """Clustered matching log anomaly signature extracted during RCA."""

    pattern_id: str
    signature: str
    severity: str
    occurrences: int
    service: str
    first_seen: str
    sample_line: str
    correlation_note: str


class EvidenceItem(BaseModel):
    """Concrete piece of telemetry/documentation evidence backing the RCA."""

    source_id: str
    source_type: str
    title: str
    service: str
    snippet: str
    relevance_score: float
    timestamp: str | None = None
    badge_label: str


class InvestigationStep(BaseModel):
    """Actionable diagnostic verification step with copy-ready CLI/SQL command."""

    step_number: int
    action: str
    command: str
    rationale: str
    expected_signal: str


class SuggestedFix(BaseModel):
    """Structured mitigation & permanent remediation plan."""

    immediate_mitigation: str
    rollback_command: str
    permanent_remediation: str
    config_or_code_diff: str
    risk_level: str = "LOW"
    estimated_recovery_time: str = "2-5 minutes"


class RunbookReference(BaseModel):
    """Matched operational runbook linked to the investigation."""

    id: str
    title: str
    service: str
    sla_minutes: int = 15
    summary: str
    key_commands: list[str] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    access_count: int = 0


class RetrievalChecklist(BaseModel):
    """Verification of which RAG telemetry silos contributed to the conclusion."""

    deployment_logs: bool = False
    api_and_error_logs: bool = False
    previous_incidents: bool = False
    runbooks: bool = False
    architecture_docs: bool = False
    troubleshooting_guides: bool = False


class AgentTraceStep(BaseModel):
    """Execution telemetry for each stage of the OPSENTINEL Incident Agent."""

    stage: str
    component: str
    detail: str
    duration_ms: float
    status: str = "ok"


class InvestigationRequest(BaseModel):
    """Natural language incident investigation request."""

    query: str = Field(..., min_length=3, max_length=2000)
    session_id: str | None = Field(default=None, max_length=80)
    service_filter: str | None = Field(default=None, max_length=96)
    source_types: list[SourceType] | None = None
    top_k: int = Field(default=10, ge=3, le=20)
    bypass_cache: bool = False


class RCARequest(BaseModel):
    """Automated Root Cause Analysis request for a tracked or ad-hoc incident."""

    incident_id: str | None = None
    title: str | None = None
    service: str | None = None
    symptom_summary: str | None = None
    metric_spike: str | None = None
    severity: SeverityLevel = "SEV-1"
    bypass_cache: bool = False


class InvestigationResponse(BaseModel):
    """Complete structured output from the OPSENTINEL Incident Intelligence Agent."""

    investigation_id: str
    session_id: str
    mode: Literal["investigate", "auto_rca"]
    query: str
    headline_conclusion: str
    confidence_score: float
    severity: SeverityLevel
    affected_services: list[str]
    retrieval_checklist: RetrievalChecklist
    possible_causes: list[PossibleCauseItem]
    matching_log_patterns: list[LogPatternMatch]
    evidence: list[EvidenceItem]
    recommended_investigation: list[InvestigationStep]
    suggested_fix: SuggestedFix
    relevant_runbook: RunbookReference | None = None
    retrieved_chunks: list[RetrievedChunkOut] = Field(default_factory=list)
    agent_trace: list[AgentTraceStep] = Field(default_factory=list)
    cached: bool = False
    latency_ms: float = 0.0
    llm_mode: str = "evidence-grounded-synthesizer"
    generated_at: datetime


class IncidentCreateRequest(BaseModel):
    """Declare or simulate a new active production incident."""

    title: str = Field(..., min_length=4, max_length=280)
    service: str = Field(..., min_length=2, max_length=96)
    severity: SeverityLevel = "SEV-1"
    symptom_summary: str = Field(..., min_length=8)
    metric_spike: str = Field(default="Elevated error rate")
    environment: str = Field(default="production")


class IncidentStatusUpdateRequest(BaseModel):
    """Update status of an active incident."""

    status: IncidentStatus


class ActiveIncidentOut(BaseModel):
    """Serialized active production incident."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    service: str
    severity: str
    status: str
    symptom_summary: str
    metric_spike: str
    environment: str
    triggered_at: datetime
    latest_rca: dict[str, Any] | None = None
    updated_at: datetime


class RuntimeLLMConfigRequest(BaseModel):
    """Optional runtime LLM configuration update."""

    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"
