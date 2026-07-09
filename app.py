"""BIGGCLAW - secure admin console for VulnClaw. Built by BigOne.

Merges:
  * Real server-side authentication (PBKDF2 hash + signed expiring token).
  * A simplified admin console that drives the real VulnClaw CLI:
      recon / scan / exploit / run / persistent / report / doctor / config
    Commands run as background jobs; output streams to the browser.
  * If the `vulnclaw` binary is not installed, the console runs in a clearly
    labelled DEMO mode so the UI still works.
"""
import os, sys, time, json, hmac, base64, hashlib, secrets, threading, subprocess, shutil, re, uuid, shlex
import importlib.util
from flask import Flask, request, jsonify, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ---- Auth config ----
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "").strip()
ADMIN_PASSWORD_HASH = os.environ.get("ADMIN_PASSWORD_HASH", "").strip()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
SESSION_SECRET = os.environ.get("SESSION_SECRET", "").strip()
TOKEN_TTL = int(os.environ.get("TOKEN_TTL", "43200"))

# ---- VulnClaw config ----
VULNCLAW_BIN = os.environ.get("VULNCLAW_BIN", "vulnclaw").strip()
VULN_PROVIDER = os.environ.get("VULNCLAW_PROVIDER", "").strip()
VULN_MODEL = os.environ.get("VULNCLAW_LLM_MODEL", "").strip()
VULN_API_KEY = os.environ.get("VULNCLAW_LLM_API_KEY", "").strip()
VULN_BASE_URL = os.environ.get("VULNCLAW_LLM_BASE_URL", "").strip()
WORKDIR = os.environ.get("VULNCLAW_WORKDIR", os.path.join(BASE_DIR, "work"))
REPORTS_DIR = os.path.join(WORKDIR, "reports")
POCS_DIR = os.path.join(WORKDIR, "pocs")
for d in (WORKDIR, REPORTS_DIR, POCS_DIR):
    os.makedirs(d, exist_ok=True)

if not SESSION_SECRET:
    SESSION_SECRET = secrets.token_hex(32)
    print("WARNING: SESSION_SECRET not set; using ephemeral secret.")

def vc_base():
    """How to invoke VulnClaw: an explicit binary path, the console script on
    PATH, or the installed 'vulnclaw' package via 'python -m vulnclaw'.
    Returns an argv prefix list, or None when VulnClaw is unavailable (demo)."""
    if os.path.sep in VULNCLAW_BIN:
        return [VULNCLAW_BIN] if os.path.isfile(VULNCLAW_BIN) else None
    w = shutil.which(VULNCLAW_BIN)
    if w:
        return [w]
    if importlib.util.find_spec("vulnclaw") is not None:
        return [sys.executable, "-m", "vulnclaw"]
    return None

def bin_available():
    return vc_base() is not None

