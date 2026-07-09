"""WSGI entry point for the BIGGCLAW console.

Run with:  gunicorn wsgi:app --bind 0.0.0.0:$PORT
The console imports the installed `vulnclaw` package to drive the engine.
"""
from biggclaw.app import app

if __name__ == "__main__":
    import os
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
