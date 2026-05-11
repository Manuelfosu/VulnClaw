# Contributing to VulnClaw

感谢你为 VulnClaw 做贡献。

本文件的目标不是规定繁琐流程，而是帮你快速理解项目结构，避免在错误的层级修改代码。

---

## Project Structure

```text
VulnClaw/
├── vulnclaw/
│   ├── agent/            # Agent 主控层、运行态、LLM 调用、工具调度、循环控制
│   │   ├── core.py               # AgentCore 壳层与协调入口
│   │   ├── runtime_state.py      # RuntimeState / AgentResult / PersistentCycleResult
│   │   ├── finding_parser.py     # 漏洞发现解析
│   │   ├── think_filter.py       # <thinking> 标签处理
│   │   ├── builtin_tools.py      # python_execute / nmap_scan / 内置工具分发
│   │   ├── llm_client.py         # LLM 调用与响应提取
│   │   ├── tool_call_manager.py  # tool-call 去重、执行编排、参数容错
│   │   ├── loop_controller.py    # auto_pentest / persistent_pentest 主循环
│   │   ├── recon_tracker.py      # recon 维度关键词与完成度追踪
│   │   ├── prompt_context.py     # round context / attack summary 组装
│   │   ├── anti_loop.py          # 阶段切换、完成信号、失败目标、攻击路径判定
│   │   ├── ctf_mode.py           # flag claim / verify / post-flag 状态机
│   │   ├── system_prompt.py      # dynamic system prompt 拼装
│   │   ├── input_analysis.py     # 用户输入解析、目标/阶段/漏洞提示提取
│   │   ├── skill_context.py      # Skill 上下文选择
│   │   └── kb_context.py         # KB prompt context 构建
│   │
│   ├── cli/              # Typer CLI 入口、doctor、REPL
│   ├── config/           # 配置模型、配置加载、环境变量覆盖
│   ├── kb/               # 知识库存储、检索、更新逻辑
│   ├── mcp/              # MCP registry / lifecycle / router
│   ├── report/           # 报告生成、内容过滤、PoC 构建、验证器
│   ├── skills/           # Skill loader / dispatcher / core / specialized skills
│   └── target_state/     # 目标级成果继承、快照、恢复、回滚、target 报告
│
├── tests/                # 单元测试、状态机测试、MCP 测试、配置测试
├── README.md             # 中文说明
├── README_EN.md          # 英文说明
├── pyproject.toml        # Python 包配置与版本号源
└── CONTRIBUTING.md       # 贡献指南（本文件）
```

---

## How to Navigate the Codebase

### 1. 改 Agent 行为时先看 `vulnclaw/agent/`

如果你要改：
- 主循环行为
- 工具调用编排
- LLM 请求/响应处理
- recon / CTF / anti-loop 逻辑

优先从 `vulnclaw/agent/` 进入，而不是直接在 CLI 层打补丁。

### 2. 改命令行行为时看 `vulnclaw/cli/`

如果你要改：
- CLI 命令
- doctor 输出
- REPL 体验
- 命令参数

优先改 `vulnclaw/cli/main.py`。

### 3. 改配置时看 `vulnclaw/config/`

- `schema.py`：配置模型定义
- `settings.py`：加载/保存/环境变量覆盖

不要在业务逻辑里到处手写配置解析。

### 4. 改报告相关逻辑时看 `vulnclaw/report/`

- `generator.py`：报告拼装
- `filter.py`：报告内容过滤
- `poc_builder.py`：PoC 脚本生成
- `verifier.py`：验证器与模板

### 5. 改 MCP 能力时看 `vulnclaw/mcp/`

- `registry.py`：服务与工具注册信息
- `lifecycle.py`：执行模式、协议连接、调用入口
- `router.py`：意图路由

当前 `fetch` / `memory` 已有最小真实协议接入，其余多数仍为 `placeholder`。

### 6. 改断点续测 / 成果继承时看 `vulnclaw/target_state/`

- `store.py`：target state 持久化、合并、快照、恢复、回滚
- 相关 CLI 接入：`vulnclaw/cli/main.py`

这部分职责是“同一目标跨命令共享成果”，不要把这类逻辑重新塞回 `core.py`。

---

## Contribution Tips

- 尽量在正确模块里改代码，不要把已经拆出去的职责重新塞回 `core.py`。
- `core.py` 现在的目标是保持为“协调壳层”，新增逻辑优先放进对应 helper/module。
- 改行为逻辑时，优先补或更新 `tests/` 中对应测试。
- 版本号统一以 `pyproject.toml` 为主，同时检查 README / fallback 版本展示。
- 如果修改文档中的能力描述，确保它和实际实现一致，尤其是 MCP、沙箱、安全边界这类容易误导的部分。

---

## Before Opening a PR

建议至少确认：

1. 相关测试通过
2. 文档与实现一致
3. 新逻辑放在正确模块，而不是重新把职责塞回大文件
4. 版本号、CLI 输出、README 如果受影响，已同步更新

---

## Web UI Notes

如果你在修改 Web UI 相关能力，优先查看：

- [VulnClaw_Web_UI开发需求文档.md](C:/Users/UncleC/Desktop/VulnClaw/VulnClaw_Web_UI开发需求文档.md)
- `vulnclaw/web/`

当前 Web UI 处于 **Phase 1 后端骨架阶段**：

- `app.py`：FastAPI 入口
- `task_manager.py`：任务运行态与事件流
- `services/`：target / report / config / task 服务层
- `static/`：最小静态占位页
- `frontend/`：React + Vite + TypeScript 前端 scaffold

原则上：

- Web 层复用现有 Agent / target_state / report 主干
- 不在 Web 层复制一套新的恢复逻辑
- 不让前端直接持有敏感密钥


---

## Suggested Preflight

Before opening a PR, run:

```bash
python scripts/release_preflight.py
python scripts/release_preflight.py --build
```

This checks:
- version consistency between `pyproject.toml` and `vulnclaw.__version__`
- backend `pytest -q`
- frontend `npx tsc -b`