# ---------------- crypto ----------------
def _b64u(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")
def _b64u_decode(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
def hash_password(password, iterations=200000):
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return "pbkdf2_sha256${}${}${}".format(iterations, salt.hex(), dk.hex())
def verify_password(password, stored):
    try:
        algo, iters, salt_hex, hash_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False
def make_token(sub, ttl=TOKEN_TTL):
    now = int(time.time())
    payload = {"sub": sub, "iat": now, "exp": now + ttl}
    body = _b64u(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = _b64u(hmac.new(SESSION_SECRET.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest())
    return body + "." + sig
def verify_token(token):
    try:
        body, sig = token.split(".")
        expected = _b64u(hmac.new(SESSION_SECRET.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_b64u_decode(body))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        return payload
    except Exception:
        return None

_FAILS = {}
_LOCK_THRESHOLD = 5
_WINDOW = 300
def _client_ip():
    fwd = request.headers.get("X-Forwarded-For", "")
    return fwd.split(",")[0].strip() if fwd else (request.remote_addr or "unknown")
def is_locked(ip):
    now = time.time()
    arr = [t for t in _FAILS.get(ip, []) if now - t < _WINDOW]
    _FAILS[ip] = arr
    return len(arr) >= _LOCK_THRESHOLD
def record_fail(ip):
    _FAILS.setdefault(ip, []).append(time.time())
def clear_fails(ip):
    _FAILS.pop(ip, None)

# ---------------- vulnclaw command builder ----------------
MODES = ("run", "recon", "scan", "exploit", "persistent")
TARGET_RE = re.compile(r"^[A-Za-z0-9._:\-/?=&%#@]+$")
PORTS_RE = re.compile(r"^[0-9]{1,5}(,[0-9]{1,5})*$")
CVE_RE = re.compile(r"^CVE-\d{4}-\d{1,7}$", re.I)
SESSION_RE = re.compile(r"^[\w.\-/]+$")
NAME_RE = re.compile(r"^[A-Za-z0-9 ._()\-]+$")

def build_command(mode, p):
    base = vc_base() or [VULNCLAW_BIN]
    if mode in MODES:
        target = (p.get("target") or "").strip()
        if not target or len(target) > 300 or not TARGET_RE.match(target):
            return None, "Enter a valid target (host, IP, or URL) with no spaces."
        args = list(base) + [mode, target]
        if mode == "scan":
            ports = (p.get("ports") or "").strip()
            if ports:
                if not PORTS_RE.match(ports):
                    return None, "Ports must look like 80,443,8080."
                args += ["--ports", ports]
        if mode == "exploit":
            cve = (p.get("cve") or "").strip()
            if cve:
                if not CVE_RE.match(cve):
                    return None, "CVE must look like CVE-2024-1234."
                args += ["--cve", cve]
            cmd = (p.get("cmd") or "").strip()
            if cmd:
                if len(cmd) > 200 or "\n" in cmd or "\r" in cmd:
                    return None, "Command is too long or invalid."
                args += ["--cmd", cmd]
        if mode == "persistent":
            rounds = p.get("rounds")
            cycles = p.get("cycles")
            if rounds not in (None, ""):
                try:
                    r = int(rounds); assert 1 <= r <= 1000
                except Exception:
                    return None, "Rounds must be 1-1000."
                args += ["-r", str(r)]
            if cycles not in (None, ""):
                try:
                    c = int(cycles); assert 1 <= c <= 100
                except Exception:
                    return None, "Cycles must be 1-100."
                args += ["-c", str(c)]
            if p.get("noReport"):
                args += ["--no-report"]
        return args, None
    if mode == "report":
        s = (p.get("session") or "").strip()
        if not s or not SESSION_RE.match(s):
            return None, "Invalid session file name."
        return list(base) + ["report", s], None
    return None, "Unsupported mode."

# ---------------- job runner ----------------
jobs = {}
jobs_lock = threading.Lock()
MAX_LINES = 6000

def _append(job, line):
    with jobs_lock:
        job["output"].append(line)
        if len(job["output"]) > MAX_LINES:
            job["output"] = job["output"][-int(MAX_LINES * 0.8):]

def _run_real(job, args):
    term = "error"
    try:
        proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, bufsize=1, cwd=WORKDIR)
        job["pid"] = proc.pid
        job["_proc"] = proc
        for line in iter(proc.stdout.readline, ""):
            if line == "" and proc.poll() is not None:
                break
            _append(job, line.rstrip("\n"))
        proc.stdout.close()
        rc = proc.wait()
        job["returncode"] = rc
        term = "stopped" if job.get("_stopped") else ("done" if rc == 0 else "error")
    except FileNotFoundError:
        _append(job, "[error] vulnclaw binary not found: " + args[0])
        job["returncode"] = 127; term = "error"
    except Exception as e:
        _append(job, "[runner error] " + str(e))
        job["returncode"] = -1; term = "error"
    finally:
        job["_proc"] = None
        if job.get("_snap") is not None and job.get("returncode") != 127:
            ingest_results(job)
        job["ended"] = time.time()
        job["status"] = term

DEMO_SCRIPTS = {
    "recon": ["[*] DEMO recon (vulnclaw not installed)", "[+] Target: {t}", "[+] Resolving host ...", "[+] Open ports: 22, 80, 443, 8080", "[+] Web fingerprint: nginx/1.25", "[+] Recon complete."],
    "scan": ["[*] DEMO scan (vulnclaw not installed)", "[+] Target: {t}", "[+] Probing services ...", "[!] Exposed /.env (critical)", "[!] Possible SQL injection at /api/items?id= (critical)", "[+] Scan complete: 2 critical, 1 medium."],
    "run": ["[*] DEMO full pipeline (vulnclaw not installed)", "[+] Target: {t}", "-- Recon --", "[+] Open ports: 22, 80, 443", "-- Discovery --", "[!] SQLi candidate found", "-- Reporting --", "[+] Report written to reports/demo.md"],
    "exploit": ["[*] DEMO exploit (vulnclaw not installed)", "[+] Target: {t}", "[+] Attempting verification ...", "[+] PoC generated: pocs/demo.py"],
    "persistent": ["[*] DEMO persistent (vulnclaw not installed)", "[+] Target: {t}", "-- Cycle 1 --", "[+] 100 rounds simulated", "[+] Cycle report: reports/demo_cycle1.md"],
    "report": ["[*] DEMO report (vulnclaw not installed)", "[+] Rendered markdown report."],
}

def _run_demo(job, mode, target):
    lines = DEMO_SCRIPTS.get(mode, ["[*] DEMO", "[+] done"])
    for ln in lines:
        if job.get("_stopped"):
            _append(job, "[*] stopped by operator"); job["status"] = "stopped"; job["ended"] = time.time(); return
        _append(job, ln.replace("{t}", target or "-"))
        time.sleep(0.35)
    if mode in ("run", "scan", "recon"):
        _write_demo_artifacts(target, mode)
    job["returncode"] = 0
    ingest_results(job)
    job["ended"] = time.time()
    job["status"] = "done"

def start_job(mode, params):
    args, err = build_command(mode, params)
    if err:
        return None, err
    demo = not bin_available()
    jid = uuid.uuid4().hex[:12]
    preview = " ".join(shlex.quote(a) for a in args)
    job = {"id": jid, "mode": mode, "target": params.get("target", ""), "cmd": preview,
           "status": "running", "output": [], "started": time.time(), "ended": None,
           "returncode": None, "pid": None, "demo": demo, "_proc": None, "_stopped": False,
           "artifacts": [], "imported": None, "_snap": None}
    with jobs_lock:
        jobs[jid] = job
    job["_snap"] = _snapshot_dirs()
    if demo:
        t = threading.Thread(target=_run_demo, args=(job, mode, params.get("target", "")), daemon=True)
    else:
        t = threading.Thread(target=_run_real, args=(job, args), daemon=True)
    t.start()
    return jid, None

def public_job(job, since=0):
    with jobs_lock:
        out = job["output"][since:]
        total = len(job["output"])
    return {"id": job["id"], "mode": job["mode"], "target": job["target"], "cmd": job["cmd"],
            "status": job["status"], "demo": job["demo"], "returncode": job["returncode"],
            "lines": out, "nextSince": total, "started": job["started"], "ended": job["ended"],
            "artifacts": job.get("artifacts") or [], "imported": job.get("imported")}

# ---------------- result ingestion (scan -> findings/reports) ----------------
IMPORT_CAP = 200
SEV_WORDS = "critical|high|medium|moderate|low|info|informational"

def _snapshot_dirs():
    snap = {}
    for d in (REPORTS_DIR, POCS_DIR, WORKDIR):
        try:
            for fn in os.listdir(d):
                fp = os.path.join(d, fn)
                if os.path.isfile(fp):
                    snap[fp] = (os.path.getmtime(fp), os.path.getsize(fp))
        except Exception:
            pass
    return snap

def _changed_since(before):
    now = _snapshot_dirs()
    return [fp for fp, meta in now.items() if before.get(fp) != meta]

def norm_sev(s):
    s = str(s or "").strip().lower()
    alias = {"crit": "critical", "moderate": "medium", "med": "medium",
             "informational": "info", "information": "info", "warning": "low", "warn": "low"}
    s = alias.get(s, s)
    return s if s in SEVERITIES else "info"

def _mk(title, severity="info", endpoint="", description="", status="open"):
    title = (title or "").strip(" -:|*#>").strip()
    if not title or len(title) < 3:
        return None
    st = str(status or "open").strip().lower()
    return {"title": title[:200], "severity": norm_sev(severity),
            "endpoint": (endpoint or "").strip()[:300], "description": (description or "").strip()[:4000],
            "status": st if st in STATUSES else "open"}

def findings_from_json(path):
    out = []
    try:
        with open(path) as f:
            data = json.load(f)
    except Exception:
        return out
    items = None
    if isinstance(data, dict):
        for key in ("findings", "vulnerabilities", "results", "issues"):
            if isinstance(data.get(key), list):
                items = data[key]; break
    elif isinstance(data, list):
        items = data
    for it in (items or []):
        if not isinstance(it, dict):
            continue
        title = it.get("title") or it.get("name") or it.get("summary") or it.get("vuln") or it.get("type")
        sev = it.get("severity") or it.get("risk") or it.get("level") or "info"
        ep = it.get("endpoint") or it.get("url") or it.get("path") or it.get("location") or ""
        desc = it.get("description") or it.get("detail") or it.get("details") or it.get("evidence") or ""
        st = str(it.get("status") or "open").strip().lower()
        m = _mk(title, sev, ep, desc, st)
        if m:
            out.append(m)
    return out

def findings_from_text(text):
    out = []
    if not text:
        return out
    for m in re.finditer(r"(?im)^\s*\|\s*(%s)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|" % SEV_WORDS, text):
        f = _mk(m.group(2), m.group(1), m.group(3))
        if f: out.append(f)
    for m in re.finditer(r"(?im)\[(%s)\]\s*[:\-]?\s*(.+)$" % SEV_WORDS, text):
        rest = m.group(2).strip()
        parts = re.split(r"\s+(?:[\u2014@]|-|at|->)\s+", rest, maxsplit=1)
        ep = parts[1].strip() if len(parts) > 1 else ""
        f = _mk(parts[0], m.group(1), ep)
        if f: out.append(f)
    for m in re.finditer(r"(?im)^[\s>*\-\[!\]+]*\s*(.+?)\s*\((%s)\)\s*$" % SEV_WORDS, text):
        f = _mk(m.group(1), m.group(2))
        if f: out.append(f)
    for m in re.finditer(r"(?im)\[FINDING\]\s*(.+)$", text):
        seg = m.group(1).strip(); sev = "info"
        sm = re.search(r"\b(%s)\b" % SEV_WORDS, seg, re.I)
        if sm:
            sev = sm.group(1); seg = (seg[:sm.start()] + seg[sm.end():])
        seg = seg.strip(" -:|")
        ep = ""
        parts = re.split(r"\s+(?:@|\u2014|->|at)\s+", seg, maxsplit=1)
        title = parts[0].strip(" -:|")
        if len(parts) > 1:
            ep = parts[1].strip()
        f = _mk(title, sev, ep)
        if f: out.append(f)
    return out

def _dkey(f):
    return (f["title"].strip().lower(), (f.get("endpoint") or "").strip().lower())

def _write_demo_artifacts(target, mode):
    safe = (target or "target").replace("/", "_")[:40]
    findings = [
        {"title": "Remote code execution via file upload", "severity": "critical", "endpoint": "/upload", "description": "Unrestricted file upload allows web-shell execution."},
        {"title": "Authentication bypass on admin panel", "severity": "high", "endpoint": "/admin", "description": "Admin routes reachable without a valid session."},
        {"title": "CORS misconfiguration allows any origin", "severity": "medium", "endpoint": "/api/", "description": "Access-Control-Allow-Origin reflects arbitrary origins with credentials."},
        {"title": "Directory listing enabled", "severity": "low", "endpoint": "/assets/", "description": "Static directory exposes file index."},
    ]
    try:
        with open(os.path.join(WORKDIR, "session-%s.json" % safe), "w") as f:
            json.dump({"target": target, "mode": mode, "findings": findings}, f, indent=2)
    except Exception:
        pass
    try:
        rows = "\n".join("| %s | %s | %s |" % (x["severity"], x["title"], x["endpoint"]) for x in findings)
        with open(os.path.join(REPORTS_DIR, "demo-%s-%s.md" % (mode, safe)), "w") as f:
            f.write("# BIGGCLAW demo report\n\nTarget: %s\nMode: %s\n\n## Findings\n\n| Severity | Title | Endpoint |\n|---|---|---|\n%s\n" % (target, mode, rows))
    except Exception:
        pass

def ingest_results(job):
    try:
        before = job.get("_snap") or {}
        changed = _changed_since(before)
        artifacts, json_files = [], []
        for fp in changed:
            d = os.path.dirname(fp); rel = os.path.basename(fp)
            if d == REPORTS_DIR:
                artifacts.append({"name": rel, "dir": "reports"})
            elif d == POCS_DIR:
                artifacts.append({"name": rel, "dir": "pocs"})
            if fp.lower().endswith(".json"):
                json_files.append(fp)
        collected = []
        for fp in json_files:
            collected += findings_from_json(fp)
        for a in artifacts:
            if a["dir"] == "reports" and a["name"].lower().endswith((".md", ".markdown", ".txt")):
                try:
                    with open(os.path.join(REPORTS_DIR, a["name"])) as f:
                        collected += findings_from_text(f.read())
                except Exception:
                    pass
        with jobs_lock:
            text = "\n".join(job["output"])
        collected += findings_from_text(text)
        seen, uniq = set(), []
        for f in collected:
            k = _dkey(f)
            if k in seen:
                continue
            seen.add(k); uniq.append(f)
        uniq = uniq[:IMPORT_CAP]
        imported = []
        if uniq:
            st = load_state()
            existing = {_dkey(x) for x in st["findings"]}
            for f in uniq:
                k = _dkey(f)
                if k in existing:
                    continue
                existing.add(k)
                nf = clean_finding(f)
                nf["id"] = next_finding_id(st["findings"])
                nf["source"] = "%s:%s" % (job.get("mode"), job.get("id"))
                st["findings"].append(nf)
                imported.append(nf["id"])
            if imported:
                save_state(st)
        by = {}
        for f in uniq:
            by[f["severity"]] = by.get(f["severity"], 0) + 1
        job["artifacts"] = artifacts
        job["imported"] = {"count": len(imported), "detected": len(uniq), "bySeverity": by, "ids": imported}
    except Exception as e:
        job["imported"] = {"count": 0, "detected": 0, "bySeverity": {}, "ids": [], "error": str(e)}

# ---------------- vulnclaw config / doctor ----------------
def run_capture(args, timeout=60):
    try:
        r = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           text=True, cwd=WORKDIR, timeout=timeout)
        return r.returncode, r.stdout
    except FileNotFoundError:
        return 127, "vulnclaw binary not found"
    except subprocess.TimeoutExpired:
        return -1, "command timed out"
    except Exception as e:
        return -1, str(e)

def redact(text):
    return re.sub(r"(sk-[A-Za-z0-9]{2})[A-Za-z0-9\-_]+", lambda m: m.group(1) + ("•" * 4), text or "")

KNOWN_PROVIDERS = ["openai", "deepseek", "minimax", "zhipu", "moonshot", "qwen", "siliconflow", "baichuan", "stepfun"]
_version_cache = {"v": None, "t": 0}

def vc_version():
    base = vc_base()
    if base is None:
        return None
    if _version_cache["v"] and time.time() - _version_cache["t"] < 300:
        return _version_cache["v"]
    rc, out = run_capture(base + ["--version"], timeout=15)
    v = (out or "").strip().splitlines()[0].strip() if out else ""
    if rc != 0 or not v:
        v = "unknown"
    _version_cache["v"] = v
    _version_cache["t"] = time.time()
    return v

_STOP_WORDS = {"available", "providers", "provider", "current", "list", "supported", "configured"}

def list_providers():
    provs = list(KNOWN_PROVIDERS)
    raw = ""
    base = vc_base()
    if base is not None:
        rc, raw = run_capture(base + ["config", "provider", "--list"], timeout=20)
        for tok in re.findall(r"(?m)^[\s*>\-]*([a-z][a-z0-9_\-]{1,20})", raw or ""):
            t = tok.lower()
            if t in _STOP_WORDS or t in provs:
                continue
            provs.append(t)
    return provs, redact(raw or "")

def configure_from_env():
    base = vc_base()
    if base is None:
        return
    try:
        if VULN_PROVIDER:
            run_capture(base + ["config", "provider", VULN_PROVIDER])
        if VULN_BASE_URL:
            run_capture(base + ["config", "set", "llm.base_url", VULN_BASE_URL])
        if VULN_MODEL:
            run_capture(base + ["config", "set", "llm.model", VULN_MODEL])
        if VULN_API_KEY:
            run_capture(base + ["config", "set", "llm.api_key", VULN_API_KEY])
    except Exception as e:
        print("configure_from_env error:", e)

# ---------------- Flask ----------------
app = Flask(__name__, static_folder=None)

@app.after_request
def _security_headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
        "connect-src 'self'; base-uri 'none'; form-action 'self'")
    return resp

def _require_auth():
    auth = request.headers.get("Authorization", "")
    return verify_token(auth[7:].strip()) if auth.startswith("Bearer ") else None

def _guard():
    return _require_auth() is not None

@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "biggclaw.html")

@app.route("/healthz")
def healthz():
    return jsonify(ok=True, service="biggclaw",
                   configured=bool(ADMIN_EMAIL and (ADMIN_PASSWORD_HASH or ADMIN_PASSWORD)),
                   vulnclaw=bin_available())

@app.route("/api/login", methods=["POST"])
def login():
    ip = _client_ip()
    if is_locked(ip):
        return jsonify(error="Too many attempts. Try again in a few minutes."), 429
    if not ADMIN_EMAIL or not (ADMIN_PASSWORD_HASH or ADMIN_PASSWORD):
        return jsonify(error="Server authentication is not configured."), 500
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    email_ok = hmac.compare_digest(email, ADMIN_EMAIL.lower())
    pw_ok = verify_password(password, ADMIN_PASSWORD_HASH) if ADMIN_PASSWORD_HASH else hmac.compare_digest(password, ADMIN_PASSWORD)
    if email_ok and pw_ok:
        clear_fails(ip)
        return jsonify(token=make_token(ADMIN_EMAIL.lower()), email=ADMIN_EMAIL.lower(), expiresIn=TOKEN_TTL)
    record_fail(ip)
    return jsonify(error="Invalid email or password."), 401

@app.route("/api/session")
def session():
    p = _require_auth()
    if not p:
        return jsonify(error="Unauthorized"), 401
    return jsonify(ok=True, email=p.get("sub"), exp=p.get("exp"))

@app.route("/api/doctor")
def doctor():
    if not _guard():
        return jsonify(error="Unauthorized"), 401
    if not bin_available():
        return jsonify(installed=False, output=(
            "vulnclaw is not installed in this environment.\n\n"
            "Install it with:\n  pip install \"vulnclaw[web]\"\n\n"
            "On Render this is done automatically by the build command.\n"
            "The console runs in DEMO mode until vulnclaw is available."), version=None)
    rc, out = run_capture(vc_base() + ["doctor"])
    return jsonify(installed=True, returncode=rc, output=redact(out), version=vc_version())

@app.route("/api/config", methods=["GET", "POST"])
def config():
    if not _guard():
        return jsonify(error="Unauthorized"), 401
    base = vc_base()
    if request.method == "GET":
        env = {"provider": VULN_PROVIDER, "model": VULN_MODEL, "base_url": VULN_BASE_URL,
               "api_key_set": bool(VULN_API_KEY)}
        if base is None:
            return jsonify(installed=False, env=env, output="vulnclaw not installed")
        rc, out = run_capture(base + ["config", "list"])
        return jsonify(installed=True, env=env, output=redact(out))
    data = request.get_json(silent=True) or {}
    if base is None:
        return jsonify(error="vulnclaw is not installed; cannot change config here."), 400
    provider = (data.get("provider") or "").strip()
    model = (data.get("model") or "").strip()
    base_url = (data.get("base_url") or "").strip()
    api_key = (data.get("api_key") or "").strip()
    steps = []
    if provider:
        if not re.match(r"^[a-z0-9_\-]+$", provider):
            return jsonify(error="Invalid provider name."), 400
        steps.append(base + ["config", "provider", provider])
    if base_url:
        steps.append(base + ["config", "set", "llm.base_url", base_url])
    if model:
        steps.append(base + ["config", "set", "llm.model", model])
    if api_key:
        steps.append(base + ["config", "set", "llm.api_key", api_key])
    if not steps:
        return jsonify(error="Nothing to update."), 400
    log = []
    for s in steps:
        rc, out = run_capture(s)
        safe = "config set llm.api_key ***" if ("llm.api_key" in s) else " ".join(s[len(base):])
        log.append({"cmd": "vulnclaw " + safe, "rc": rc, "out": redact(out).strip()[:400]})
    return jsonify(ok=True, steps=log)

@app.route("/api/version")
def version_route():
    if not _guard():
        return jsonify(error="Unauthorized"), 401
    return jsonify(installed=bin_available(), version=vc_version())

@app.route("/api/providers")
def providers_route():
    if not _guard():
        return jsonify(error="Unauthorized"), 401
    provs, raw = list_providers()
    return jsonify(installed=bin_available(), providers=provs, output=raw)

@app.route("/api/init", methods=["POST"])
def init_route():
    if not _guard():
        return jsonify(error="Unauthorized"), 401
    base = vc_base()
    if base is None:
        return jsonify(error="vulnclaw is not installed; nothing to initialize here."), 400
    rc, out = run_capture(base + ["init"], timeout=60)
    return jsonify(ok=rc == 0, returncode=rc, output=redact(out))

@app.route("/api/run", methods=["POST"])
def run():
    if not _guard():
        return jsonify(error="Unauthorized"), 401
    data = request.get_json(silent=True) or {}
    mode = (data.get("mode") or "run").strip()
    jid, err = start_job(mode, data)
    if err:
        return jsonify(error=err), 400
    with jobs_lock:
        job = jobs[jid]
    return jsonify(jobId=jid, mode=mode, demo=job["demo"], cmd=job["cmd"])

@app.route("/api/jobs")
def list_jobs():
    if not _guard():
        return jsonify(error="Unauthorized"), 401
    with jobs_lock:
        items = [{"id": j["id"], "mode": j["mode"], "target": j["target"], "status": j["status"],
                  "started": j["started"], "ended": j["ended"], "demo": j["demo"]}
                 for j in sorted(jobs.values(), key=lambda x: x["started"], reverse=True)][:50]
    return jsonify(jobs=items)

@app.route("/api/jobs/<jid>")
def job_status(jid):
    if not _guard():
        return jsonify(error="Unauthorized"), 401
    with jobs_lock:
        job = jobs.get(jid)
    if not job:
        return jsonify(error="No such job"), 404
    since = request.args.get("since", "0")
    try:
        since = int(since)
    except Exception:
        since = 0
    return jsonify(public_job(job, since))

@app.route("/api/jobs/<jid>/stop", methods=["POST"])
def job_stop(jid):
    if not _guard():
        return jsonify(error="Unauthorized"), 401
    with jobs_lock:
        job = jobs.get(jid)
    if not job:
        return jsonify(error="No such job"), 404
    job["_stopped"] = True
    proc = job.get("_proc")
    if proc is not None:
        try:
            proc.terminate()
        except Exception:
            pass
    return jsonify(ok=True)

@app.route("/api/jobs/<jid>/import", methods=["POST"])
def job_import(jid):
    if not _guard():
        return jsonify(error="Unauthorized"), 401
    with jobs_lock:
        job = jobs.get(jid)
    if not job:
        return jsonify(error="No such job"), 404
    ingest_results(job)
    return jsonify(ok=True, imported=job.get("imported"), artifacts=job.get("artifacts") or [])

@app.route("/api/reports")
def reports():
    if not _guard():
        return jsonify(error="Unauthorized"), 401
    out = []
    for d, label in ((REPORTS_DIR, "reports"), (POCS_DIR, "pocs")):
        if os.path.isdir(d):
            for fn in sorted(os.listdir(d)):
                fp = os.path.join(d, fn)
                if os.path.isfile(fp):
                    out.append({"name": fn, "dir": label, "size": os.path.getsize(fp),
                                "mtime": os.path.getmtime(fp)})
    out.sort(key=lambda x: x["mtime"], reverse=True)
    return jsonify(reports=out)

@app.route("/api/report")
def report_file():
    if not _guard():
        return jsonify(error="Unauthorized"), 401
    name = request.args.get("name", "")
    d = request.args.get("dir", "reports")
    base = REPORTS_DIR if d == "reports" else POCS_DIR
    if not NAME_RE.match(name or "") or "/" in name or "\\" in name or ".." in name:
        return jsonify(error="Invalid name"), 400
    dl = request.args.get("download") == "1"
    return send_from_directory(base, name, as_attachment=dl)


# ---------------- editable server state (persisted) ----------------
STATE_FILE = os.path.join(WORKDIR, "state.json")
state_lock = threading.Lock()
SEVERITIES = ["critical", "high", "medium", "low", "info"]
STATUSES = ["open", "confirmed", "in progress", "fixed", "false positive"]

DEFAULT_STATE = {
    "target": {
        "name": "Acme Web Portal",
        "url": "https://portal.acme-corp.test",
        "ip": "203.0.113.42",
        "scope": "Web application, authenticated + unauthenticated. Ports 80,443.",
        "notes": "",
    },
    "findings": [
        {"id": "F-01", "title": "Exposed .env configuration file", "severity": "critical", "status": "open", "endpoint": "/.env", "description": "Environment file is publicly reachable and leaks credentials."},
        {"id": "F-02", "title": "SQL injection in item lookup", "severity": "critical", "status": "confirmed", "endpoint": "/api/items?id=", "description": "Unsanitized id parameter allows boolean-based SQL injection."},
        {"id": "F-03", "title": "Reflected XSS in search", "severity": "high", "status": "in progress", "endpoint": "/search?q=", "description": "User input reflected without output encoding."},
        {"id": "F-04", "title": "Missing security headers", "severity": "medium", "status": "open", "endpoint": "/", "description": "CSP and HSTS are not set on primary responses."},
        {"id": "F-05", "title": "Verbose server banner", "severity": "low", "status": "open", "endpoint": "/", "description": "Server discloses exact version in response headers."},
    ],
    "seededAt": None,
}

def load_state():
    with state_lock:
        if not os.path.isfile(STATE_FILE):
            st = json.loads(json.dumps(DEFAULT_STATE))
            st["seededAt"] = time.time()
            with open(STATE_FILE, "w") as f:
                json.dump(st, f, indent=2)
            return st
        try:
            with open(STATE_FILE) as f:
                return json.load(f)
        except Exception:
            return json.loads(json.dumps(DEFAULT_STATE))

def save_state(st):
    with state_lock:
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(st, f, indent=2)
        os.replace(tmp, STATE_FILE)

def next_finding_id(findings):
    mx = 0
    for f in findings:
        m = re.match(r"F-(\d+)$", str(f.get("id", "")))
        if m:
            mx = max(mx, int(m.group(1)))
    return "F-%02d" % (mx + 1)

def clean_finding(data, existing=None):
    f = dict(existing or {})
    if "title" in data:
        f["title"] = str(data["title"]).strip()[:200]
    if "endpoint" in data:
        f["endpoint"] = str(data["endpoint"]).strip()[:300]
    if "description" in data:
        f["description"] = str(data["description"]).strip()[:4000]
    if "severity" in data:
        sev = str(data["severity"]).strip().lower()
        f["severity"] = sev if sev in SEVERITIES else "info"
    if "status" in data:
        stt = str(data["status"]).strip().lower()
        f["status"] = stt if stt in STATUSES else "open"
    f.setdefault("severity", "info")
    f.setdefault("status", "open")
    f.setdefault("endpoint", "")
    f.setdefault("description", "")
    f["updated"] = time.time()
    return f

@app.route("/api/state")
def get_state():
    if not _guard():
        return jsonify(error="Unauthorized"), 401
    st = load_state()
    return jsonify(target=st.get("target", {}), findings=st.get("findings", []),
                   severities=SEVERITIES, statuses=STATUSES)

@app.route("/api/target", methods=["PUT"])
def put_target():
    if not _guard():
        return jsonify(error="Unauthorized"), 401
    data = request.get_json(silent=True) or {}
    st = load_state()
    tgt = st.get("target", {}) or {}
    for k in ("name", "url", "ip", "scope", "notes"):
        if k in data:
            tgt[k] = str(data[k]).strip()[:2000]
    st["target"] = tgt
    save_state(st)
    return jsonify(ok=True, target=tgt)

@app.route("/api/findings", methods=["POST"])
def create_finding():
    if not _guard():
        return jsonify(error="Unauthorized"), 401
    data = request.get_json(silent=True) or {}
    if not str(data.get("title", "")).strip():
        return jsonify(error="Title is required."), 400
    st = load_state()
    f = clean_finding(data)
    f["id"] = next_finding_id(st["findings"])
    st["findings"].append(f)
    save_state(st)
    return jsonify(ok=True, finding=f)

@app.route("/api/findings/<fid>", methods=["PATCH", "DELETE"])
def edit_finding(fid):
    if not _guard():
        return jsonify(error="Unauthorized"), 401
    st = load_state()
    idx = next((i for i, x in enumerate(st["findings"]) if x.get("id") == fid), None)
    if idx is None:
        return jsonify(error="No such finding"), 404
    if request.method == "DELETE":
        removed = st["findings"].pop(idx)
        save_state(st)
        return jsonify(ok=True, removed=removed.get("id"))
    data = request.get_json(silent=True) or {}
    updated = clean_finding(data, st["findings"][idx])
    updated["id"] = fid
    st["findings"][idx] = updated
    save_state(st)
    return jsonify(ok=True, finding=updated)


configure_from_env()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
