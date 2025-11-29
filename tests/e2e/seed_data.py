#!/usr/bin/env python3
"""Seed data script for E2E test environment.

This script populates Neo4j with initial state for testing:
- Agent entity with initial position
- Object entities (blocks, tools, etc.)
- Initial state nodes
"""

import os
import sys
import time
import logging
from neo4j import GraphDatabase

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Neo4j configuration
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:27687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "neo4jtest")


def wait_for_neo4j(max_retries=30, delay=2):
    """Wait for Neo4j to be ready."""
    logger.info("Waiting for Neo4j to be ready...")

    for attempt in range(max_retries):
        try:
            driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
            driver.verify_connectivity()
            driver.close()
            logger.info("Neo4j is ready!")
            return True
        except Exception as e:
            if attempt < max_retries - 1:
                logger.info(
                    f"Attempt {attempt + 1}/{max_retries}: Neo4j not ready yet, waiting..."
                )
                time.sleep(delay)
            else:
                logger.error(
                    f"Failed to connect to Neo4j after {max_retries} attempts: {e}"
                )
                return False
    return False


def seed_data():
    """Seed initial data into Neo4j."""
    logger.info("Starting data seeding...")

    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

    try:
        with driver.session() as session:
            # Clear existing data
            logger.info("Clearing existing data...")
            session.run("MATCH (n) DETACH DELETE n")

            # Create agent
            logger.info("Creating agent entity...")
            session.run(
                """
                CREATE (agent:Agent {
                    id: 'agent-1',
                    name: 'LOGOS Agent',
                    created_at: datetime()
                })
            """
            )

            # Create initial position
            logger.info("Creating initial position...")
            session.run(
                """
                MATCH (agent:Agent {id: 'agent-1'})
                CREATE (pos:Position {
                    x: 0.0,
                    y: 0.0,
                    z: 0.0
                })
                CREATE (agent)-[:AT_POSITION]->(pos)
            """
            )

            # Create initial state
            logger.info("Creating initial state...")
            session.run(
                """
                MATCH (agent:Agent {id: 'agent-1'})
                CREATE (state:State {
                    status: 'idle',
                    created_at: datetime()
                })
                CREATE (agent)-[:HAS_STATE]->(state)
            """
            )

            # Create test objects
            logger.info("Creating test objects...")
            objects = [
                {
                    "name": "red_block",
                    "color": "red",
                    "type": "block",
                    "x": 0.5,
                    "y": 0.5,
                    "z": 0.0,
                },
                {
                    "name": "blue_block",
                    "color": "blue",
                    "type": "block",
                    "x": 0.7,
                    "y": 0.3,
                    "z": 0.0,
                },
                {
                    "name": "green_cube",
                    "color": "green",
                    "type": "cube",
                    "x": 0.3,
                    "y": 0.7,
                    "z": 0.0,
                },
            ]

            for obj in objects:
                session.run(
                    """
                    CREATE (obj:Object {
                        name: $name,
                        color: $color,
                        type: $type,
                        position_x: $x,
                        position_y: $y,
                        position_z: $z,
                        created_at: datetime()
                    })
                """,
                    obj,
                )
                logger.info(f"  - Created object: {obj['name']}")

            # Create workspace
            logger.info("Creating workspace...")
            session.run(
                """
                CREATE (workspace:Workspace {
                    name: 'main_workspace',
                    width: 2.0,
                    height: 2.0,
                    created_at: datetime()
                })
            """
            )

            # Link objects to workspace
            logger.info("Linking objects to workspace...")
            session.run(
                """
                MATCH (obj:Object), (workspace:Workspace {name: 'main_workspace'})
                CREATE (workspace)-[:CONTAINS]->(obj)
            """
            )

            # Verify data
            result = session.run(
                """
                MATCH (n)
                RETURN labels(n)[0] as label, count(*) as count
                ORDER BY label
            """
            )

            logger.info("Data seeding complete! Summary:")
            for record in result:
                logger.info(f"  - {record['label']}: {record['count']} node(s)")

    except Exception as e:
        logger.error(f"Failed to seed data: {e}")
        sys.exit(1)
    finally:
        driver.close()


if __name__ == "__main__":
    if not wait_for_neo4j():
        logger.error("Cannot proceed without Neo4j connection")
        sys.exit(1)

    seed_data()
    logger.info("Seed data script completed successfully!")
