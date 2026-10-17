"""IRIS ingestion / modelling worker.

Runs outside the web app (GitHub Actions on a schedule) and writes to Supabase
with the service-role key. The Next.js app only ever reads what this writes.
"""

__version__ = "0.1.0"
