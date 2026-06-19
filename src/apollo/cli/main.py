"""Apollo CLI - Command-line interface for Project LOGOS."""

from collections import Counter
from typing import Any, Dict, List, Optional, Sequence, Tuple
import time

import click
import requests
from rich.console import Console
from rich.console import Group
from rich.table import Table
from rich.panel import Panel
from rich.syntax import Syntax
from rich.text import Text
from rich.tree import Tree
import yaml
from logos_hermes_sdk.models.llm_message import LLMMessage
from logos_hermes_sdk.models.llm_request import LLMRequest

from apollo.client.sophia_client import SophiaClient
from apollo.client.hermes_client import HermesClient, HermesResponse
from apollo.client.persona_client import PersonaClient
from apollo.client.hcg_query_client import HCGQueryClient, HCGQueryError
from apollo.config.settings import ApolloConfig, PersonaApiConfig

import os

try:
    from logos_observability import setup_telemetry, get_tracer

    _OTEL_AVAILABLE = True
except ImportError:

    class _NoopSpan:
        """No-op span stub when OTel is not installed."""

        def set_attribute(self, *a: Any) -> None:
            pass

        def set_status(self, *a: Any) -> None:
            pass

        def record_exception(self, *a: Any) -> None:
            pass

        def __enter__(self) -> "_NoopSpan":
            return self

        def __exit__(self, *a: Any) -> None:
            pass

    class _NoopTracer:
        """No-op tracer stub when OTel is not installed."""

        def start_as_current_span(self, name: str, **kw: Any) -> _NoopSpan:
            return _NoopSpan()

    def get_tracer(name: str) -> _NoopTracer:  # type: ignore[misc]
        return _NoopTracer()

    setup_telemetry = None  # type: ignore[assignment]
    _OTEL_AVAILABLE = False

console = Console()

# Initialize OTel for CLI
if _OTEL_AVAILABLE:
    otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    setup_telemetry(
        service_name=os.getenv("OTEL_SERVICE_NAME", "apollo-cli"),
        export_to_console=os.getenv("OTEL_CONSOLE_EXPORT", "false").lower() == "true",
        otlp_endpoint=otlp_endpoint,
    )
cli_tracer = get_tracer("apollo.cli")

DEFAULT_CHAT_SYSTEM_PROMPT = (
    "You are the Hermes gateway assisting Apollo operators. "
    "Provide concise guidance, reference Hybrid Causal Graph facts when useful, "
    "and assume Sophia + Talos will handle execution."
)


@click.group()
@click.version_option(version="0.1.0", prog_name="apollo-cli")
@click.pass_context
def cli(ctx: click.Context) -> None:
    """Apollo CLI - Command interface for Project LOGOS.

    Apollo provides a command-line interface for interacting with
    Sophia (the cognitive core), visualizing agent state, and
    monitoring plan execution.
    """
    # Load configuration and store in context
    ctx.ensure_object(dict)
    ctx.obj["config"] = ApolloConfig.load()
    ctx.obj["client"] = SophiaClient(ctx.obj["config"].sophia)
    ctx.obj["hermes"] = HermesClient(ctx.obj["config"].hermes)
    ctx.obj["persona"] = PersonaClient(ctx.obj["config"].persona_api)


@cli.command()
@click.pass_context
def status(ctx: click.Context) -> None:
    """Display current connection status."""
    config: ApolloConfig = ctx.obj["config"]
    client: SophiaClient = ctx.obj["client"]

    console.print("[bold green]Apollo CLI v0.1.0[/bold green]")
    console.print("\n[bold]Sophia Configuration:[/bold]")
    console.print(f"  Host: {config.sophia.host}")
    console.print(f"  Port: {config.sophia.port}")
    console.print(f"  URL: {client.base_url}")

    console.print("\n[bold]Connection Status:[/bold]")
    if client.health_check():
        console.print("  [green]✓[/green] Sophia is accessible")
    else:
        console.print(
            f"  [yellow]✗[/yellow] Cannot connect to Sophia at {client.base_url}"
        )
        console.print(
            "\n[dim]Tip: Make sure Sophia service is running or check your config[/dim]"
        )


@cli.command()
@click.pass_context
def state(ctx: click.Context) -> None:
    """Display current agent state."""
    client: SophiaClient = ctx.obj["client"]

    console.print("[bold blue]Agent State[/bold blue]\n")

    response = client.get_state()

    if response.success and response.data:
        # Format and display the state data
        if isinstance(response.data, dict):
            # Create a formatted panel with state information
            state_text = yaml.dump(
                response.data, default_flow_style=False, sort_keys=False
            )
            syntax = Syntax(state_text, "yaml", theme="monokai", line_numbers=False)
            panel = Panel(syntax, title="Current State", border_style="blue")
            console.print(panel)
        else:
            console.print(response.data)
    else:
        console.print(f"[red]Error:[/red] {response.error}")
        console.print(
            "\n[dim]Tip: Ensure Sophia service is running and accessible[/dim]"
        )


@cli.command()
@click.argument("command", required=False)
@click.pass_context
def send(ctx: click.Context, command: Optional[str]) -> None:
    """Send a command to Sophia cognitive core.

    Args:
        command: The command to send
    """
    if not command:
        console.print("[yellow]Usage:[/yellow] apollo-cli send '<your command>'")
        console.print("\n[dim]Example:[/dim] apollo-cli send 'pick up the red block'")
        return

    client: SophiaClient = ctx.obj["client"]

    console.print(f"[bold]Sending command:[/bold] {command}\n")

    response = client.send_command(command)

    if response.success and response.data:
        # Format and display the response
        console.print("[green]✓[/green] Command sent successfully\n")

        if isinstance(response.data, dict):
            # Display formatted response
            response_text = yaml.dump(
                response.data, default_flow_style=False, sort_keys=False
            )
            syntax = Syntax(response_text, "yaml", theme="monokai", line_numbers=False)
            panel = Panel(syntax, title="Response", border_style="green")
            console.print(panel)
        else:
            console.print(response.data)
    else:
        console.print(f"[red]✗ Error:[/red] {response.error}")
        console.print(
            "\n[dim]Tip: Ensure Sophia service is running and accessible[/dim]"
        )


