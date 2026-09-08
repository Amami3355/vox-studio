"""Copy explicit public trial evidence; never operator configuration, credentials or grants."""
import argparse
import json
from pathlib import Path
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("delivery", type=Path)
parser.add_argument("destination", type=Path)
args = parser.parse_args()
args.destination.mkdir(parents=True, exist_ok=False)
for name in ("deployment.json", "verification.json", "http-verification.json"):
    shutil.copyfile(args.delivery / name, args.destination / name)
for slug in ("rocket", "sky"):
    folder = args.delivery / slug
    state = json.loads((folder / "evidence.json").read_text(encoding="utf-8"))
    documents = {
        "original-prompt": {"text": state["originalRequest"]["brief"]["text"]},
        "editorial": {k: state.get(k) for k in (
            "editorialBrief", "searches", "researchDossier", "narrative", "visualBible", "videoPlan")},
        "corrections-reviews": {k: state.get(k) for k in (
            "images", "filmReviews", "events", "editorialCorrections", "technicalRepairs", "filmCorrections",
            "reconciliations", "accountingReconciliations", "terminal", "contractDiagnostic")},
        "image-commands": [step for step in state["steps"].values() if step["name"].startswith("production.image_")],
    }
    for name, value in documents.items():
        (args.destination / (slug + "-" + name + ".json")).write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")
    for name in ("provider-usage.json", "export-index.json"):
        shutil.copyfile(folder / name, args.destination / (slug + "-" + name))
print(str(args.destination.resolve()))
