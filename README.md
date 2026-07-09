# BIGGCLAW - Admin Console

*built by BigOne*

A secure, self-hosted admin console that wraps the [VulnClaw](https://github.com/Unclecheng-li/VulnClaw) AI penetration-testing engine. Sign in as the administrator, edit your engagement data directly on the server, drive the full VulnClaw command surface, watch live output, and browse the reports it produces - all from one professional, interactive web console.

---

## Highlights

- **Server-side admin login** - PBKDF2-SHA256 password verification, signed expiring session token, login rate-limiting, and strict security headers (CSP, HSTS, nosniff, frame-deny). Nothing sensitive lives in the browser.
- **Editable server state (full CRUD)** - the console reads and writes real data on the server:
  - **Target** - name, URL, IP, scope, notes.
  - **Findings** - add, edit, and delete (title, severity, status, endpoint, description). Persisted to `state.json`.
- **Interactive findings table** - live **search** (title, endpoint, ID, description), **severity** and **status** filters, and **inline editing**: change severity/status from a dropdown right in the row, or click a title/endpoint to edit it in place. A full detail modal is available too.
- **Complete VulnClaw engine** - every real command is wired in:
  - Assessments: `run`, `recon`, `scan`, `exploit`, `persistent` (built as safe argument lists, never a shell string) with live streamed output.
  - Engine management: `doctor`, `--version`, `init`, and `config` (provider / model / base URL / API key, plus dynamic `config provider --list`).
- **Reports** - list, search, view, and download the Markdown reports and PoCs VulnClaw writes.
- **Live / Demo mode** - if VulnClaw is installed it runs for real ("VulnClaw live" + engine version shown); if not, a clearly labelled demo keeps the console fully usable.
- **Professional & responsive** - clean design system, toast notifications, keyboard support (Enter to submit, Esc to close), and a layout that works on phone and desktop.

---

## Files

| File | Purpose |
|------|---------|
| `app.py` | Flask backend: auth, editable state CRUD, VulnClaw runner, engine management, reports API |
| `biggclaw.html` | The single-page interactive admin console (served by the backend) |
| `requirements.txt` | Python dependencies (Flask, gunicorn) |
| `render.yaml` | Render Blueprint - one-click deploy config (installs VulnClaw) |
| `set_password.py` | Helper to generate your password hash |
| `README.md` | This file |

---

## 1. Set your admin password

The server never stores a plaintext password - only a hash. Generate yours:

```bash
python3 set_password.py
```

Enter your password when prompted (default admin password is `Kwaku@2007`). Copy the printed line that starts with `pbkdf2_sha256$...` - that is your `ADMIN_PASSWORD_HASH`.

> The default admin email is `manuelfosu360@gmail.com`. Change `ADMIN_EMAIL` if you want a different one.

---

## 2. Run it locally (optional)

```bash
pip install -r requirements.txt
pip install "vulnclaw[web]"   # optional: enables the real engine locally

export ADMIN_EMAIL="manuelfosu360@gmail.com"
export ADMIN_PASSWORD_HASH="pbkdf2_sha256$..."   # from step 1
export SESSION_SECRET="any-long-random-string"
export VULNCLAW_PROVIDER="deepseek"
export VULNCLAW_LLM_MODEL="deepseek-v4-pro"
export VULNCLAW_LLM_API_KEY="sk-your-deepseek-key"

python3 app.py
# open http://localhost:8000
```

If `vulnclaw` is not installed the console still runs in **Demo mode**. You can also initialize and configure the engine later from the **Settings** tab.

---

## 3. Deploy to Render (recommended)

1. Push this folder to the **root** of a GitHub repository.
2. In Render: **New -> Blueprint**, connect the repo. Render reads `render.yaml` and creates a Python web service named **biggclaw**.
3. The build command installs the console **and** VulnClaw:
   ```
   pip install -r requirements.txt && pip install "vulnclaw[web]"
   ```
4. Set the secret environment variables (see table). `SESSION_SECRET` is generated automatically.
5. Deploy, open your `https://biggclaw.onrender.com` URL, and sign in.

### Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `ADMIN_EMAIL` | yes | Admin login email (preset to `manuelfosu360@gmail.com`) |
| `ADMIN_PASSWORD_HASH` | yes | From `set_password.py`. Set as a **secret** (sync: false) |
| `SESSION_SECRET` | auto | Render generates it. Signs session tokens |
| `TOKEN_TTL` | no | Session lifetime in seconds (default 43200 = 12h) |
| `VULNCLAW_PROVIDER` | no | `openai`, `deepseek`, `minimax`, `zhipu`, `moonshot`, `qwen`, `siliconflow`, `baichuan`, `stepfun` |
| `VULNCLAW_LLM_MODEL` | no | e.g. `deepseek-v4-pro` |
| `VULNCLAW_LLM_API_KEY` | yes* | Your LLM key. Set as a **secret**. *Required for live assessments |
| `VULNCLAW_LLM_BASE_URL` | no | Custom API base URL if your provider needs it |
| `VULNCLAW_BIN` | no | Path to the vulnclaw binary (default `vulnclaw`) |
| `VULNCLAW_WORKDIR` | no | Where state, reports, and PoCs are written (default `./work`) |

You can also change the provider/model/key and initialize the engine later from the console's **Settings** page.

---

## Using the console

- **Overview** - open/critical counts, severity breakdown bar, target summary, engine status + version, and a live `doctor` readout.
- **Target** - edit engagement details; **Save target** (or **Revert**).
- **Findings** - search and filter by severity/status; edit severity/status inline; click a title or endpoint to edit in place; **+ Add finding** or open **Details** for the full form; delete with a two-click confirm.
- **Assessment** - pick a target and mode, review the exact command, then **Run**. Output streams live; a built-in **command reference** explains every mode. When a run finishes, BIGGCLAW **auto-imports the results**: it parses the session JSON, the generated report table, and the live output, then adds any new vulnerabilities to **Findings** (deduplicated) and shows a summary banner with the severity breakdown and links to the produced reports. Use the banner's report links or the **Reports** tab to open them. Re-import a job's results anytime with `POST /api/jobs/<id>/import`.
- **Reports** - search, **View**, or **Download** any generated report or PoC.
- **Settings** - set the LLM provider/model/key, **Refresh providers** (dynamic list), **Initialize engine** (`init`), and **Reload current config**.

### VulnClaw command reference

| Command | Purpose | Example |
|---------|---------|---------|
| `run` | Full pipeline (recon -> scan -> exploit -> report) | `vulnclaw run TARGET` |
| `recon` | Reconnaissance only | `vulnclaw recon TARGET` |
| `scan` | Vulnerability scan | `vulnclaw scan TARGET --ports 80,443` |
| `exploit` | Verify a CVE / run a command | `vulnclaw exploit TARGET --cve CVE-2024-1234 --cmd id` |
| `persistent` | Long-running autonomous loop | `vulnclaw persistent TARGET -r 100 -c 10` |
| `doctor` | Environment health check | `vulnclaw doctor` |
| `init` | Initialize engine workspace | `vulnclaw init` |
| `config` | Manage provider/model/key | `vulnclaw config provider deepseek` |

---

## Security notes

- Passwords are hashed with PBKDF2-SHA256 (200k iterations); only the hash is stored.
- Session tokens are HMAC-signed with `SESSION_SECRET` and expire after `TOKEN_TTL`.
- Failed logins are rate-limited (5 attempts / 5 minutes per IP).
- Strict CSP + security headers + HSTS are sent on every response.
- Report downloads are filename-validated and path-traversal protected.
- Assessment commands run as validated argument lists - never through a shell.

## Authorized use only

BIGGCLAW runs offensive security tooling. Only test systems you own or are explicitly authorized to assess. You are responsible for complying with all applicable laws and agreements.
