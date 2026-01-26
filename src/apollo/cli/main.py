"""Apollo CLI - Command-line interface for Project LOGOS."""

from collections import Counter
from typing import Any, Dict, List, Optional, Sequence, Tuple
import time

import click
import requests
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.syntax import Syntax
import yaml
from logos_hermes_sdk.models.llm_message import LLMMessage
from logos_hermes_sdk.models.llm_request import LLMRequest

from apollo.client.sophia_client import SophiaClient
from apollo.client.hermes_client import HermesClient, HermesResponse
from apollo.client.persona_client import PersonaClient
from apollo.config.settings import ApolloConfig, PersonaApiConfig

console = Console()

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
    if not description:
        console.print("[yellow]Usage:[/yellow] apollo-cli goal '<goal description>'")
        console.print("\n[dim]Example:[/dim] apollo-cli goal 'Navigate to the kitchen'")
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
            syntax = Syntax(response_text, "yaml", theme="monokai", line_numbers=False)
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

    if not goal:
        console.print("[yellow]Usage:[/yellow] apollo-cli plan '<goal description>'")
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
        console.print("[green]✓[/green] Plan generated successfully\n")

        if isinstance(response.data, dict):
            # Display formatted response
            response_text = yaml.dump(
                response.data, default_flow_style=False, sort_keys=False
            )
            syntax = Syntax(response_text, "yaml", theme="monokai", line_numbers=False)
            panel = Panel(syntax, title="Plan Details", border_style="green")
            console.print(panel)
        else:
            console.print(response.data)
    else:
        console.print(f"[red]✗ Error:[/red] {response.error}")
        console.print(
            "\n[dim]Tip: Ensure Sophia service is running and the goal exists[/dim]"
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
    if not plan_id:
        console.print("[yellow]Usage:[/yellow] apollo-cli execute '<plan_id>'")
        console.print("\n[dim]Example:[/dim] apollo-cli execute 'plan_12345'")
        console.print("\n[dim]Options:[/dim]")
        console.print("  --step <index>  Step index to execute (default: 0)")
        console.print("\n[dim]Tip:[/dim] Generate a plan first with 'apollo-cli plan'")
        return

    client: SophiaClient = ctx.obj["client"]

    console.print(f"[bold]Executing step {step} of plan:[/bold] {plan_id}\n")

    response = client.execute_step(plan_id, step)

    if response.success and response.data:
        console.print(f"[green]✓[/green] Step {step} executed successfully\n")

        if isinstance(response.data, dict):
            # Display formatted response
            response_text = yaml.dump(
                response.data, default_flow_style=False, sort_keys=False
            )
            syntax = Syntax(response_text, "yaml", theme="monokai", line_numbers=False)
            panel = Panel(syntax, title="Execution Result", border_style="green")
            console.print(panel)
        else:
            console.print(response.data)
    else:
        console.print(f"[red]✗ Error:[/red] {response.error}")
        console.print(
            "\n[dim]Tip: Ensure Sophia service is running and the plan exists[/dim]"
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
    if not text:
        console.print("[yellow]Usage:[/yellow] apollo-cli embed '<text>'")
        console.print(
            "\n[dim]Example:[/dim] apollo-cli embed 'Navigate to the kitchen'"
        )
        console.print("\n[dim]Options:[/dim]")
        console.print("  --model <name>  Embedding model (default: default)")
        return

    hermes: HermesClient = ctx.obj["hermes"]

    console.print(f"[bold]Generating embedding for:[/bold] {text}\n")
    console.print(f"[dim]Model: {model}[/dim]\n")

    response = hermes.embed_text(text, model=model)

    if response.success and response.data:
        console.print("[green]✓[/green] Embedding generated successfully\n")

        if isinstance(response.data, dict):
            # Display formatted response (truncate embedding vector for readability)
            display_data = response.data.copy()
            if "embedding" in display_data and isinstance(
                display_data["embedding"], list
            ):
                embedding = display_data["embedding"]
                if len(embedding) > 10:
                    display_data["embedding"] = embedding[:5] + ["..."] + embedding[-5:]
                    display_data[
                        "_note"
                    ] = f"Full embedding has {len(embedding)} dimensions"

            response_text = yaml.dump(
                display_data, default_flow_style=False, sort_keys=False
            )
            syntax = Syntax(response_text, "yaml", theme="monokai", line_numbers=False)
            panel = Panel(syntax, title="Embedding Result", border_style="green")
            console.print(panel)
        else:
            console.print(response.data)
    else:
        console.print(f"[red]✗ Error:[/red] {response.error}")
        console.print(
            "\n[dim]Tip: Ensure Hermes service is running and accessible[/dim]"
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

    if not prompt:
        prompt = click.prompt("Enter your prompt")

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
        system_prompt = f"{system_prompt}\n\nPersona diary context:\n{persona_block}"

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
        console.print("[red]✗ Hermes request failed[/red]")
        console.print(
            response.error
            or "Hermes did not return a completion response. Check the service logs."
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


def main() -> None:
    """Entry point for the CLI."""
    cli()


if __name__ == "__main__":
    main()