@cli.command()
@click.option("--recent", default=10, help="Number of recent plans to show")
@click.pass_context
def plans(ctx: click.Context, recent: int) -> None:
    """Show the most recent world-model states returned by Sophia.

    Args:
        recent: Number of recent states to display
    """
    client: SophiaClient = ctx.obj["client"]

    console.print(f"[bold blue]Recent Sophia States[/bold blue] (last {recent})\n")

    response = client.get_plans(limit=recent)

    if response.success and response.data:
        # Format and display plans
        if isinstance(response.data, dict):
            states = response.data.get("states", [])
            if states:
                table = Table(show_header=True, header_style="bold cyan")
                table.add_column("State ID", style="dim")
                table.add_column("Model", justify="center")
                table.add_column("Status", justify="center")
                table.add_column("Plan ID", style="dim")
                table.add_column("Timestamp", style="dim")

                for state in states:
                    links = state.get("links") or {}
                    table.add_row(
                        str(state.get("state_id", "n/a")),
                        state.get("model_type", "n/a"),
                        state.get("status", "n/a"),
                        links.get("plan_id", "—"),
                        state.get("timestamp", "n/a"),
                    )

                console.print(table)
            else:
                console.print("[dim]No states returned[/dim]")
        else:
            plans_text = yaml.dump(
                response.data, default_flow_style=False, sort_keys=False
            )
            syntax = Syntax(plans_text, "yaml", theme="monokai", line_numbers=False)
            panel = Panel(syntax, title="States", border_style="blue")
            console.print(panel)
    else:
        console.print(f"[red]Error:[/red] {response.error}")
        console.print(
            "\n[dim]Tip: Ensure Sophia service is running and accessible[/dim]"
        )


@cli.command()
@click.argument("description", required=False)
@click.option("--priority", default="normal", help="Goal priority (high, normal, low)")
@click.pass_context
def goal(ctx: click.Context, description: Optional[str], priority: str) -> None:
    """Create a new goal in Sophia.

    Args:
        description: Goal description
        priority: Priority level for the goal
    """
    with cli_tracer.start_as_current_span("apollo.cli.goal") as span:
        span.set_attribute("goal.description_length", len(description or ""))

        if not description:
            console.print(
                "[yellow]Usage:[/yellow] apollo-cli goal '<goal description>'"
            )
            console.print(
                "\n[dim]Example:[/dim] apollo-cli goal 'Navigate to the kitchen'"
            )
            console.print("\n[dim]Options:[/dim]")
            console.print(
                "  --priority [high|normal|low]  Set goal priority (default: normal)"
            )
            return

        client: SophiaClient = ctx.obj["client"]

        console.print(f"[bold]Creating goal:[/bold] {description}\n")
        console.print(f"[dim]Priority: {priority}[/dim]\n")

        # Create metadata with priority
        metadata = {"priority": priority}
        response = client.create_goal(description, metadata)

        if response.success and response.data:
            console.print("[green]✓[/green] Goal created successfully\n")

            if isinstance(response.data, dict):
                # Display formatted response
                response_text = yaml.dump(
                    response.data, default_flow_style=False, sort_keys=False
                )
                syntax = Syntax(
                    response_text, "yaml", theme="monokai", line_numbers=False
                )
                panel = Panel(syntax, title="Goal Details", border_style="green")
                console.print(panel)
            else:
                console.print(response.data)
        else:
            console.print(f"[red]✗ Error:[/red] {response.error}")
            console.print(
                "\n[dim]Tip: Ensure Sophia service is running and accessible[/dim]"
            )


@cli.command()
@click.argument("goal", required=False)
@click.pass_context
def plan(ctx: click.Context, goal: Optional[str]) -> None:
    """Invoke the Sophia planner with a goal description."""
    with cli_tracer.start_as_current_span("apollo.cli.plan") as span:
        span.set_attribute("plan.goal", (goal or "")[:200])

        if not goal:
            console.print(
                "[yellow]Usage:[/yellow] apollo-cli plan '<goal description>'"
            )
            console.print(
                "\n[dim]Example:[/dim] apollo-cli plan 'Inspect the kitchen counters'"
            )
            console.print(
                "\n[dim]Tip:[/dim] Include constraints in plain English if needed"
            )
            return

        client: SophiaClient = ctx.obj["client"]

        console.print(f"[bold]Invoking planner for goal:[/bold] {goal}\n")

        response = client.invoke_planner(goal)

        if response.success and response.data:
            console.print("[green]\u2713[/green] Plan generated successfully\n")

            if isinstance(response.data, dict):
                # Display formatted response
                response_text = yaml.dump(
                    response.data, default_flow_style=False, sort_keys=False
                )
                syntax = Syntax(
                    response_text, "yaml", theme="monokai", line_numbers=False
                )
                panel = Panel(syntax, title="Plan Details", border_style="green")
                console.print(panel)
            else:
                console.print(response.data)
        else:
            console.print(f"[red]\u2717 Error:[/red] {response.error}")
            console.print(
                "\n[dim]Tip: Ensure Sophia service is running"
                " and the goal exists[/dim]"
            )


