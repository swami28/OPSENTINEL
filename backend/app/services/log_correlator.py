"""Log anomaly clustering and deployment temporal correlation engine."""

from __future__ import annotations

import re
from collections import OrderedDict

from app.schemas.api import LogPatternMatch, RetrievedChunkOut

ISO_TS_RE = re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?")
TRACE_OR_HEX_RE = re.compile(r"\b(?:tr-[a-z0-9]+|req-[a-z0-9]+|0x[0-9a-f]+|[0-9a-f]{8,})\b", re.IGNORECASE)
DURATION_RE = re.compile(r"\b\d+(?:\.\d+)?\s*(?:ms|s)\b")
POD_SUFFIX_RE = re.compile(r"-[a-z0-9]{5,10}-[a-z0-9]{5}\b")
ANOMALY_LEVEL_RE = re.compile(r"\b(CRITICAL|FATAL|ERROR|WARN|WARNING)\b", re.IGNORECASE)


def _normalize_log_signature(line: str) -> str:
    """Strip timestamps, pod hashes, trace IDs, and transient timings to form a canonical signature."""
    sig = ISO_TS_RE.sub("", line).strip()
    sig = POD_SUFFIX_RE.sub("-<pod>", sig)
    sig = TRACE_OR_HEX_RE.sub("<id>", sig)
    sig = re.sub(r"trace_id=[^\s,\]]+", "trace_id=<id>", sig)
    sig = re.sub(r"duration=\d+(?:\.\d+)?ms", "duration=<ms>", sig)
    sig = re.sub(r"\s+", " ", sig).strip(" -|")
    return sig[:150]


def extract_matching_log_patterns(
    retrieved_chunks: list[RetrievedChunkOut],
    max_patterns: int = 5,
) -> list[LogPatternMatch]:
    """Cluster error and warning log lines from retrieved RAG chunks into correlated patterns."""
    log_chunks = [
        c for c in retrieved_chunks if c.source_type in ("error_log", "application_log")
    ]
    deployment_chunks = [c for c in retrieved_chunks if c.source_type == "deployment"]

    deploy_note = "Active in retrieved production log window"
    if deployment_chunks:
        top_dep = deployment_chunks[0]
        ver = top_dep.metadata.get("version") or ""
        dep_ts = top_dep.metadata.get("deployed_at") or ""
        if ver and dep_ts:
            deploy_note = f"Surged immediately following {top_dep.service} {ver} rollout ({dep_ts})"
        elif ver:
            deploy_note = f"Correlated with {top_dep.service} release {ver} ({top_dep.document_id})"
        else:
            deploy_note = f"Correlated with deployment {top_dep.document_id}"

    clusters: OrderedDict[str, dict[str, object]] = OrderedDict()

    for chunk in log_chunks:
        for raw_line in chunk.content.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            level_match = ANOMALY_LEVEL_RE.search(line)
            if not level_match and not any(
                kw in line.lower()
                for kw in ("500", "401", "502", "exception", "timeout", "oomkilled", "137", "lag", "seq scan")
            ):
                continue

            severity = level_match.group(1).upper() if level_match else chunk.severity
            if severity == "WARNING":
                severity = "WARN"

            ts_match = ISO_TS_RE.search(line)
            ts = ts_match.group(0) if ts_match else (chunk.metadata.get("event_timestamp") or "recent")
            signature = _normalize_log_signature(line)
            if len(signature) < 12:
                continue

            # Group lines sharing first 72 chars of normalized signature
            cluster_key = f"{chunk.service}::{signature[:72].lower()}"
            if cluster_key not in clusters:
                # Honor explicit occurrence multiplier if log line carries `(x48)` or metadata count
                rep_match = re.search(r"occurrences=(\d+)|\(x(\d+)\)", line, re.IGNORECASE)
                initial_count = (
                    int(rep_match.group(1) or rep_match.group(2)) if rep_match else 1
                )
                clusters[cluster_key] = {
                    "signature": signature,
                    "severity": severity,
                    "occurrences": initial_count,
                    "service": chunk.service,
                    "first_seen": str(ts),
                    "sample_line": line[:240],
                }
            else:
                entry = clusters[cluster_key]
                entry["occurrences"] = int(entry["occurrences"]) + 1  # type: ignore[arg-type]

    severity_rank = {"CRITICAL": 0, "FATAL": 0, "ERROR": 1, "WARN": 2, "INFO": 3}
    sorted_items = sorted(
        clusters.values(),
        key=lambda d: (
            severity_rank.get(str(d["severity"]), 3),
            -int(d["occurrences"]),  # type: ignore[arg-type]
        ),
    )

    results: list[LogPatternMatch] = []
    for idx, item in enumerate(sorted_items[:max_patterns], start=1):
        results.append(
            LogPatternMatch(
                pattern_id=f"PAT-{idx:02d}",
                signature=str(item["signature"]),
                severity=str(item["severity"]),
                occurrences=int(item["occurrences"]),  # type: ignore[arg-type]
                service=str(item["service"]),
                first_seen=str(item["first_seen"]),
                sample_line=str(item["sample_line"]),
                correlation_note=deploy_note,
            )
        )
    return results
