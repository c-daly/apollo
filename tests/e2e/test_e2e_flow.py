#!/usr/bin/env python3
"""E2E functional test for Apollo → Sophia → Talos → HCG flow.

This test validates the complete prototype flow:
1. Start compose and seed data
2. Use Apollo CLI to request pick-and-place plan
3. Sophia returns plan; Talos shim executes and updates HCG
4. Apollo reflects updated grasp/position
5. Neo4j shows state changes

Test scope covers Phase 1 gate c-daly/logos#163.
"""

import os
import sys
import time
import subprocess
import logging
import json
from pathlib import Path
from neo4j import GraphDatabase
from apollo.client.sophia_client import SophiaClient
from apollo.config.settings import SophiaConfig

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Test configuration
NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "testpassword"
SOPHIA_HOST = "localhost"
SOPHIA_PORT = 8080

# Paths
E2E_DIR = Path(__file__).parent
COMPOSE_FILE = E2E_DIR / "docker-compose.e2e.yml"


class E2ETestRunner:
    """E2E test runner for Apollo system."""
    
    def __init__(self):
        self.neo4j_driver = None
        self.sophia_client = None
        self.test_passed = True
        self.test_results = []
        
    def log_result(self, test_name: str, passed: bool, message: str = ""):
        """Log test result."""
        status = "✓ PASS" if passed else "✗ FAIL"
        logger.info(f"{status}: {test_name}")
        if message:
            logger.info(f"  {message}")
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "message": message
        })
        if not passed:
            self.test_passed = False
    
    def setup_environment(self):
        """Start docker-compose services."""
        logger.info("=" * 80)
        logger.info("STARTING E2E TEST ENVIRONMENT")
        logger.info("=" * 80)
        
        logger.info("Starting docker-compose services...")
        try:
            # Start services
            subprocess.run(
                ["docker", "compose", "-f", str(COMPOSE_FILE), "up", "-d"],
                check=True,
                capture_output=True,
                text=True
            )
            logger.info("Services started successfully")
            
            # Wait for services to be healthy
            logger.info("Waiting for services to be healthy...")
            max_wait = 60
            start_time = time.time()
            
            while time.time() - start_time < max_wait:
                try:
                    # Check Neo4j
                    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
                    driver.verify_connectivity()
                    driver.close()
                    
                    # Check Sophia
                    client = SophiaClient(SophiaConfig(host=SOPHIA_HOST, port=SOPHIA_PORT))
                    if client.health_check():
                        logger.info("All services are healthy!")
                        return True
                except Exception:
                    pass
                
                time.sleep(2)
            
            logger.error("Services did not become healthy in time")
            return False
            
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to start services: {e}")
            logger.error(f"stdout: {e.stdout}")
            logger.error(f"stderr: {e.stderr}")
            return False
    
    def seed_test_data(self):
        """Seed initial test data."""
        logger.info("\n" + "=" * 80)
        logger.info("SEEDING TEST DATA")
        logger.info("=" * 80)
        
        try:
            seed_script = E2E_DIR / "seed_data.py"
            env = os.environ.copy()
            env.update({
                "NEO4J_URI": NEO4J_URI,
                "NEO4J_USER": NEO4J_USER,
                "NEO4J_PASSWORD": NEO4J_PASSWORD
            })
            
            result = subprocess.run(
                [sys.executable, str(seed_script)],
                env=env,
                capture_output=True,
                text=True,
                check=True
            )
            
            logger.info("Test data seeded successfully")
            logger.info(result.stdout)
            return True
            
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to seed data: {e}")
            logger.error(f"stdout: {e.stdout}")
            logger.error(f"stderr: {e.stderr}")
            return False
    
    def verify_initial_state(self):
        """Verify initial state in Neo4j."""
        logger.info("\n" + "=" * 80)
        logger.info("TEST 1: VERIFY INITIAL STATE")
        logger.info("=" * 80)
        
        try:
            self.neo4j_driver = GraphDatabase.driver(
                NEO4J_URI, 
                auth=(NEO4J_USER, NEO4J_PASSWORD)
            )
            
            with self.neo4j_driver.session() as session:
                # Check agent exists
                result = session.run("MATCH (a:Agent {id: 'agent-1'}) RETURN a")
                agent = result.single()
                if agent:
                    self.log_result("Initial agent exists", True, "Agent 'agent-1' found in HCG")
                else:
                    self.log_result("Initial agent exists", False, "Agent not found")
                    return False
                
                # Check initial position
                result = session.run("""
                    MATCH (a:Agent {id: 'agent-1'})-[:AT_POSITION]->(p:Position)
                    RETURN p.x as x, p.y as y, p.z as z
                """)
                pos = result.single()
                if pos and pos['x'] == 0.0 and pos['y'] == 0.0 and pos['z'] == 0.0:
                    self.log_result("Initial position correct", True, f"Position: ({pos['x']}, {pos['y']}, {pos['z']})")
                else:
                    self.log_result("Initial position correct", False, "Position not at origin")
                    return False
                
                # Check test objects exist
                result = session.run("MATCH (o:Object) RETURN count(o) as count")
                count = result.single()['count']
                if count >= 3:
                    self.log_result("Test objects exist", True, f"{count} objects found")
                else:
                    self.log_result("Test objects exist", False, f"Only {count} objects found")
                    return False
                
                return True
                
        except Exception as e:
            logger.error(f"Failed to verify initial state: {e}")
            self.log_result("Initial state verification", False, str(e))
            return False
    
    def test_apollo_command(self):
        """Test Apollo CLI command to Sophia."""
        logger.info("\n" + "=" * 80)
        logger.info("TEST 2: APOLLO CLI → SOPHIA COMMAND")
        logger.info("=" * 80)
        
        try:
            # Initialize Sophia client
            self.sophia_client = SophiaClient(
                SophiaConfig(host=SOPHIA_HOST, port=SOPHIA_PORT)
            )
            
            # Send pick-and-place command
            command = "pick up the red block and place it at the target location"
            logger.info(f"Sending command: '{command}'")
            
            response = self.sophia_client.send_command(command)
            
            if response.success:
                self.log_result("Command sent successfully", True)
                
                # Verify response contains plan
                if response.data and 'plan' in response.data:
                    plan = response.data['plan']
                    logger.info(f"Plan generated: {plan['plan_id']}")
                    logger.info(f"Plan status: {plan['status']}")
                    logger.info(f"Plan steps: {len(plan['steps'])}")
                    
                    self.log_result("Plan generated", True, f"Plan ID: {plan['plan_id']}")
                    
                    # Verify plan has expected steps
                    expected_actions = ['move_to_object', 'grasp', 'move_to_position', 'release']
                    actual_actions = [step['action'] for step in plan['steps']]
                    
                    if actual_actions == expected_actions:
                        self.log_result("Plan steps correct", True, f"Steps: {actual_actions}")
                    else:
                        self.log_result("Plan steps correct", False, f"Expected {expected_actions}, got {actual_actions}")
                    
                    return True
                else:
                    self.log_result("Plan generated", False, "No plan in response")
                    return False
            else:
                self.log_result("Command sent successfully", False, response.error)
                return False
                
        except Exception as e:
            logger.error(f"Failed to test Apollo command: {e}")
            self.log_result("Apollo command test", False, str(e))
            return False
    
    def verify_state_updates(self):
        """Verify state updates in HCG after plan execution.
        
        Note: These are internal Neo4j consistency checks. The actual acceptance
        criteria (Apollo reflects updated state) is validated in Test 4.
        """
        logger.info("\n" + "=" * 80)
        logger.info("TEST 3: VERIFY HCG STATE UPDATES (TALOS SHIM EXECUTION)")
        logger.info("=" * 80)
        
        try:
            # Give a moment for state updates to propagate
            time.sleep(1)
            
            with self.neo4j_driver.session() as session:
                # Check agent is grasping object
                result = session.run("""
                    MATCH (a:Agent {id: 'agent-1'})-[:GRASPING]->(o:Object)
                    RETURN o.name as object_name
                """)
                grasp = result.single()
                
                if grasp:
                    obj_name = grasp['object_name']
                    self.log_result("Agent grasping object", True, f"Grasping: {obj_name}")
                else:
                    self.log_result("Agent grasping object", False, "No grasp relationship found")
                
                # Check agent position updated
                result = session.run("""
                    MATCH (a:Agent {id: 'agent-1'})-[:AT_POSITION]->(p:Position)
                    RETURN p.x as x, p.y as y, p.z as z
                """)
                pos = result.single()
                
                if pos and pos['x'] == 1.0 and pos['y'] == 1.0 and pos['z'] == 0.5:
                    self.log_result("Agent position updated", True, f"Position: ({pos['x']}, {pos['y']}, {pos['z']})")
                else:
                    self.log_result("Agent position updated", False, f"Position: ({pos['x']}, {pos['y']}, {pos['z']}) - Expected (1.0, 1.0, 0.5)")
                
                # Check state updated to completed
                result = session.run("""
                    MATCH (a:Agent {id: 'agent-1'})-[:HAS_STATE]->(s:State)
                    RETURN s.status as status
                """)
                state = result.single()
                
                if state and state['status'] == 'completed':
                    self.log_result("State updated to completed", True, f"Status: {state['status']}")
                else:
                    status = state['status'] if state else 'None'
                    self.log_result("State updated to completed", False, f"Status: {status}")
                
                # Check plan stored in HCG
                result = session.run("""
                    MATCH (p:Plan)
                    RETURN count(p) as count
                """)
                plan_count = result.single()['count']
                
                if plan_count > 0:
                    self.log_result("Plan stored in HCG", True, f"{plan_count} plan(s) found")
                else:
                    self.log_result("Plan stored in HCG", False, "No plans found")
                
                return True
                
        except Exception as e:
            logger.error(f"Failed to verify state updates: {e}")
            self.log_result("State update verification", False, str(e))
            return False
    
    def verify_apollo_reflects_state(self):
        """Verify Apollo can read updated state."""
        logger.info("\n" + "=" * 80)
        logger.info("TEST 4: APOLLO REFLECTS UPDATED STATE")
        logger.info("=" * 80)
        
        try:
            # Get state via Apollo client
            response = self.sophia_client.get_state()
            
            if response.success and response.data:
                state = response.data
                logger.info(f"Retrieved state via Apollo:")
                logger.info(f"  Agent ID: {state.get('agent_id')}")
                logger.info(f"  Status: {state.get('status')}")
                logger.info(f"  Grasped object: {state.get('grasped_object')}")
                logger.info(f"  Position: {state.get('position')}")
                
                # Verify state reflects updates
                if state.get('status') == 'completed':
                    self.log_result("Apollo reads completed status", True)
                else:
                    self.log_result("Apollo reads completed status", False, f"Status: {state.get('status')}")
                
                if state.get('grasped_object') == 'red_block':
                    self.log_result("Apollo reads grasped object", True, f"Object: {state.get('grasped_object')}")
                else:
                    self.log_result("Apollo reads grasped object", False, f"Object: {state.get('grasped_object')}")
                
                pos = state.get('position')
                if pos and pos['x'] == 1.0 and pos['y'] == 1.0 and pos['z'] == 0.5:
                    self.log_result("Apollo reads updated position", True, f"Position: ({pos['x']}, {pos['y']}, {pos['z']})")
                else:
                    self.log_result("Apollo reads updated position", False, f"Position: {pos}")
                
                return True
            else:
                self.log_result("Apollo state retrieval", False, response.error)
                return False
                
        except Exception as e:
            logger.error(f"Failed to verify Apollo reflects state: {e}")
            self.log_result("Apollo state reflection", False, str(e))
            return False
    
    def verify_plans_api(self):
        """Verify Apollo can retrieve plans."""
        logger.info("\n" + "=" * 80)
        logger.info("TEST 5: APOLLO RETRIEVES PLANS")
        logger.info("=" * 80)
        
        try:
            response = self.sophia_client.get_plans(limit=10)
            
            if response.success and response.data:
                plans = response.data.get('plans', [])
                logger.info(f"Retrieved {len(plans)} plan(s)")
                
                if len(plans) > 0:
                    self.log_result("Plans retrieved", True, f"{len(plans)} plan(s) found")
                    
                    # Log first plan details
                    if plans:
                        plan = plans[0]
                        logger.info(f"  Latest plan: {plan['id']}")
                        logger.info(f"  Goal: {plan['goal']}")
                        logger.info(f"  Status: {plan['status']}")
                    
                    return True
                else:
                    self.log_result("Plans retrieved", False, "No plans found")
                    return False
            else:
                self.log_result("Plans retrieval", False, response.error)
                return False
                
        except Exception as e:
            logger.error(f"Failed to verify plans API: {e}")
            self.log_result("Plans API verification", False, str(e))
            return False
    
    def cleanup(self):
        """Clean up test environment."""
        logger.info("\n" + "=" * 80)
        logger.info("CLEANING UP TEST ENVIRONMENT")
        logger.info("=" * 80)
        
        # Close Neo4j driver
        if self.neo4j_driver:
            self.neo4j_driver.close()
            logger.info("Neo4j driver closed")
        
        # Stop docker-compose services
        try:
            subprocess.run(
                ["docker", "compose", "-f", str(COMPOSE_FILE), "down", "-v"],
                check=True,
                capture_output=True,
                text=True
            )
            logger.info("Docker services stopped and cleaned up")
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to cleanup: {e}")
    
    def print_summary(self):
        """Print test summary."""
        logger.info("\n" + "=" * 80)
        logger.info("TEST SUMMARY")
        logger.info("=" * 80)
        
        passed = sum(1 for r in self.test_results if r['passed'])
        total = len(self.test_results)
        
        logger.info(f"Results: {passed}/{total} tests passed")
        logger.info("")
        
        for result in self.test_results:
            status = "✓" if result['passed'] else "✗"
            logger.info(f"{status} {result['test']}")
            if result['message']:
                logger.info(f"    {result['message']}")
        
        logger.info("")
        if self.test_passed:
            logger.info("=" * 80)
            logger.info("🎉 ALL TESTS PASSED!")
            logger.info("=" * 80)
        else:
            logger.info("=" * 80)
            logger.info("❌ SOME TESTS FAILED")
            logger.info("=" * 80)
    
    def run(self):
        """Run complete E2E test suite."""
        try:
            # Setup
            if not self.setup_environment():
                logger.error("Failed to setup environment")
                return False
            
            if not self.seed_test_data():
                logger.error("Failed to seed test data")
                return False
            
            # Run tests
            self.verify_initial_state()
            self.test_apollo_command()
            self.verify_state_updates()
            self.verify_apollo_reflects_state()
            self.verify_plans_api()
            
            # Summary
            self.print_summary()
            
            return self.test_passed
            
        except KeyboardInterrupt:
            logger.info("\nTest interrupted by user")
            return False
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return False
        finally:
            self.cleanup()


def main():
    """Main entry point."""
    logger.info("Starting Apollo E2E Functional Test")
    logger.info("Test scope: Apollo → Sophia → Talos shim → HCG state")
    logger.info("")
    
    runner = E2ETestRunner()
    success = runner.run()
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
