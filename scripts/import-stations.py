"""Rebuild the canonical picker directory from the official passenger-station PDF.

Usage: python scripts/import-stations.py national-directory.pdf [southern-directory.pdf]
Requires pdfplumber. Downloads are deliberate; this script never fetches a remote file.
"""
import json
import re
import sys
import hashlib
from pathlib import Path
import pdfplumber

root = Path(__file__).resolve().parents[1]
if len(sys.argv) not in (2, 3):
    raise SystemExit(__doc__)
source = Path(sys.argv[1])
cache = root / ".tmp/station-national-cache.json"
cache.parent.mkdir(parents=True, exist_ok=True)
stations = {}
conflicts = []
def clean(value):
    return re.sub(r"\s+", " ", value or "").strip()
def title(value):
    return clean(value).title().replace(" Jn.", " Junction").replace(" Jn", " Junction")

source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
if cache.exists() and json.loads(cache.read_text(encoding="utf-8"))["sourceHash"] == source_hash:
    cached = json.loads(cache.read_text(encoding="utf-8"))
    stations, conflicts = cached["stations"], cached["conflicts"]
else:
  with pdfplumber.open(source) as pdf:
    for page in pdf.pages:
        for table in page.extract_tables():
            for row in table:
                if len(row) != 8 or not re.fullmatch(r"\d+", clean(row[0])):
                    continue
                _, name, code, category, _, _, district, state = map(clean, row)
                # Some official rows repeat the code with a line annotation,
                # e.g. SHC (D.D LINE). The code itself is SHC.
                code = re.sub(r"\s*\(.*?\)\s*", "", code).upper().strip()
                if not re.fullmatch(r"[A-Z0-9]{1,6}", code) or not name:
                    print(f"Skipping non-canonical annotated row: {row}", flush=True)
                    continue
                record = {"code": code, "name": title(name), "city": title(district), "state": title(state), "aliases": [], "priority": {"NSG1": 70, "NSG2": 55, "NSG3": 40}.get(category.replace("-", ""), 0)}
                if code in stations and stations[code]["name"] != record["name"]:
                    conflicts.append([stations[code], record])
                else:
                    stations[code] = record
        print(f"Read page {page.page_number}/{len(pdf.pages)}", flush=True) if page.page_number % 30 == 0 else None
  cache.write_text(json.dumps({"sourceHash":source_hash,"stations":stations,"conflicts":conflicts}), encoding="utf-8")
if len(stations) < 7000:
    raise ValueError(f"Only {len(stations)} stations extracted; inspect the PDF before updating the catalogue.")
if conflicts:
    (root / ".tmp/station-conflicts.json").write_text(json.dumps(conflicts, indent=2), encoding="utf-8")
    # Exclude conflicting rows until an operator verifies them. Never choose
    # between two different stations sharing a code without review.
    for existing, _ in conflicts:
        stations.pop(existing["code"], None)
    print(f"Excluded {len(conflicts)} conflicting codes; inspect .tmp/station-conflicts.json", flush=True)
if len(sys.argv) > 2:
    with pdfplumber.open(Path(sys.argv[2])) as southern:
        for page in southern.pages:
            for table in page.extract_tables():
                for row in table:
                    if len(row) != 6 or not re.fullmatch(r"\d+", clean(row[0])):
                        continue
                    _, name, code, _, category, _ = map(clean, row)
                    code = code.upper()
                    if re.fullmatch(r"[A-Z0-9]{1,6}", code) and code not in stations:
                        stations[code] = {"code":code,"name":title(name),"city":"","state":"","aliases":[],"priority":{"NSG1":70,"NSG2":55,"NSG3":40}.get(category.replace(" ",""),0)}
overrides = json.loads((root / "shared/station-overrides.json").read_text(encoding="utf-8"))
for code, override in overrides.items():
    if code not in stations:
        if not all(field in override for field in ("name", "city", "state")):
            raise ValueError(f"Override code missing from official directory: {code}")
        # Full supplemental entries require name, district/city and state.
        # Keep their verification sources in shared/STATIONS.md.
        stations[code] = {"code": code, "name": override["name"], "city": override["city"], "state": override["state"], "aliases": [], "priority": 0}
    stations[code].update(override)
(root / "shared/stations.json").write_text(json.dumps(sorted(stations.values(), key=lambda item: item["code"]), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"Wrote {len(stations)} canonical stations")
