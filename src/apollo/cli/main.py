"""Apollo CLI - Command-line interface for Project LOGOS."""

from pathlib import Path
from typing import Any, Optional

import click
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.syntax import Syntax
import yaml

from apollo.client.sophia_client import SophiaClient
from apollo.client.hermes_client import HermesClient
from apollo.client.persona_client import PersonaClient
from apollo.config.settings import ApolloConfig

console = Console()


@click.group()
@click.version_option(version="0.1.0", prog_name="apollo-cli")
@click.option(
    "--config",
    type=click.Path(exists=True, path_type=Path),
    help="Path to config file (default: config.yaml or defaults)",
)
@click.pass_context
def cli(ctx: click.Context, config: Optional[Path]) -> None:
    """Apollo CLI - Command interface for Project LOGOS.

    Apollo provides a command-line interface for interacting with
    Sophia (the cognitive core), visualizing agent state, and
    monitoring plan execution.
    """
    # Load configuration and store in context
    ctx.ensure_object(dict)
    ctx.obj["config"] = ApolloConfig.load(config)
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
            "  [yellow]✗[/yellow] Cannot connect to Sophia " f"at {client.base_url}"
        )
        console.print(
            "\n[dim]Tip: Make sure Sophia service is running "
            "or check your config[/dim]"
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
                    display_data["_note"] = (
                        f"Full embedding has {len(embedding)} dimensions"
                    )

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


def main() -> None:
    """Entry point for the CLI."""
    cli()


if __name__ == "__main__":
    main()
