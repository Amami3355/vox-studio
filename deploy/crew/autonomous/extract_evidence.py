"""Extract this deployment's evidence using safe tar filtering and Windows long paths."""
import argparse
import os
from pathlib import Path
import tarfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("archive", type=Path)
parser.add_argument("destination", type=Path)
args = parser.parse_args()
destination = args.destination.resolve()
if os.name == "nt":
    destination = Path(chr(92) * 2 + "?" + chr(92) + str(destination))
destination.mkdir(parents=True, exist_ok=True)
with tarfile.open(args.archive) as archive:
    for member in archive:
        archive.extract(member, destination, set_attrs=False, filter="data")