@cli.command()
@click.argument("plan_id", required=False)
@click.option("--step", default=0, help="Step index to execute (default: 0)")
@click.pass_context
def execute(ctx: click.Context, plan_id: Optional[str], step: int) -> None:
    """Execute a single step from a plan.

    Args:
        plan_id: ID of the plan to execute
        step: Index of the step to execute
    """
    with cli_tracer.start_as_current_span("apollo.cli.execute") as span:
        if plan_id:
            span.set_attribute("execute.plan_id", plan_id)
        span.set_attribute("execute.step", step)

        if not plan_id:
            console.print("[yellow]Usage:[/yellow] apollo-cli execute '<plan_id>'")
            console.print("\n[dim]Example:[/dim] apollo-cli execute 'plan_12345'")
            console.print("\n[dim]Options:[/dim]")
            console.print("  --step <index>  Step index to execute (default: 0)")
            console.print(
                "\n[dim]Tip:[/dim] Generate a plan first with 'apollo-cli plan'"
            )
            return

        client: SophiaClient = ctx.obj["client"]

        console.print(f"[bold]Executing step {step} of plan:[/bold] {plan_id}\n")

        response = client.execute_step(plan_id, step)

        if response.success and response.data:
            console.print(f"[green]\u2713[/green] Step {step} executed successfully\n")

            if isinstance(response.data, dict):
                # Display formatted response
                response_text = yaml.dump(
                    response.data, default_flow_style=False, sort_keys=False
                )
                syntax = Syntax(
                    response_text, "yaml", theme="monokai", line_numbers=False
                )
                panel = Panel(syntax, title="Execution Result", border_style="green")
                console.print(panel)
            else:
                console.print(response.data)
        else:
            console.print(f"[red]\u2717 Error:[/red] {response.error}")
            console.print(
                "\n[dim]Tip: Ensure Sophia service is running"
                " and the plan exists[/dim]"
            )


@cli.command()
def history() -> None:
    """Display command history."""
    console.print("[bold blue]Command History[/bold blue]")
    console.print(
        "\n[dim]Command history tracking will be implemented in a future iteration[/dim]"
    )


@cli.command()
@click.argument("plan_id", required=False)
@click.option(
    "--horizon",
    type=int,
    default=None,
    help="Number of imagined steps (1-50). Defaults to SDK value.",
)
@click.pass_context
def simulate(
    ctx: click.Context, plan_id: Optional[str], horizon: Optional[int]
) -> None:
    """Simulate plan execution without committing changes.

    Args:
        plan_id: ID of the plan to simulate
    """
    if not plan_id:
        console.print("[yellow]Usage:[/yellow] apollo-cli simulate '<plan_id>'")
        console.print("\n[dim]Example:[/dim] apollo-cli simulate 'plan_12345'")
        console.print("\n[dim]Tip:[/dim] Generate a plan first with 'apollo-cli plan'")
        return

    client: SophiaClient = ctx.obj["client"]

    console.print(f"[bold]Simulating plan:[/bold] {plan_id}\n")

    response = client.simulate_plan(plan_id, horizon_steps=horizon)

    if response.success and response.data:
        console.print("[green]✓[/green] Simulation completed successfully\n")

        if isinstance(response.data, dict):
            # Display formatted response
            response_text = yaml.dump(
                response.data, default_flow_style=False, sort_keys=False
            )
            syntax = Syntax(response_text, "yaml", theme="monokai", line_numbers=False)
            panel = Panel(syntax, title="Simulation Results", border_style="green")
            console.print(panel)
        else:
            console.print(response.data)
    else:
        console.print(f"[red]✗ Error:[/red] {response.error}")
        console.print(
            "\n[dim]Tip: Ensure Sophia service is running and the plan exists[/dim]"
        )


@cli.command()
@click.argument("text", required=False)
@click.option(
    "--model",
    default="default",
    help="Embedding model to use (see Hermes docs for options)",
)
@click.pass_context
def embed(ctx: click.Context, text: Optional[str], model: str) -> None:
    """Generate text embedding using Hermes.

    Args:
        text: Text to embed
        model: Embedding model to use
    """
    with cli_tracer.start_as_current_span("apollo.cli.embed") as span:
        span.set_attribute("embed.text_length", len(text or ""))

        if not text:
            console.print("[yellow]Usage:[/yellow] apollo-cli embed '<text>'")
            console.print(
                "\n[dim]Example:[/dim] apollo-cli embed" " 'Navigate to the kitchen'"
            )
            console.print("\n[dim]Options:[/dim]")
            console.print("  --model <name>  Embedding model (default: default)")
            return

        hermes: HermesClient = ctx.obj["hermes"]

        console.print(f"[bold]Generating embedding for:[/bold] {text}\n")
        console.print(f"[dim]Model: {model}[/dim]\n")

        response = hermes.embed_text(text, model=model)

        if response.success and response.data:
            console.print("[green]\u2713[/green] Embedding generated successfully\n")

            if isinstance(response.data, dict):
                # Display formatted response (truncate embedding vector)
                display_data = response.data.copy()
                if "embedding" in display_data and isinstance(
                    display_data["embedding"], list
                ):
                    embedding = display_data["embedding"]
                    if len(embedding) > 10:
                        display_data["embedding"] = (
                            embedding[:5] + ["..."] + embedding[-5:]
                        )
                        display_data[
                            "_note"
                        ] = f"Full embedding has {len(embedding)} dimensions"

                response_text = yaml.dump(
                    display_data, default_flow_style=False, sort_keys=False
                )
                syntax = Syntax(
                    response_text, "yaml", theme="monokai", line_numbers=False
                )
                panel = Panel(syntax, title="Embedding Result", border_style="green")
                console.print(panel)
            else:
                console.print(response.data)
        else:
            console.print(f"[red]\u2717 Error:[/red] {response.error}")
            console.print(
                "\n[dim]Tip: Ensure Hermes service is running" " and accessible[/dim]"
            )


