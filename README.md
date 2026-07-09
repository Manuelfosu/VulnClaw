# VulnClaw 🦞 — Beginner's Guide (English)

> **What it is in one sentence:** VulnClaw is an AI-powered penetration-testing assistant. You describe what you want in plain English, and it uses a large language model (LLM) to automatically run the four classic pentest stages for you: **Recon → Find vulnerabilities → Exploit → Write a report.**

This is a plain-English, beginner-friendly rewrite of the original (Chinese) documentation.

---

## ⚠️ Read this first (important & legal)

VulnClaw is a real offensive-security tool. Before you touch it:

1. **Only test systems you own or have written permission to test.** Scanning or attacking systems without authorization is illegal in most countries and can get you banned, sued, or prosecuted. Good uses: your own lab/VM, CTF competitions, authorized client engagements, security training.
2. **It can run code and commands.** VulnClaw can execute Python and shell tools on the machine it runs on. Treat the machine it runs on as sensitive.
3. **The Web UI has no login by default.** Anyone who can reach the URL can use it. Never expose it to the public internet without adding protection (see the Hosting section).
4. **You need an LLM API key** (OpenAI, DeepSeek, Anthropic, etc.). The AI "brain" runs through that provider, and usage costs money on most providers.

---

## What VulnClaw can do

You type something like *"Do a pentest on http://target.example.com (I'm authorized)"* and it automatically works through:

| Stage | What happens |
| --- | --- |
| **1. Recon** | Fingerprints the tech, scans ports, enumerates directories |
| **2. Discovery** | Looks for injection points, known CVEs, misconfigurations |
| **3. Exploitation** | Verifies findings with proof-of-concept, tries to gain access |
| **4. Reporting** | Produces a structured Markdown report + a runnable Python PoC script |

### Key features (in plain terms)

- **Goal-driven engine** — Instead of blindly looping a fixed number of times, it stops when the goal is reached (e.g., "got the flag"), when it runs out of ideas, or when it hits a safety budget.
- **Anti-hallucination checks** — It won't claim it found a "flag" or vulnerability unless that text actually appears in real tool output. This prevents the AI from making things up.
- **Natural-language control** — You talk to it in normal sentences; it figures out the stage and picks tools.
- **13 supported AI providers** — OpenAI, Anthropic, DeepSeek, MiniMax, Qwen, Moonshot/Kimi, Zhipu GLM, and more. Switch with one command.
- **Multiple ways to use it** — classic chat (REPL), a terminal dashboard (TUI), one-shot commands, and a browser Web UI.
- **Auto reports + PoC scripts** — Every run can produce a report and reusable exploit code.

---

## Requirements

- **Python 3.10 or newer** (for the pip install method)
- **An LLM API key** from a supported provider
- Optional: **Node.js 20+** and **nmap** for the full toolset (the Docker image already includes these)

---

## Installation

Pick **one** of the three methods below.

### Option A — Install from PyPI (simplest)

```bash
pip install vulnclaw
```

For the browser Web UI, install the extra dependencies:

```bash
pip install "vulnclaw[web]"
```

### Option B — Install from source

```bash
git clone https://github.com/Unclecheng-li/VulnClaw.git
cd VulnClaw
pip install -e .
```

### Option C — Run with Docker (most complete)

The Docker image bundles the Web UI plus everything it needs (Node/`npx`/`uvx`/nmap). All your data (config, sessions, reports) is saved to the `/data` volume.

```bash
cp .env.example .env          # then open .env and add your VULNCLAW_LLM_API_KEY
docker compose up --build     # build and start the Web UI
# open http://127.0.0.1:7788
```

> Tip: Inside a container, `localhost` means the container itself. To scan a service on your host machine, use `host.docker.internal`.

---

## First-time setup (4 steps)

```bash
# 1. Choose your AI provider (auto-fills the base URL and model name)
vulnclaw config provider openai      # or: deepseek / anthropic / minimax / qwen / moonshot / zhipu ...

# 2. Add your API key
vulnclaw config set llm.api_key sk-your-key-here

# 3. (Optional) Override the model or a custom endpoint
vulnclaw config set llm.model gpt-4o
vulnclaw config set llm.base_url https://your-own-api.example.com/v1

# 4. Check that everything is ready
vulnclaw doctor
```

`vulnclaw doctor` prints a health check — Python/Node versions, whether nmap is installed, your LLM settings, and which MCP tools are enabled. If it ends with "environment ready," you're good to go.

---

## How to use it (4 modes)

### Mode 1 — Chat / REPL (default, great for beginners)

