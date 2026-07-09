# Merging BIGGCLAW into the VulnClaw repository

**BIGGCLAW** (built by BigOne) is a secure admin console that runs *on top of* the
[VulnClaw](https://github.com/Unclecheng-li/VulnClaw) engine. This overlay adds the
console to the VulnClaw repo so the engine and the interface deploy as **one project** -
no separate service, no copy/paste. The console calls the same `vulnclaw` package that
`pip install -e .` installs from the repo.

> This is an **overlay**: a `biggclaw/` package plus a few root files. It only *adds*
> files - it does not modify any existing VulnClaw source.

## What this overlay contains

```
biggclaw/                  # the console (Flask backend + single-page UI)
  __init__.py
  app.py                   # auth, editable target/findings CRUD, engine runner, reports
  biggclaw.html            # the interactive admin console (served at /)
  set_password.py          # generate your admin password hash
  requirements.txt         # Flask + gunicorn (added on top of VulnClaw's own deps)
wsgi.py                    # WSGI entry: `gunicorn wsgi:app`
Procfile                   # process definition for PaaS hosts
render.yaml                # one-click Render Blueprint for the merged repo
.env.biggclaw.example      # environment template
merge.sh                   # copies this overlay into your VulnClaw clone
```

## Step 1 - Get both repos together

```bash
git clone https://github.com/Unclecheng-li/VulnClaw.git
# from the folder that contains this overlay:
./merge.sh /path/to/VulnClaw
```

`merge.sh` copies `biggclaw/`, `wsgi.py`, `Procfile`, `render.yaml`, and
`.env.biggclaw.example` into your clone (backing up any file it would replace).

Now commit and push the merged repo to **your** GitHub:

```bash
cd /path/to/VulnClaw
git add . && git commit -m "Add BIGGCLAW admin console" && git push
```

## Step 2 - Run it locally

```bash
cd /path/to/VulnClaw
python -m venv .venv && source .venv/bin/activate
pip install -e .                        # installs the VulnClaw engine (gives `vulnclaw`)
pip install -r biggclaw/requirements.txt

python biggclaw/set_password.py         # enter Kwaku@2007 -> copy the pbkdf2_sha256$... line
cp .env.biggclaw.example .env           # paste the hash into ADMIN_PASSWORD_HASH, add your API key
set -a && . ./.env && set +a            # load the env vars

python wsgi.py                          # open http://localhost:8000
```

The console detects the engine automatically. If `vulnclaw` is importable it runs for
real ("VulnClaw live" + version shown); otherwise it stays in a clearly labelled demo.

## Step 3 - Deploy to Render (recommended)

1. Push the merged repo to GitHub (Step 1).
2. Render -> **New -> Blueprint** -> pick the repo. It reads `render.yaml` and creates a
   web service named **biggclaw**. The build installs the engine **and** the console:
   ```
   pip install -e . && pip install "vulnclaw[web]" && pip install -r biggclaw/requirements.txt
   ```
   and starts `gunicorn wsgi:app`.
3. Set the secret env vars: `ADMIN_PASSWORD_HASH` and `VULNCLAW_LLM_API_KEY`
   (`SESSION_SECRET` is generated automatically).
4. Open your `https://biggclaw.onrender.com` URL and sign in.

## Step 4 - Docker (optional, uses the repo's compose)

VulnClaw ships a Docker image. To serve the BIGGCLAW console from it, run the container
and start the console instead of the default entry (state persists to the `/data` volume):

```bash
docker build -t vulnclaw-biggclaw .
docker run --rm -it -p 8000:8000 \
  -e ADMIN_EMAIL=manuelfosu360@gmail.com \
  -e ADMIN_PASSWORD_HASH="pbkdf2_sha256$..." \
  -e SESSION_SECRET="a-long-random-string" \
  -e VULNCLAW_LLM_API_KEY="sk-your-deepseek-key" \
  -e VULNCLAW_WORKDIR=/data \
  -v vulnclaw-data:/data \
  vulnclaw-biggclaw \
  sh -c "pip install -r biggclaw/requirements.txt && gunicorn wsgi:app --bind 0.0.0.0:8000"
```

> VulnClaw's own `vulnclaw web` UI (port 7788) still works independently. BIGGCLAW is the
> secured admin console (login + editable findings/target) layered on the same engine.

## Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `ADMIN_EMAIL` | yes | Login email (preset `manuelfosu360@gmail.com`) |
| `ADMIN_PASSWORD_HASH` | yes | From `set_password.py`; set as a secret |
| `SESSION_SECRET` | yes | Long random string; signs session tokens |
| `TOKEN_TTL` | no | Session lifetime seconds (default 43200) |
| `VULNCLAW_BIN` | no | `vulnclaw` (default). The console also falls back to `python -m vulnclaw` |
| `VULNCLAW_PROVIDER` | no | openai / anthropic / deepseek / minimax / zhipu / moonshot / qwen / siliconflow / doubao / baichuan |
| `VULNCLAW_LLM_MODEL` | no | e.g. `deepseek-v4-pro` |
| `VULNCLAW_LLM_API_KEY` | yes* | Your LLM key (secret). *Needed for live assessments |
| `VULNCLAW_LLM_BASE_URL` | no | Custom API base URL |
| `VULNCLAW_WORKDIR` | no | Where engine state/reports live (use `/data` in Docker) |

## Signing in

Email `manuelfosu360@gmail.com`, password `Kwaku@2007` (change it via `set_password.py`).

Only assess systems you own or are explicitly authorized to test.
