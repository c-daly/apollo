"""Mock Sophia service for E2E testing aligned with Phase 2 endpoints.

This mock simulates:
- `/plan` requests processed through the shared SDK contract
- `/state` responses using the CWM state envelope
- `/simulate` responses for JEPA-style imagination
- Backwards-compatible Phase 1 endpoints under `/api/*`
"""

import logging
import os
from datetime import datetime
from uuid import uuid4

from flask import Flask, jsonify, request
from neo4j import GraphDatabase

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "neo4jtest")

driver = None


def get_driver():
    global driver
    if driver is None:
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    return driver


def execute_cypher(query: str, parameters=None):
    with get_driver().session() as session:
        result = session.run(query, parameters or {})
        return [record.data() for record in result]


def fetch_agent_snapshot():
    query = """
    MATCH (agent:Agent)
    OPTIONAL MATCH (agent)-[:HAS_STATE]->(state:State)
    OPTIONAL MATCH (agent)-[:GRASPING]->(obj:Object)
    OPTIONAL MATCH (agent)-[:AT_POSITION]->(pos:Position)
    RETURN agent.id as agent_id,
           state.status as status,
           obj.name as grasped_object,
           pos.x as x, pos.y as y, pos.z as z
    LIMIT 1
    """
    result = execute_cypher(query)
    if not result:
        return {
            "agent_id": "agent-1",
            "status": "idle",
            "grasped_object": None,
            "position": None,
        }

    record = result[0]
    position = None
    if record.get("x") is not None:
        position = {
            "x": record.get("x", 0.0),
            "y": record.get("y", 0.0),
            "z": record.get("z", 0.0),
        }
    return {
        "agent_id": record.get("agent_id", "agent-1"),
        "status": record.get("status", "idle"),
        "grasped_object": record.get("grasped_object"),
        "position": position,
    }


def get_latest_plan_id():
    query = """
    MATCH (p:Plan)
    RETURN p.id as id
    ORDER BY p.created_at DESC
    LIMIT 1
    """
    result = execute_cypher(query)
    if result:
        return result[0].get("id")
    return None


def build_cwm_state(plan_id=None):
    snapshot = fetch_agent_snapshot()
    state_id = f"cwm_state_{uuid4().hex}"
    linked_plan = plan_id or get_latest_plan_id()
    agent_entity = {
        "id": snapshot.get("agent_id", "agent-1"),
        "type": "Agent",
        "status": snapshot.get("status", "idle"),
        "position": snapshot.get("position"),
        "grasped_object": snapshot.get("grasped_object"),
    }
    cwm_data = {
        "entities": [agent_entity],
        "relations": [],
        "violations": [],
        "validation": {"status": "passed", "message": None},
    }

    return {
        "states": [
            {
                "state_id": state_id,
                "model_type": "CWM_A",
                "status": snapshot.get("status", "idle"),
                "timestamp": datetime.utcnow().isoformat(),
                "confidence": 0.9,
                "links": {
                    "entity_ids": ["agent-1"],
                    "plan_id": linked_plan,
                    "process_ids": ["talos_shim_pick_and_place"],
                    "persona_entry_id": None,
                    "media_sample_id": None,
                },
                "data": cwm_data,
            }
        ]
    }


