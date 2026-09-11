"""Install a parent-validated reporting-period document into the capital site."""
import argparse
import hashlib
import json
import re
from pathlib import Path


def install(source, destination, company, run_id, bundle_sha):
    raw = Path(source).read_bytes()
    doc = json.loads(raw)
    if doc.get("schema") not in ("capital-statement-v3", "capital-statement-v4", "capital-statement-v5") or doc.get("company") != company:
        raise ValueError("ANNUAL_IDENTITY_OR_SCHEMA_MISMATCH")
    if doc.get("schema") in ("capital-statement-v3", "capital-statement-v4", "capital-statement-v5"):
        if not doc.get("facts") or not isinstance(doc.get("mappings"), list):
            raise ValueError("ANNUAL_FACT_LEDGER_REQUIRED")
        if doc.get("display_registry", {}).get("version") != "capital-display-v1":
            raise ValueError("ANNUAL_DISPLAY_REGISTRY_REQUIRED")
        if len(doc.get("custom_fields", [])) > 5:
            raise ValueError("ANNUAL_CUSTOM_FIELD_LIMIT")
    validation = doc.get("validation", {})
    if validation.get("status") not in ("passed", "warning") or validation.get("errors"):
        raise ValueError("PARENT_VALIDATION_REQUIRED")
    period_start, period_end = doc.get("period_start"), doc.get("period_end")
    if (not isinstance(period_start, str) or not isinstance(period_end, str) or
            not re.fullmatch(r"\d{4}-\d{2}-\d{2}", period_start) or
            not re.fullmatch(r"\d{4}-\d{2}-\d{2}", period_end) or period_start >= period_end):
        raise ValueError("INVALID_REPORTING_PERIOD")
    root = Path(destination)
    manifest_path = root / "annual-manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {
        "schema": "capital-period-manifest-v1", "company": company, "currency": doc["currency"], "periods": {}}
    if manifest["company"] != company or manifest["currency"] != doc["currency"]:
        raise ValueError("MANIFEST_SCOPE_MISMATCH")
    digest = hashlib.sha256(raw).hexdigest()
    relative = f"annual/{period_end}.{digest[:16]}.json"
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.read_bytes() != raw:
        raise ValueError("CONTENT_ADDRESSED_FILE_CONFLICT")
    target.write_bytes(raw)
    manifest["periods"][period_end] = {"period_start": period_start, "period_end": period_end,
        "file": relative, "sha256": digest, "source_run": run_id, "bundle_sha256": bundle_sha}
    manifest["files"] = [value["file"] for _, value in sorted(manifest["periods"].items())]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return relative


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--destination", required=True)
    p.add_argument("--company", required=True)
    p.add_argument("--run-id", required=True)
    p.add_argument("--bundle-sha", required=True)
    a = p.parse_args()
    print(install(a.input, a.destination, a.company, a.run_id, a.bundle_sha))
