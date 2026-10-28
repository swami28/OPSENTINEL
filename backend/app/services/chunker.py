"""Source-aware chunking pipeline for logs, deployments, runbooks, incidents, and architecture docs."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass
class ChunkDraft:
    """Intermediate chunk produced before vector embedding."""

    chunk_index: int
    content: str
    embed_input: str
    metadata: dict[str, Any]


SECTION_SPLIT_RE = re.compile(r"(?m)^(?=##\s+)")


def chunk_telemetry_document(
    *,
    title: str,
    source_type: str,
    service: str,
    environment: str,
    severity: str,
    raw_content: str,
    base_metadata: dict[str, Any] | None = None,
    max_chars: int = 950,
) -> list[ChunkDraft]:
    """Split a DevOps document or log stream into semantically coherent RAG chunks."""
    meta = dict(base_metadata or {})
    cleaned = raw_content.strip()
    if not cleaned:
        return []

    header_context = (
        f"Title: {title} | Service: {service} | Source: {source_type} "
        f"| Severity: {severity} | Env: {environment}"
    )

    if source_type in ("application_log", "error_log"):
        lines = [ln for ln in cleaned.splitlines() if ln.strip()]
        window_size = 10
        stride = 8
        drafts: list[ChunkDraft] = []
        if len(lines) <= window_size:
            body = "\n".join(lines)
            drafts.append(
                ChunkDraft(
                    chunk_index=0,
                    content=body,
                    embed_input=f"{header_context}\n{body}",
                    metadata={**meta, "line_count": len(lines)},
                )
            )
            return drafts

        idx = 0
        for start in range(0, len(lines), stride):
            window = lines[start : start + window_size]
            if not window:
                break
            body = "\n".join(window)
            drafts.append(
                ChunkDraft(
                    chunk_index=idx,
                    content=body,
                    embed_input=f"{header_context}\n{body}",
                    metadata={
                        **meta,
                        "line_start": start + 1,
                        "line_end": start + len(window),
                        "line_count": len(window),
                    },
                )
            )
            idx += 1
            if start + window_size >= len(lines):
                break
        return drafts

    # Structured Markdown / prose splitting for runbooks, incidents, deployments, architecture, guides
    sections = [sec.strip() for sec in SECTION_SPLIT_RE.split(cleaned) if sec.strip()]
    raw_blocks: list[str] = []
    for sec in sections:
        if len(sec) <= max_chars:
            raw_blocks.append(sec)
        else:
            paragraphs = [p.strip() for p in sec.split("\n\n") if p.strip()]
            buf = ""
            for para in paragraphs:
                candidate = f"{buf}\n\n{para}".strip() if buf else para
                if len(candidate) <= max_chars:
                    buf = candidate
                else:
                    if buf:
                        raw_blocks.append(buf)
                    buf = para[: max_chars * 2]
            if buf:
                raw_blocks.append(buf)

    if not raw_blocks:
        raw_blocks = [cleaned]

    return [
        ChunkDraft(
            chunk_index=i,
            content=block,
            embed_input=f"{header_context}\n{block}",
            metadata={**meta, "section_index": i},
        )
        for i, block in enumerate(raw_blocks)
    ]
