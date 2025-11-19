"""Mock Sophia service for E2E testing.

This mock service simulates:
- Sophia cognitive core receiving commands
- Plan generation and execution
- Talos shim interaction (simulated)
- HCG state updates in Neo4j
"""

import os
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from neo4j import GraphDatabase

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Neo4j configuration
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "testpassword")

# Initialize Neo4j driver
driver = None


def get_neo4j_driver():
    """Get or create Neo4j driver."""
    global driver
    if driver is None:
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    return driver


def execute_cypher(query, parameters=None):
    """Execute a Cypher query."""
    with get_neo4j_driver().session() as session:
        result = session.run(query, parameters or {})
        return [record.data() for record in result]


@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint."""
    try:
        # Check Neo4j connection
        get_neo4j_driver().verify_connectivity()
        return jsonify({"status": "healthy", "neo4j": "connected"}), 200
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({"status": "unhealthy", "error": str(e)}), 503


@app.route("/api/state", methods=["GET"])
def get_state():
    """Get current agent state from HCG."""
    try:
        # Query current agent state from Neo4j
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
        
        if result:
            state_data = result[0]
            return jsonify({
                "agent_id": state_data.get("agent_id", "agent-1"),
                "status": state_data.get("status", "idle"),
                "grasped_object": state_data.get("grasped_object"),
                "position": {
                    "x": state_data.get("x", 0.0),
                    "y": state_data.get("y", 0.0),
                    "z": state_data.get("z", 0.0)
                } if state_data.get("x") is not None else None,
                "timestamp": datetime.utcnow().isoformat()
            }), 200
        else:
            # Return default state if no agent found
            return jsonify({
                "agent_id": "agent-1",
                "status": "idle",
                "grasped_object": None,
                "position": None,
                "timestamp": datetime.utcnow().isoformat()
            }), 200
            
    except Exception as e:
        logger.error(f"Failed to get state: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/command", methods=["POST"])
def send_command():
    """Process a command and generate/execute a plan."""
    try:
        data = request.get_json()
        command = data.get("command", "")
        
        logger.info(f"Received command: {command}")
        
        # Parse command for pick-and-place operations
        if "pick" in command.lower() and "place" in command.lower():
            # Extract object name (simple parsing for demo)
            parts = command.lower().split()
            obj_name = "red_block"  # Default object
            for i, word in enumerate(parts):
                if word in ["the", "a"]:
                    if i + 1 < len(parts):
                        obj_name = parts[i + 1]
                        if i + 2 < len(parts):
                            obj_name += "_" + parts[i + 2]
                        break
            
            # Generate plan
            plan_id = f"plan-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
            plan = {
                "plan_id": plan_id,
                "goal": command,
                "status": "executing",
                "steps": [
                    {
                        "step": 1,
                        "action": "move_to_object",
                        "target": obj_name,
                        "status": "completed"
                    },
                    {
                        "step": 2,
                        "action": "grasp",
                        "target": obj_name,
                        "status": "completed"
                    },
                    {
                        "step": 3,
                        "action": "move_to_position",
                        "target_position": {"x": 1.0, "y": 1.0, "z": 0.5},
                        "status": "completed"
                    },
                    {
                        "step": 4,
                        "action": "release",
                        "status": "completed"
                    }
                ],
                "created_at": datetime.utcnow().isoformat()
            }
            
            # Store plan in Neo4j
            store_plan_query = """
            CREATE (p:Plan {
                id: $plan_id,
                goal: $goal,
                status: $status,
                created_at: $created_at
            })
            RETURN p
            """
            execute_cypher(store_plan_query, {
                "plan_id": plan_id,
                "goal": command,
                "status": "completed",
                "created_at": plan["created_at"]
            })
            
            # Simulate Talos shim execution - update agent state
            # 1. Update agent to be grasping the object
            update_grasp_query = """
            MATCH (agent:Agent {id: 'agent-1'})
            MERGE (obj:Object {name: $obj_name})
            MERGE (agent)-[:GRASPING]->(obj)
            SET agent.last_updated = $timestamp
            """
            execute_cypher(update_grasp_query, {
                "obj_name": obj_name,
                "timestamp": datetime.utcnow().isoformat()
            })
            
            # 2. Update agent position - first delete old, then create new
            # Delete old position
            delete_old_pos_query = """
            MATCH (agent:Agent {id: 'agent-1'})-[r:AT_POSITION]->(old_pos:Position)
            DETACH DELETE old_pos
            """
            execute_cypher(delete_old_pos_query, {})
            
            # Create new position
            create_new_pos_query = """
            MATCH (agent:Agent {id: 'agent-1'})
            CREATE (pos:Position {x: $x, y: $y, z: $z})
            CREATE (agent)-[:AT_POSITION]->(pos)
            SET agent.last_updated = $timestamp
            """
            execute_cypher(create_new_pos_query, {
                "x": 1.0,
                "y": 1.0,
                "z": 0.5,
                "timestamp": datetime.utcnow().isoformat()
            })
            
            # 3. Update state - first delete old, then create new
            # Delete old state
            delete_old_state_query = """
            MATCH (agent:Agent {id: 'agent-1'})-[r:HAS_STATE]->(old_state:State)
            DETACH DELETE old_state
            """
            execute_cypher(delete_old_state_query, {})
            
            # Create new state
            create_new_state_query = """
            MATCH (agent:Agent {id: 'agent-1'})
            CREATE (state:State {status: $status})
            CREATE (agent)-[:HAS_STATE]->(state)
            SET agent.last_updated = $timestamp
            """
            execute_cypher(create_new_state_query, {
                "status": "completed",
                "timestamp": datetime.utcnow().isoformat()
            })
            
            logger.info(f"Plan {plan_id} executed, HCG state updated")
            
            return jsonify({
                "success": True,
                "plan": plan,
                "message": "Plan generated and executed via Talos shim"
            }), 200
        else:
            return jsonify({
                "success": False,
                "error": "Unsupported command type. This mock only supports pick-and-place."
            }), 400
            
    except Exception as e:
        logger.error(f"Failed to process command: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/plans", methods=["GET"])
def get_plans():
    """Get recent plans from HCG."""
    try:
        limit = request.args.get("limit", 10, type=int)
        
        # Query plans from Neo4j
        query = """
        MATCH (p:Plan)
        RETURN p.id as id, p.goal as goal, p.status as status, p.created_at as created_at
        ORDER BY p.created_at DESC
        LIMIT $limit
        """
        result = execute_cypher(query, {"limit": limit})
        
        plans = [
            {
                "id": record["id"],
                "goal": record["goal"],
                "status": record["status"],
                "created_at": record["created_at"]
            }
            for record in result
        ]
        
        return jsonify({"plans": plans}), 200
        
    except Exception as e:
        logger.error(f"Failed to get plans: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    logger.info("Starting Sophia mock service...")
    logger.info(f"Neo4j URI: {NEO4J_URI}")
    app.run(host="0.0.0.0", port=8080, debug=False)