@cli.command()
@click.argument("prompt", required=False)
@click.option("--provider", help="Override Hermes provider for this request")
@click.option(
    "--model",
    "model_override",
    help="Override Hermes model identifier (default: config value)",
)
@click.option(
    "--temperature",
    type=click.FloatRange(0.0, 2.0),
    help="Override sampling temperature (0.0-2.0)",
)
@click.option(
    "--max-tokens",
    type=click.IntRange(1),
    help="Override maximum completion tokens",
)
@click.option(
    "--system",
    "system_prompt_override",
    help="Custom system prompt (defaults to config or CLI standard)",
)
@click.option(
    "--persona-limit",
    default=5,
    show_default=True,
    type=click.IntRange(0),
    help="Number of recent persona diary entries to include for context",
)
@click.option(
    "--no-persona",
    is_flag=True,
    help="Skip persona diary context for this request",
)
@click.pass_context
def chat(
    ctx: click.Context,
    prompt: Optional[str],
    provider: Optional[str],
    model_override: Optional[str],
    temperature: Optional[float],
    max_tokens: Optional[int],
    system_prompt_override: Optional[str],
    persona_limit: int,
    no_persona: bool,
) -> None:
    """Send a conversational query through Hermes' LLM gateway."""
    with cli_tracer.start_as_current_span("apollo.cli.chat") as span:
        if not prompt:
            prompt = click.prompt("Enter your prompt")

        span.set_attribute("chat.prompt_length", len(prompt))

        config: ApolloConfig = ctx.obj["config"]
        hermes: HermesClient = ctx.obj["hermes"]
        persona_client: PersonaClient = ctx.obj["persona"]

        overrides = {
            "provider": provider or config.hermes.provider,
            "model": model_override or config.hermes.model,
            "temperature": (
                temperature if temperature is not None else config.hermes.temperature
            ),
            "max_tokens": (
                max_tokens if max_tokens is not None else config.hermes.max_tokens
            ),
        }

        persona_entries: List[Dict[str, Any]] = []
        if not no_persona and persona_limit > 0:
            persona_entries = _fetch_persona_entries(persona_client, persona_limit)
            if persona_entries:
                console.print(
                    Panel(
                        _format_persona_summary(persona_entries),
                        title="Persona Context",
                        border_style="cyan",
                    )
                )

        persona_metadata = _build_persona_metadata(persona_entries)
        system_prompt = (
            system_prompt_override
            or config.hermes.system_prompt
            or DEFAULT_CHAT_SYSTEM_PROMPT
        )
        persona_block = persona_metadata.pop("persona_context_block", None)
        if persona_block:
            system_prompt = (
                f"{system_prompt}\n\nPersona diary context:\n{persona_block}"
            )

        llm_request = _build_llm_request(
            prompt=prompt,
            system_prompt=system_prompt,
            overrides=overrides,
            metadata=_sanitize_metadata(
                {
                    "surface": "apollo-cli.chat",
                    "cli_version": "0.1.0",
                    **persona_metadata,
                }
            ),
        )

        console.print("[bold]Contacting Hermes...[/bold]\n")
        started = time.perf_counter()
        response: HermesResponse = hermes.llm_generate(llm_request)
        latency_ms = (time.perf_counter() - started) * 1000.0

        if response.success and isinstance(response.data, dict):
            completion_text = _extract_completion_text(response.data)
            usage_note = _format_usage(response.data.get("usage"))
            console.print(
                Panel(
                    completion_text or "[dim]Hermes returned an empty message[/dim]",
                    title="Hermes Response",
                    border_style="green",
                )
            )
            if usage_note:
                console.print(f"[dim]{usage_note}[/dim]")
            console.print(f"[dim]Latency:[/dim] {latency_ms:.1f} ms\n")

            _emit_llm_telemetry(
                config.persona_api,
                response.data,
                latency_ms,
                llm_request.metadata or {},
            )
            _log_persona_entry(
                persona_client=persona_client,
                prompt=prompt,
                response_text=completion_text,
                response_data=response.data,
                metadata=llm_request.metadata or {},
            )
        else:
            console.print("[red]\u2717 Hermes request failed[/red]")
            console.print(
                response.error
                or "Hermes did not return a completion response."
                " Check the service logs."
            )


