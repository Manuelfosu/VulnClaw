"""Task orchestration service for the Web UI backend."""

from __future__ import annotations

import asyncio

from vulnclaw.agent.core import AgentCore
from vulnclaw.mcp.lifecycle import MCPLifecycleManager
from vulnclaw.orchestrator import run_agent_task
from vulnclaw.web.schemas import TaskCreateRequest
from vulnclaw.web.task_manager import WebTaskManager
from vulnclaw.config.settings import load_config


def start_task(manager: WebTaskManager, request: TaskCreateRequest) -> str:
    """Create and schedule a new task."""
    record = manager.create_task(request)
    task = asyncio.create_task(_run_task(manager, record.task_id, request))
    manager.bind_runtime_task(record.task_id, task)
    return record.task_id


async def _run_task(manager: WebTaskManager, task_id: str, request: TaskCreateRequest) -> None:
    config = load_config()
    mcp_manager = MCPLifecycleManager(config)
    mcp_manager.start_enabled_servers()
    agent = AgentCore(config, mcp_manager)

    try:
        def before_restore(_restore_result) -> None:
            if request.resume:
                manager.set_restoring(task_id, snapshot_id=request.snapshot_id)

        def on_restored(restore_result) -> None:
            manager.publish(
                task_id,
                "task_state_changed",
                {
                    "resume": True,
                    "snapshot_id": restore_result.snapshot_id,
                    "phase": restore_result.phase,
                    "resume_strategy": restore_result.resume_strategy,
                    "resume_reason": restore_result.resume_reason,
                },
            )

        async def runner_fn(shared_agent: AgentCore) -> None:
            manager.set_running(task_id)
            if request.command == "persistent":
                await _run_persistent_task(manager, task_id, shared_agent, request)
            else:
                await _run_single_task(manager, task_id, shared_agent, request)

        run_result = await run_agent_task(
            agent=agent,
            command=request.command,
            target=request.target,
            resume=request.resume,
            snapshot_id=request.snapshot_id,
            before_restore=before_restore,
            on_restored=on_restored,
            runner=runner_fn,
        )
        manager.set_completed(task_id, latest_message="Task finished", summary=run_result.summary)
    except asyncio.CancelledError:
        manager.set_stopped(task_id)
        raise
    except Exception as exc:
        manager.set_failed(task_id, str(exc))
    finally:
        mcp_manager.stop_all()


async def _run_single_task(manager: WebTaskManager, task_id: str, agent: AgentCore, request: TaskCreateRequest) -> None:
    prompt = _build_prompt_v2(request)

    if request.command == "run":
        max_rounds = request.options.max_rounds or agent.config.session.max_rounds
        results = await agent.auto_pentest(prompt, target=request.target, max_rounds=max_rounds, on_step=_build_step_callback(manager, task_id))
        if results:
            last = results[-1]
            manager.update_progress(task_id, phase=last.phase, message=last.output[:200] if last.output else None)
        return

    result = await agent.chat(prompt, target=request.target)
    if result.output:
        manager.publish(
            task_id,
            "round_output",
            {
                "phase": result.phase or agent.session_state.phase.value,
                "text": result.output,
            },
        )
        manager.update_progress(task_id, phase=result.phase, message=result.output[:200])


async def _run_persistent_task(manager: WebTaskManager, task_id: str, agent: AgentCore, request: TaskCreateRequest) -> None:
    rounds_per_cycle = request.options.rounds_per_cycle or agent.config.session.persistent_rounds_per_cycle
    max_cycles = request.options.max_cycles or agent.config.session.persistent_max_cycles
    prompt = _build_prompt_v2(request)

    def on_cycle_step(round_num: int, cycle_num: int, result) -> None:
        manager.publish(
            task_id,
            "round_output",
            {
                "cycle": cycle_num,
                "round": round_num,
                "phase": result.phase,
                "text": result.output,
            },
        )
        manager.update_progress(task_id, phase=result.phase, message=(result.output or "")[:200])

    def on_cycle_complete(cycle_num: int, cycle_result) -> None:
        manager.publish(
            task_id,
            "cycle_completed",
            {
                "cycle": cycle_num,
                "new_findings": cycle_result.new_findings,
                "report_path": cycle_result.report_path,
            },
        )

    await agent.persistent_pentest(
        user_input=prompt,
        target=request.target,
        rounds_per_cycle=rounds_per_cycle,
        max_cycles=max_cycles,
        auto_report=True,
        on_cycle_step=on_cycle_step,
        on_cycle_complete=on_cycle_complete,
    )


def _build_step_callback(manager: WebTaskManager, task_id: str):
    def _callback(round_num: int, result) -> None:
        manager.publish(
            task_id,
            "round_output",
            {
                "round": round_num,
                "phase": result.phase,
                "text": result.output,
            },
        )
        manager.update_progress(task_id, phase=result.phase, message=(result.output or "")[:200])

    return _callback


def _build_prompt_v2(request: TaskCreateRequest) -> str:
    """Build a clean prompt string for Web-triggered tasks."""
    if request.command == "recon":
        return f"Perform authorized reconnaissance and information gathering against {request.target}."
    if request.command == "scan":
        return f"Perform authorized vulnerability scanning and verification against {request.target}."
    if request.command == "exploit":
        cve_hint = f" using {request.options.cve}" if request.options.cve else ""
        cmd_hint = f", verifying with command {request.options.cmd}" if request.options.cmd else ""
        return f"Attempt authorized exploitation against {request.target}{cve_hint}{cmd_hint}."
    if request.command == "persistent":
        return f"Perform an authorized persistent penetration test against {request.target}."
    return f"Perform a full authorized penetration test against {request.target}."