def perform_pick_and_place(goal: str):
    parts = goal.lower().split()
    obj_name = "red_block"
    for i, word in enumerate(parts):
        if word in ["the", "a"] and i + 1 < len(parts):
            obj_name = parts[i + 1]
            if i + 2 < len(parts):
                obj_name += "_" + parts[i + 2]
            break

    plan_id = f"plan-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    plan = {
        "plan_id": plan_id,
        "goal": goal,
        "status": "completed",
        "steps": [
            {
                "step": 1,
                "action": "move_to_object",
                "target": obj_name,
                "status": "completed",
            },
            {"step": 2, "action": "grasp", "target": obj_name, "status": "completed"},
            {
                "step": 3,
                "action": "move_to_position",
                "target_position": {"x": 1.0, "y": 1.0, "z": 0.5},
                "status": "completed",
            },
            {"step": 4, "action": "release", "status": "completed"},
        ],
        "created_at": datetime.utcnow().isoformat(),
    }

    execute_cypher(
        """
        CREATE (p:Plan {
            id: $plan_id,
            goal: $goal,
            status: $status,
            created_at: $created_at
        })
        """,
        {
            "plan_id": plan_id,
            "goal": goal,
            "status": "completed",
            "created_at": plan["created_at"],
        },
    )

    execute_cypher(
        """
        MATCH (agent:Agent {id: 'agent-1'})
        MERGE (obj:Object {name: $obj_name})
        MERGE (agent)-[:GRASPING]->(obj)
        SET agent.last_updated = $timestamp
        """,
        {"obj_name": obj_name, "timestamp": datetime.utcnow().isoformat()},
    )

    execute_cypher(
        """
        MATCH (agent:Agent {id: 'agent-1'})-[r:AT_POSITION]->(old_pos:Position)
        DETACH DELETE old_pos
        """,
        {},
    )

    execute_cypher(
        """
        MATCH (agent:Agent {id: 'agent-1'})
        CREATE (pos:Position {x: $x, y: $y, z: $z})
        CREATE (agent)-[:AT_POSITION]->(pos)
        SET agent.last_updated = $timestamp
        """,
        {
            "x": 1.0,
            "y": 1.0,
            "z": 0.5,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )

    execute_cypher(
        """
        MATCH (agent:Agent {id: 'agent-1'})-[r:HAS_STATE]->(old_state:State)
        DETACH DELETE old_state
        """,
        {},
    )

    execute_cypher(
        """
        MATCH (agent:Agent {id: 'agent-1'})
        CREATE (state:State {status: $status})
        CREATE (agent)-[:HAS_STATE]->(state)
        SET agent.last_updated = $timestamp
        """,
        {"status": "completed", "timestamp": datetime.utcnow().isoformat()},
    )

    logger.info(f"Plan {plan_id} executed, HCG state updated")
    return plan, build_cwm_state(plan_id)


@app.route("/health", methods=["GET"])
def health_check():
    try:
        get_driver().verify_connectivity()
        return jsonify({"status": "healthy"}), 200
    except Exception as exc:
        logger.error(f"Health check failed: {exc}")
        return jsonify({"status": "unhealthy", "error": str(exc)}), 503


@app.route("/plan", methods=["POST"])
def create_plan():
    try:
        data = request.get_json() or {}
        goal = data.get("goal")
        if not goal:
            return jsonify({"error": "goal is required"}), 422

        if "pick" not in goal.lower() or "place" not in goal.lower():
            return jsonify({"error": "Mock only handles pick-and-place goals"}), 400

        plan, cwm_state = perform_pick_and_place(goal)
        latest_state = cwm_state["states"][0]
        return (
            jsonify(
                {
                    "plan": plan,
                    "plan_id": plan["plan_id"],
                    "status": plan["status"],
                    "steps": plan["steps"],
                    "created_at": plan["created_at"],
                    "metadata": {"goal": goal},
                    "links": {
                        "state_id": latest_state["state_id"],
                        "plan_id": plan["plan_id"],
                    },
                    "state": latest_state,
                }
            ),
            200,
        )
    except Exception as exc:
        logger.error(f"Failed to create plan: {exc}")
        return jsonify({"error": str(exc)}), 500


@app.route("/state", methods=["GET"])
def get_state():
    try:
        return jsonify(build_cwm_state()), 200
    except Exception as exc:
        logger.error(f"Failed to fetch state: {exc}")
        return jsonify({"error": str(exc)}), 500


@app.route("/simulate", methods=["POST"])
def simulate():
    try:
        data = request.get_json() or {}
        capability_id = data.get("capability_id", "unknown-capability")
        horizon = data.get("horizon_steps", 4)
        cwm_state = build_cwm_state(capability_id)
        return (
            jsonify(
                {
                    "capability_id": capability_id,
                    "horizon_steps": horizon,
                    "imagined": True,
                    "states": cwm_state["states"],
                }
            ),
            200,
        )
    except Exception as exc:
        logger.error(f"Failed to simulate plan: {exc}")
        return jsonify({"error": str(exc)}), 500


@app.route("/api/state", methods=["GET"])
def legacy_state():
    snapshot = fetch_agent_snapshot()
    payload = {
        "agent_id": snapshot.get("agent_id"),
        "status": snapshot.get("status"),
        "grasped_object": snapshot.get("grasped_object"),
        "position": snapshot.get("position"),
        "timestamp": datetime.utcnow().isoformat(),
    }
    return jsonify(payload), 200


@app.route("/api/command", methods=["POST"])
def legacy_command():
    data = request.get_json() or {}
    command = data.get("command", "")
    if "pick" in command.lower() and "place" in command.lower():
        plan, _ = perform_pick_and_place(command)
        return (
            jsonify(
                {
                    "success": True,
                    "plan": plan,
                    "message": "Plan generated and executed via Talos shim",
                }
            ),
            200,
        )
    return (
        jsonify(
            {
                "success": False,
                "error": "Unsupported command type. This mock only supports pick-and-place.",
            }
        ),
        400,
    )


@app.route("/api/plans", methods=["GET"])
def legacy_plans():
    try:
        limit = request.args.get("limit", 10, type=int)
        plans = execute_cypher(
            """
            MATCH (p:Plan)
            RETURN p.id as id, p.goal as goal, p.status as status, p.created_at as created_at
            ORDER BY p.created_at DESC
            LIMIT $limit
            """,
            {"limit": limit},
        )
        return jsonify({"plans": plans}), 200
    except Exception as exc:
        logger.error(f"Failed to fetch plans: {exc}")
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    logger.info("Starting Sophia mock service...")
    logger.info(f"Neo4j URI: {NEO4J_URI}")
    app.run(host="0.0.0.0", port=8080, debug=False)