@cli.command()
@click.argument("content", required=False)
@click.option(
    "--type",
    "entry_type",
    default="observation",
    help="Entry type: belief, decision, observation, reflection",
)
@click.option("--summary", help="Brief summary of the entry")
@click.option(
    "--sentiment",
    help="Sentiment: positive, negative, neutral, mixed",
)
@click.option("--confidence", type=float, help="Confidence level (0.0-1.0)")
@click.option("--process", multiple=True, help="Related process IDs")
@click.option("--goal", multiple=True, help="Related goal IDs")
@click.option("--emotion", multiple=True, help="Emotion tags")
@click.pass_context
def diary(
    ctx: click.Context,
    content: Optional[str],
    entry_type: str,
    summary: Optional[str],
    sentiment: Optional[str],
    confidence: Optional[float],
    process: tuple,
    goal: tuple,
    emotion: tuple,
) -> None:
    """Create a persona diary entry.

    Args:
        content: The main content of the diary entry
        entry_type: Type of entry (belief, decision, observation, reflection)
        summary: Brief summary for quick reference
        sentiment: Sentiment of the entry
        confidence: Confidence level for beliefs/decisions
        process: Related process IDs
        goal: Related goal IDs
        emotion: Emotion tags
    """
    if not content:
        console.print("[yellow]Usage:[/yellow] apollo-cli diary '<content>'")
        console.print(
            "\n[dim]Example:[/dim] apollo-cli diary 'Successfully navigated to kitchen' --type decision --sentiment positive"
        )
        console.print("\n[dim]Options:[/dim]")
        console.print("  --type [belief|decision|observation|reflection]")
        console.print("  --summary '<brief summary>'")
        console.print("  --sentiment [positive|negative|neutral|mixed]")
        console.print("  --confidence <0.0-1.0>")
        console.print("  --process <process_id>  (can be used multiple times)")
        console.print("  --goal <goal_id>  (can be used multiple times)")
        console.print("  --emotion <tag>  (can be used multiple times)")
        return

    persona_client: PersonaClient = ctx.obj["persona"]

    console.print("[bold]Creating persona diary entry:[/bold]\n")
    console.print(f"[dim]Type: {entry_type}[/dim]")
    console.print(f"[dim]Content: {content}[/dim]\n")

    response = persona_client.create_entry(
        content=content,
        entry_type=entry_type,
        summary=summary,
        sentiment=sentiment,
        confidence=confidence,
        process=list(process),
        goal=list(goal),
        emotion=list(emotion),
    )

    if response.success and response.data:
        console.print("[green]✓[/green] Diary entry created successfully\n")
        entry_text = yaml.dump(response.data, default_flow_style=False, sort_keys=False)
        syntax = Syntax(entry_text, "yaml", theme="monokai", line_numbers=False)
        panel = Panel(syntax, title="Diary Entry", border_style="green")
        console.print(panel)
    else:
        console.print(f"[red]✗ Error:[/red] {response.error or 'Unknown error'}")
        console.print(
            "\n[dim]Tip: Ensure apollo-api server is running (apollo-api command)[/dim]"
        )


def _log_persona_entry(
    *,
    persona_client: PersonaClient,
    prompt: str,
    response_text: str,
    response_data: Dict[str, Any],
    metadata: Dict[str, Any],
) -> None:
    payload_metadata = _sanitize_metadata(
        {
            **metadata,
            "prompt": prompt,
            "hermes_response_id": response_data.get("id"),
            "hermes_provider": response_data.get("provider"),
            "hermes_model": response_data.get("model"),
        }
    )
    entry_response = persona_client.create_entry(
        content=response_text or "[Hermes returned an empty message]",
        entry_type="observation",
        summary=_truncate_summary(prompt),
        sentiment=None,
        confidence=None,
        process=[],
        goal=[],
        emotion=[],
        metadata=payload_metadata,
    )
    if not entry_response.success:
        console.log(
            f"[yellow]Warning:[/yellow] Failed to log persona entry: {entry_response.error}"
        )


def _fetch_persona_entries(
    persona_client: PersonaClient, limit: int
) -> List[Dict[str, Any]]:
    response = persona_client.list_entries(
        entry_type=None,
        sentiment=None,
        related_process_id=None,
        related_goal_id=None,
        limit=limit,
        offset=0,
    )
    if response.success and isinstance(response.data, list):
        return response.data
    if response.error:
        console.log(
            f"[yellow]Warning:[/yellow] Unable to fetch persona context: {response.error}"
        )
    return []


def _format_persona_summary(entries: Sequence[Dict[str, Any]]) -> str:
    lines: List[str] = []
    for entry in entries:
        entry_type = str(entry.get("entry_type", "entry")).title()
        sentiment = entry.get("sentiment")
        timestamp = entry.get("timestamp", "recently")
        summary = entry.get("summary") or entry.get("content", "")
        snippet = summary.strip()
        if len(snippet) > 160:
            snippet = f"{snippet[:157]}..."
        sentiment_note = f" ({sentiment})" if sentiment else ""
        lines.append(f"- {entry_type}{sentiment_note} @ {timestamp}: {snippet}")
    return "\n".join(lines)


