import json


class DummyRuntime:
    def __init__(self):
        self.python_timeout_rounds = 0


class DummySession:
    def __init__(self, target="https://example.com"):
        self.target = target


class DummySafety:
    def __init__(self):
        self.enable_python_execute = True
        self.python_execute_restricted = False
        self.python_execute_mode = "trusted-local"
        self.python_execute_max_lines = 50
        self.python_execute_show_warning = False
        self.python_execute_max_output_chars = 8000
        self.python_execute_audit_enabled = True


class DummyConfig:
    def __init__(self):
        self.safety = DummySafety()


class DummyAgent:
    def __init__(self):
        self.config = DummyConfig()
        self.runtime = DummyRuntime()
        self.session_state = DummySession()
        self.mcp_manager = None


class TestBuiltinPythonExecute:
    async def test_safe_mode_blocks_network_access(self, monkeypatch, tmp_path):
        import vulnclaw.agent.builtin_tools as builtin_tools

        agent = DummyAgent()
        agent.config.safety.python_execute_mode = "safe"
        monkeypatch.setattr(builtin_tools, "_write_python_audit", lambda *args, **kwargs: None)

        result = await builtin_tools.execute_python(
            agent,
            {"code": "import requests\nprint(requests.get('https://example.com').status_code)", "purpose": "recon"},
        )
        assert "safe mode blocked operation" in result

    async def test_lab_mode_blocks_subprocess(self, monkeypatch):
        import vulnclaw.agent.builtin_tools as builtin_tools

        agent = DummyAgent()
        agent.config.safety.python_execute_mode = "lab"
        monkeypatch.setattr(builtin_tools, "_write_python_audit", lambda *args, **kwargs: None)

        result = await builtin_tools.execute_python(
            agent,
            {"code": "import subprocess\nprint('x')", "purpose": "local helper"},
        )
        assert "lab mode blocked operation" in result

    async def test_trusted_local_allows_basic_code(self, monkeypatch):
        import vulnclaw.agent.builtin_tools as builtin_tools

        agent = DummyAgent()
        agent.config.safety.python_execute_mode = "trusted-local"
        monkeypatch.setattr(builtin_tools, "_write_python_audit", lambda *args, **kwargs: None)

        result = await builtin_tools.execute_python(
            agent,
            {"code": "print('ok')", "purpose": "demo"},
        )
        assert "ok" in result

    async def test_audit_writer_emits_jsonl(self, monkeypatch, tmp_path):
        import vulnclaw.agent.builtin_tools as builtin_tools

        agent = DummyAgent()

        monkeypatch.setattr(
            "vulnclaw.config.settings.PYTHON_EXECUTE_AUDIT_FILE",
            tmp_path / "python_execute_audit.jsonl",
        )
        monkeypatch.setattr("vulnclaw.config.settings.ensure_dirs", lambda: None)

        builtin_tools._write_python_audit(
            agent,
            purpose="demo",
            code="print('x')",
            mode="safe",
            outcome="blocked",
            blocked_reason="requests",
        )

        content = (tmp_path / "python_execute_audit.jsonl").read_text(encoding="utf-8").strip()
        record = json.loads(content)
        assert record["mode"] == "safe"
        assert record["outcome"] == "blocked"
        assert record["blocked_reason"] == "requests"


class TestBuiltinMcpExecution:
    async def test_execute_mcp_tool_includes_structured_content_summary(self):
        import vulnclaw.agent.builtin_tools as builtin_tools

        class DummyMcpManager:
            async def call_tool(self, tool_name, args):
                return {
                    "ok": True,
                    "content": "navigated to page",
                    "structured_content": {"url": "https://example.com", "status": "ok"},
                }

        agent = DummyAgent()
        agent.mcp_manager = DummyMcpManager()

        result = await builtin_tools.execute_mcp_tool(agent, "navigate", {"url": "https://example.com"})
        assert "navigated to page" in result
        assert "[structured]" in result
        assert '"status": "ok"' in result
