"""BIGGCLAW - secure admin console for the VulnClaw engine (built by BigOne).

This sub-package lives inside the VulnClaw repository and reuses the installed
`vulnclaw` package/CLI directly, so the console and the engine deploy as a
single project. Import the WSGI app with:  from biggclaw.app import app
"""

__all__ = ["app"]
