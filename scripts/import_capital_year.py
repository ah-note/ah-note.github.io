"""Install a parent-validated annual document into the local capital preview."""
import argparse
import hashlib
import json
from pathlib import Path


def install(source, destination, company, run_id, bundle_sha):
    raw = Path(source).read_bytes()
    doc = json.loads(raw)
    if doc.get("schema") not in ("capital-statement-v1", "capital-statement-v2", "capital-statement-v3") or doc.get("company") != company:
        raise ValueError("ANNUAL_IDENTITY_OR_SCHEMA_MISMATCH")
    if doc.get("schema") == "capital-statement-v2" and (not doc.get("facts") or not isinstance(doc.get("mappings"), list)):
        raise ValueError("ANNUAL_FACT_LEDGER_REQUIRED")
    if doc.get("schema") == "capital-statement-v3":
        if not doc.get("facts") or not isinstance(doc.get("mappings"), list):
            raise ValueError("ANNUAL_FACT_LEDGER_REQUIRED")
        if doc.get("display_registry", {}).get("version") not in ("capital-display-v1", "capital-display-v2"):
            raise ValueError("ANNUAL_DISPLAY_REGISTRY_REQUIRED")
        if len(doc.get("custom_fields", [])) > 5:
            raise ValueError("ANNUAL_CUSTOM_FIELD_LIMIT")
    validation = doc.get("validation", {})
    if validation.get("status") not in ("passed", "warning") or validation.get("errors"):
        raise ValueError("PARENT_VALIDATION_REQUIRED")
    year = doc.get("year")
    if type(year) is not int or not 1900 <= year <= 2200:
        raise ValueError("INVALID_YEAR")
    root = Path(destination)
    manifest_path = root / "annual-manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"company": company, "currency": doc["currency"], "years": {}}
    if manifest["company"] != company or manifest["currency"] != doc["currency"]:
        raise ValueError("MANIFEST_SCOPE_MISMATCH")
    digest = hashlib.sha256(raw).hexdigest()
    relative = f"annual/{year}.{digest[:16]}.json"
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.read_bytes() != raw:
        raise ValueError("CONTENT_ADDRESSED_FILE_CONFLICT")
    target.write_bytes(raw)
    manifest["years"][str(year)] = {"file": relative, "sha256": digest, "source_run": run_id, "bundle_sha256": bundle_sha}
    manifest["files"] = [value["file"] for _, value in sorted(manifest["years"].items())]
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