Just run:

```bash
vulnclaw
```

Then talk to it in plain English:

```
🦞 vulnclaw> Do a pentest on 192.168.1.100 — this is my authorized lab
```

Handy in-chat commands:

| Command | What it does |
| --- | --- |
| `target <host>` | Set the target |
| `status` | Show current target/stage/tools |
| `tools` | List available tools |
| `think on` / `think off` | Show or hide the AI's reasoning |
| `persistent` | Start long-running continuous testing |
| `clear` | Reset the session |
| `help` | Show help |
| `exit` / `quit` | Leave VulnClaw |

> Press **Ctrl+C** at any time to stop an automated run.

### Mode 2 — Single commands (good for automation)

```bash
vulnclaw run 192.168.1.100                 # full pentest, one command
vulnclaw recon 192.168.1.100               # recon only
vulnclaw scan 192.168.1.100 --ports 80,443 # vulnerability scan
vulnclaw exploit 192.168.1.100 --cve CVE-2024-1234
vulnclaw report session.json               # build a report from a saved session
```

### Mode 3 — Continuous / persistent testing (deep, long runs)

Runs in repeating cycles (default 100 rounds per cycle, up to 10 cycles), writing a report after each cycle until you stop it.

```bash
vulnclaw persistent 192.168.1.100                 # defaults
vulnclaw persistent 192.168.1.100 -r 200 -c 5     # 200 rounds x 5 cycles
vulnclaw persistent 192.168.1.100 --no-report     # don't auto-generate reports
```

### Mode 4 — Web UI (point-and-click in a browser)

```bash
pip install "vulnclaw[web]"
vulnclaw web                      # default: http://127.0.0.1:7788
vulnclaw web --port 8080          # custom port
```

> **Important:** By default the Web UI only listens on your own computer (localhost). To allow access from another machine you must add `--host 0.0.0.0 --allow-remote` — only do this on a network/server you trust.

There's also a terminal dashboard: `vulnclaw tui` (lets you confirm the target and scope before starting).

---

## Supported AI providers

See the full list and switch with one command:

```bash
vulnclaw config provider --list      # show all providers
vulnclaw config provider deepseek    # switch to DeepSeek
```

Supported: OpenAI, Anthropic Claude, MiniMax, DeepSeek, Zhipu GLM, Moonshot/Kimi, Qwen, SiliconFlow, Doubao, Baichuan, StepFun, SenseTime, 01.AI (Yi), plus a **custom** option for any OpenAI-compatible endpoint.

---

## Optional power-ups (MCP tools)

VulnClaw works out of the box with built-in tools (HTTP fetch, memory, `python_execute`, `nmap_scan`, crypto encode/decode, login brute-force). Two optional integrations add more power:

- **Chrome DevTools MCP** — browser automation, screenshots, running JavaScript. Needs Node.js 20+ and Chrome.
- **Burp Suite MCP** — HTTP capture/replay and scanning. Needs Java 11+ and Burp Suite Professional.

These are optional and only needed for advanced workflows. You can ignore them when starting out.

---

## Hosting the Web UI online (e.g., Render)

You can host the Web UI on a platform like [Render](https://render.com) using Docker. Two must-know facts:

1. The server must bind to `0.0.0.0` and the port the host assigns, so the start command must be:
   ```
   vulnclaw web --host 0.0.0.0 --port $PORT --allow-remote
   ```
2. There is **no built-in authentication**, so a public URL is open to anyone. Keep it private, put it behind an auth proxy, or restrict access by IP.

A ready-made Render blueprint (`render.yaml`) exists for this — put it in the repo root and deploy via Render's **New + → Blueprint** flow, then set your `VULNCLAW_LLM_API_KEY` in the dashboard.

---

## Where your files go

- **Reports:** `./reports/` (Markdown)
- **PoC scripts:** `./pocs/` (Python)
- **Config:** `~/.vulnclaw/config.yaml`
- **Docker:** everything is stored in the `/data` volume

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `vulnclaw: command not found` | Make sure pip's install location is on your PATH, or reopen your terminal |
| "No API key" / auth errors | Re-run `vulnclaw config set llm.api_key sk-...` and check the provider |
| Web UI unreachable from another device | Start it with `--host 0.0.0.0 --allow-remote` and open the right port |
| Missing nmap / Node | Use the Docker method, which includes them |
| Not sure what's wrong | Run `vulnclaw doctor` for a full environment check |

---

## License

VulnClaw is released under the MIT License. This guide is an English, beginner-friendly rewrite of the project's documentation for personal use.