def _build_persona_metadata(entries: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    metadata: Dict[str, Any] = {"persona_context_used": bool(entries)}
    if not entries:
        return metadata

    entry_ids = [entry.get("id") for entry in entries if entry.get("id")]
    entry_types = [
        str(entry.get("entry_type")).lower()
        for entry in entries
        if entry.get("entry_type")
    ]
    sentiments = [
        str(entry.get("sentiment")).lower()
        for entry in entries
        if entry.get("sentiment")
    ]

    if entry_ids:
        metadata["persona_entry_ids"] = entry_ids
    if entry_types:
        metadata["persona_entry_types"] = dict(Counter(entry_types))
    if sentiments:
        metadata["persona_sentiments"] = dict(Counter(sentiments))

    metadata["persona_context_block"] = _format_persona_summary(entries)
    metadata["persona_context_count"] = len(entries)
    return metadata


def _sanitize_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
    sanitized: Dict[str, Any] = {}
    for key, value in metadata.items():
        if value in (None, "", [], {}):
            continue
        if isinstance(value, dict):
            nested = _sanitize_metadata(value)
            if nested:
                sanitized[key] = nested
        elif isinstance(value, (list, tuple)):
            cleaned = [
                item for item in value if isinstance(item, (str, int, float, bool))
            ]
            if cleaned:
                sanitized[key] = cleaned
        elif isinstance(value, (str, int, float, bool)):
            sanitized[key] = value
    return sanitized


def _truncate_summary(text: str, max_length: int = 160) -> str:
    text = text.strip()
    if len(text) <= max_length:
        return text
    return f"{text[:max_length].rstrip()}…"


def _build_llm_request(
    *,
    prompt: str,
    system_prompt: str,
    overrides: Dict[str, Optional[Any]],
    metadata: Dict[str, Any],
) -> LLMRequest:
    messages = [
        LLMMessage(role="system", content=system_prompt.strip()),
        LLMMessage(role="user", content=prompt.strip()),
    ]

    kwargs: Dict[str, Any] = {
        "messages": messages,
    }
    if metadata:
        kwargs["metadata"] = metadata

    if overrides.get("provider"):
        kwargs["provider"] = overrides["provider"]
    if overrides.get("model"):
        kwargs["model"] = overrides["model"]
    if overrides.get("temperature") is not None:
        kwargs["temperature"] = overrides["temperature"]
    if overrides.get("max_tokens") is not None:
        kwargs["max_tokens"] = overrides["max_tokens"]

    return LLMRequest(**kwargs)


def _extract_completion_text(response_data: Dict[str, Any]) -> str:
    choices = response_data.get("choices") or []
    for choice in choices:
        message = choice.get("message") or {}
        content = message.get("content")
        if content:
            return str(content)
    raw_text = response_data.get("text")
    return str(raw_text) if raw_text else ""


def _format_usage(usage: Optional[Dict[str, Any]]) -> str:
    if not isinstance(usage, dict):
        return ""
    prompt_tokens = usage.get("prompt_tokens") or usage.get("promptTokens")
    completion_tokens = usage.get("completion_tokens") or usage.get("completionTokens")
    total_tokens = usage.get("total_tokens") or usage.get("totalTokens")

    parts: List[str] = []
    if prompt_tokens is not None:
        parts.append(f"prompt {prompt_tokens}")
    if completion_tokens is not None:
        parts.append(f"completion {completion_tokens}")
    if total_tokens is not None:
        parts.append(f"total {total_tokens}")
    return f"Usage: {', '.join(parts)}" if parts else ""


def _extract_persona_signal(
    response_data: Dict[str, Any],
) -> Tuple[Optional[str], Optional[float]]:
    raw = response_data.get("raw")
    if isinstance(raw, dict):
        sentiment = raw.get("persona_sentiment")
        confidence = raw.get("persona_confidence")
        if isinstance(sentiment, str):
            return sentiment, (
                float(confidence) if isinstance(confidence, (int, float)) else None
            )
        persona_block = raw.get("persona")
        if isinstance(persona_block, dict):
            sentiment = persona_block.get("sentiment")
            confidence = persona_block.get("confidence")
            if isinstance(sentiment, str):
                return sentiment, (
                    float(confidence) if isinstance(confidence, (int, float)) else None
                )
    return None, None


def _emit_llm_telemetry(
    persona_config: PersonaApiConfig,
    response_data: Dict[str, Any],
    latency_ms: float,
    metadata: Dict[str, Any],
) -> None:
    base_url = _persona_api_base_url(persona_config)
    url = f"{base_url}/api/diagnostics/llm"
    usage = response_data.get("usage") or {}
    persona_sentiment, persona_confidence = _extract_persona_signal(response_data)

    payload = {
        "latency_ms": round(latency_ms, 2),
        "prompt_tokens": usage.get("prompt_tokens") or usage.get("promptTokens"),
        "completion_tokens": usage.get("completion_tokens")
        or usage.get("completionTokens"),
        "total_tokens": usage.get("total_tokens") or usage.get("totalTokens"),
        "persona_sentiment": persona_sentiment,
        "persona_confidence": persona_confidence,
        "metadata": _sanitize_metadata(
            {
                **metadata,
                "response_id": response_data.get("id"),
                "hermes_provider": response_data.get("provider"),
                "hermes_model": response_data.get("model"),
            }
        ),
    }

    headers = {"Content-Type": "application/json"}
    if persona_config.api_key:
        headers["Authorization"] = f"Bearer {persona_config.api_key}"

    try:
        requests.post(
            url,
            json=payload,
            headers=headers,
            timeout=persona_config.timeout,
        )
    except requests.RequestException as exc:
        console.log(f"[yellow]Warning:[/yellow] Unable to emit Hermes telemetry: {exc}")


def _persona_api_base_url(config: PersonaApiConfig) -> str:
    if config.host.startswith(("http://", "https://")):
        return config.host.rstrip("/")
    return f"http://{config.host}:{config.port}"


def _graph_client(ctx: click.Context) -> HCGQueryClient:
    """Lazily build an HCGQueryClient from the loaded Apollo config.

    Built per-command (not in the root group) so commands that mock a config
    without graph support are unaffected.
    """
    config: ApolloConfig = ctx.obj["config"]
    return HCGQueryClient(config.sophia)


def _graph_error(message: str, tip: str) -> None:
    """Print a graph command error in the standard red + dim-tip style."""
    console.print(f"[red]✗ Error:[/red] {message}")
    console.print(f"\n[dim]Tip: {tip}[/dim]")


def _proportion_bar(content: int, edge: int, width: int = 40) -> Text:
    """Build a two-tone horizontal bar splitting ``width`` between two counts."""
    total = content + edge
    bar = Text()
    if total <= 0:
        bar.append("█" * width, style="dim")
        return bar
    content_cells = round(width * content / total)
    content_cells = max(0, min(width, content_cells))
    edge_cells = width - content_cells
    bar.append("█" * content_cells, style="cyan")
    bar.append("█" * edge_cells, style="magenta")
    return bar


def _counts_bar_table(data: Dict[str, int], top: int = 10) -> Table:
    """Render a compact label/bar/count table scaled to the max count."""
    table = Table(show_header=False, box=None, pad_edge=False)
    table.add_column("label", style="bold")
    table.add_column("bar")
    table.add_column("count", justify="right", style="dim")

    items = sorted(data.items(), key=lambda kv: kv[1], reverse=True)[:top]
    max_count = max((count for _, count in items), default=0)
    max_width = 24
    for label, count in items:
        if max_count > 0:
            cells = max(1, round(max_width * count / max_count))
        else:
            cells = 0
        bar = Text("█" * cells, style="green")
        table.add_row(str(label), bar, str(count))
    return table


@cli.group()
@click.pass_context
def graph(ctx: click.Context) -> None:
    """Query the Hybrid Causal Graph via Sophia."""


@graph.command("stats")
@click.pass_context
def graph_stats(ctx: click.Context) -> None:
    """Show graph-wide statistics with proportion bars."""
    client = _graph_client(ctx)
    try:
        data = client.stats()
        type_rows = client.types(limit=2000)
    except HCGQueryError as exc:
        _graph_error(str(exc), "Ensure Sophia is running and SOPHIA_API_TOKEN is set")
        return

    total = int(data.get("total_nodes", 0))
    content = int(data.get("content_nodes", 0))
    edge = int(data.get("edge_nodes", 0))
    classified = int(data.get("content_classified", 0))
    top_predicates = {k: int(v) for k, v in (data.get("top_predicates") or {}).items()}

    # Distribution by ACTUAL (positional) type, not the coarse realm: drop the
    # realm roots so the bars show what the graph is about (cell, biomolecule…).
    realms = {"entity", "concept", "process", "node", "root"}
    by_type = {
        str(r["name"]): int(r.get("member_count") or 0)
        for r in type_rows
        if r.get("name") and r["name"] not in realms
    }

    headline = Text()
    headline.append("Total nodes: ", style="bold")
    headline.append(str(total), style="bold white")
    headline.append("  =  ")
    headline.append(f"{content} content", style="cyan")
    headline.append("  +  ")
    headline.append(f"{edge} edge-nodes", style="magenta")

    legend = Text()
    legend.append("█ content ", style="cyan")
    legend.append("  ")
    legend.append("█ edge-nodes", style="magenta")

    type_table = _counts_bar_table(by_type, top=12)
    predicate_table = _counts_bar_table(top_predicates, top=10)

    parked = int(data.get("content_parked", 0))
    untyped = max(content - classified - parked, 0)
    coverage = Text()
    if content:
        pct = round(100 * classified / content)
        coverage.append("Typing coverage: ", style="bold")
        coverage.append(f"{classified}/{content} ({pct}%)", style="cyan")
        coverage.append(" under a specific type · ")
        coverage.append(f"{parked} parked under a realm", style="dim")
        if untyped:
            coverage.append(" · ")
            coverage.append(f"{untyped} untyped", style="yellow")

    body = Group(
        headline,
        Text(""),
        _proportion_bar(content, edge),
        legend,
        Text(""),
        coverage,
        Text(""),
        Text("Top types by membership (positional):", style="bold underline"),
        type_table,
        Text(""),
        Text("Top predicates (top 10):", style="bold underline"),
        predicate_table,
    )
    console.print(Panel(body, title="HCG Stats", border_style="cyan"))


@graph.command("types")
@click.option("--limit", default=20, show_default=True, help="Max type rows to fetch")
@click.pass_context
def graph_types(ctx: click.Context, limit: int) -> None:
    """Show the positional type hierarchy as a tree."""
    client = _graph_client(ctx)
    try:
        # Fetch the full (small) type layer so the tree can be rooted correctly.
        # --limit then bounds what we DISPLAY, not what we fetch: we show the top
        # `limit` types by membership PLUS each one's ancestor chain, so a shown
        # type's parent is always present and children don't orphan to the root.
        all_rows = client.types(limit=2000)
    except HCGQueryError as exc:
        _graph_error(str(exc), "Ensure Sophia is running and SOPHIA_API_TOKEN is set")
        return

    if not all_rows:
        console.print("[dim]No type definitions returned[/dim]")
        return

    full_by_name: Dict[str, Dict[str, Any]] = {
        r["name"]: r for r in all_rows if r.get("name")
    }
    top = sorted(all_rows, key=lambda r: -(r.get("member_count") or 0))[:limit]
    keep: set = set()
    for r in top:
        nm = r.get("name")
        while nm and nm in full_by_name and nm not in keep:
            keep.add(nm)
            nm = full_by_name[nm].get("parent")
    rows = [r for r in all_rows if r.get("name") in keep]

    # Index rows by name and build parent -> children adjacency.
    by_name: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        name = row.get("name")
        if name:
            by_name[name] = row

    children: Dict[str, List[Dict[str, Any]]] = {}
    roots: List[Dict[str, Any]] = []
    for row in rows:
        parent = row.get("parent")
        if parent and parent in by_name:
            children.setdefault(parent, []).append(row)
        else:
            # parent is null OR points outside the fetched set -> treat as root
            roots.append(row)

    def _label(row: Dict[str, Any]) -> str:
        name = str(row.get("name", "?"))
        count = row.get("member_count")
        if count is not None:
            return f"{name} [dim]({count})[/dim]"
        return name

    tree = Tree("[bold]Type hierarchy[/bold]")

    def _attach(parent_branch: Tree, row: Dict[str, Any], seen: set) -> None:
        name = str(row.get("name", ""))
        if name in seen:  # guard against cycles
            parent_branch.add(f"{_label(row)} [red](cycle)[/red]")
            return
        seen = seen | {name}
        branch = parent_branch.add(_label(row))
        for child in sorted(
            children.get(name, []), key=lambda r: str(r.get("name", ""))
        ):
            _attach(branch, child, seen)

    for root in sorted(roots, key=lambda r: str(r.get("name", ""))):
        _attach(tree, root, set())

    console.print(tree)


@graph.command("search")
@click.argument("query")
@click.option("--limit", default=10, show_default=True, help="Max results")
@click.pass_context
def graph_search(ctx: click.Context, query: str, limit: int) -> None:
    """Search the graph for nodes matching QUERY."""
    client = _graph_client(ctx)
    try:
        results = client.search(query, limit=limit)
    except HCGQueryError as exc:
        _graph_error(str(exc), "Ensure Sophia is running and SOPHIA_API_TOKEN is set")
        return

    if not results:
        console.print(f"[dim]No results for '{query}'[/dim]")
        return

    table = Table(show_header=True, header_style="bold cyan")
    table.add_column("UUID", style="dim")
    table.add_column("Name")
    table.add_column("Type", justify="center")
    for hit in results:
        table.add_row(
            str(hit.get("uuid", "—")),
            str(hit.get("name", "—")),
            str(hit.get("type", "—")),
        )
    console.print(table)


@graph.command("node")
@click.argument("uuid")
@click.pass_context
def graph_node(ctx: click.Context, uuid: str) -> None:
    """Show a single entity's properties as highlighted YAML."""
    client = _graph_client(ctx)
    try:
        entity = client.entity(uuid)
    except HCGQueryError as exc:
        _graph_error(str(exc), "Check the UUID and that Sophia is running")
        return

    if not entity:
        console.print(f"[dim]No entity found for {uuid}[/dim]")
        return

    name = str(entity.get("name", uuid))
    # Prefer the nested properties block; otherwise dump the object minus noise.
    if isinstance(entity.get("properties"), dict):
        payload = entity["properties"]
    else:
        payload = {
            k: v for k, v in entity.items() if k not in ("embedding", "embedding_2d")
        }

    api_url = f"{client.base_url}/hcg/entities/{uuid}"
    link_line = Text()
    link_line.append("uuid: ", style="dim")
    link_line.append(uuid, style=f"link {api_url}")

    entity_text = yaml.dump(payload, default_flow_style=False, sort_keys=False)
    syntax = Syntax(entity_text, "yaml", theme="monokai", line_numbers=False)
    body = Group(link_line, Text(""), syntax)
    console.print(
        Panel(
            body,
            title=f"Entity {name}",
            subtitle=f"[link={api_url}]{uuid}[/link]",
            border_style="green",
        )
    )


@graph.command("neighbors")
@click.argument("uuid")
@click.option("--depth", default=1, show_default=True, help="Neighborhood depth")
@click.option("--limit", default=25, show_default=True, help="Max neighbors")
@click.option(
    "--image/--no-image",
    default=False,
    help="Render an inline node-link image when the terminal supports it",
)
@click.pass_context
def graph_neighbors(
    ctx: click.Context, uuid: str, depth: int, limit: int, image: bool
) -> None:
    """Show a node's de-reified neighborhood as a directional tree."""
    client = _graph_client(ctx)
    try:
        data = client.neighborhood(uuid, depth=depth, limit=limit)
    except HCGQueryError as exc:
        _graph_error(str(exc), "Check the UUID and that Sophia is running")
        return

    nodes = data.get("nodes") or []
    edges = data.get("edges") or []
    metadata = data.get("metadata") or {}
    root_uuid = str(metadata.get("root", uuid))

    # Build uuid -> name map from neighbors (root is NOT in nodes).
    name_by_uuid: Dict[str, str] = {}
    for node in nodes:
        nid = node.get("uuid")
        if nid:
            name_by_uuid[nid] = str(node.get("name", nid))

    # Best-effort root name via the entity endpoint; fall back to the uuid.
    root_name = root_uuid
    try:
        root_entity = client.entity(root_uuid)
        if root_entity.get("name"):
            root_name = str(root_entity["name"])
    except HCGQueryError:
        pass

    def _short(value: str) -> str:
        return value[:8]

    tree = Tree(f"[bold]{root_name}[/bold] [dim]({_short(root_uuid)})[/dim]")
    for edge in edges:
        source = edge.get("source")
        target = edge.get("target")
        relation = str(edge.get("relation", ""))
        if source == root_uuid:
            other = str(target)
            label = f"─{relation}→ " f"{name_by_uuid.get(other, _short(other))}"
        elif target == root_uuid:
            other = str(source)
            label = f"←{relation}─ " f"{name_by_uuid.get(other, _short(other))}"
        else:
            # Edge not incident to root (shouldn't normally happen); show raw.
            label = (
                f"{name_by_uuid.get(str(source), _short(str(source)))} "
                f"─{relation}→ "
                f"{name_by_uuid.get(str(target), _short(str(target)))}"
            )
        tree.add(label)

    if image:
        from apollo.cli.graph_image import try_inline_neighborhood

        rendered = try_inline_neighborhood(root_uuid, root_name, nodes, edges)
        if not rendered:
            console.print(
                "[dim]graph-image unavailable; showing tree "
                "(install extra: poetry install -E graph-image, and use a "
                "kitty/iTerm2/sixel terminal)[/dim]"
            )

    console.print(tree)


def main() -> None:
    """Entry point for the CLI."""
    cli()


if __name__ == "__main__":
    main()
