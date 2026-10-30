"""Import a folder of ultrasound images into the AstraFit reference tables.

Usage (from ASTRAFIT_SOFTWARE):
  python server/ingest.py --folder datasets/pocus --name "POCUS" \
      --url "https://github.com/jannisborn/covid19_pocus_ultrasound" \
      --license "see repo" --anatomy lung

The image's parent folder name becomes its label. Re-running is safe:
duplicates are skipped by SHA-256.
"""
import argparse, hashlib, pathlib, sqlite3

HERE = pathlib.Path(__file__).resolve().parent
SCHEMA = HERE / "schema.sql"
DEFAULT_DB = HERE / "data" / "astrafit.db"
EXTS = {".jpg", ".jpeg", ".png"}

ap = argparse.ArgumentParser()
ap.add_argument("--folder", required=True)
ap.add_argument("--name", required=True)
ap.add_argument("--url", default="")
ap.add_argument("--license", default="")
ap.add_argument("--anatomy", default="")
ap.add_argument("--db", default=str(DEFAULT_DB))
a = ap.parse_args()

pathlib.Path(a.db).parent.mkdir(parents=True, exist_ok=True)
con = sqlite3.connect(a.db)
con.executescript(SCHEMA.read_text(encoding="utf-8"))
con.execute(
    "INSERT OR IGNORE INTO ref_datasets(name, source_url, license, anatomy) VALUES (?,?,?,?)",
    (a.name, a.url, a.license, a.anatomy),
)
ds_id = con.execute("SELECT dataset_id FROM ref_datasets WHERE name=?", (a.name,)).fetchone()[0]

added = skipped = 0
for p in pathlib.Path(a.folder).rglob("*"):
    if p.suffix.lower() not in EXTS:
        continue
    h = hashlib.sha256(p.read_bytes()).hexdigest()
    b = int(h[:2], 16)
    split = "train" if b < 180 else "val" if b < 218 else "test"
    try:
        con.execute(
            "INSERT INTO ref_images(dataset_id, file_path, label, split, sha256) VALUES (?,?,?,?,?)",
            (ds_id, str(p), p.parent.name, split, h),
        )
        added += 1
    except sqlite3.IntegrityError:
        skipped += 1

con.commit()
print(f"Added {added} images, skipped {skipped} duplicates")
for label, n in con.execute(
    "SELECT label, COUNT(*) FROM ref_images WHERE dataset_id=? GROUP BY label", (ds_id,)
):
    print(f"  {label}: {n}")