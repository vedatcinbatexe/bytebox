import sys
from pathlib import Path

# Let tests import runner modules (sandbox, languages) directly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
