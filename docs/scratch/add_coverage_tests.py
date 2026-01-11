#!/usr/bin/env python3
"""Batch script to add missing coverage tests for P0 fixes."""
import os

# Read current test file
test_file = "/home/fearsidhe/projects/LOGOS/apollo/tests/unit/test_p0_fixes.py"
with open(test_file, "r") as f:
    content = f.read()

# New tests to add for None datetime branches and injection patterns
new_tests = '''
    def test_entity_handles_none_updated_at(self):
        """Verify Entity handles None updated_at (covers return None branch)."""
        from apollo.data.models import Entity

        entity = Entity(
            id="test",
            type="goal",
            properties={},
            labels=[],
            created_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
            updated_at=None,  # Optional field set to None
        )
        assert entity.updated_at is None

    def test_process_handles_none_completed_at(self):
        """Verify Process handles None completed_at (covers return None branch)."""
        from apollo.data.models import Process

        process = Process(
            id="test",
            type="process",
            name="test",
            status="pending",
            inputs=[],
            outputs=[],
            properties={},
            created_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
            completed_at=None,  # Optional field set to None
        )
        assert process.completed_at is None

    def test_plan_history_handles_none_optional_datetimes(self):
        """Verify PlanHistory handles None optional datetimes."""
        from apollo.data.models import PlanHistory

        plan = PlanHistory(
            id="test",
            goal_id="goal1",
            status="pending",
            steps=[],
            created_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
            started_at=None,
            completed_at=None,
        )
        assert plan.started_at is None
        assert plan.completed_at is None

    def test_state_history_handles_none_optional_fields(self):
        """Verify StateHistory handles optional None fields."""
        from apollo.data.models import StateHistory

        history = StateHistory(
            id="test",
            state_id="state1",
            timestamp=datetime(2024, 1, 1, tzinfo=timezone.utc),
            changes={},
            previous_values=None,
            trigger=None,
        )
        assert history.previous_values is None


class TestNeo4jInputValidationEdgeCases:
    """Additional edge case tests for input validation coverage."""

    def test_entity_id_rejects_match_keyword(self):
        """Verify MATCH keyword injection is blocked."""
        from apollo.data.hcg_client import validate_entity_id

        with pytest.raises(ValueError, match="suspicious pattern"):
            validate_entity_id("test MATCH (n) RETURN n")

    def test_entity_id_rejects_delete_keyword(self):
        """Verify DELETE keyword injection is blocked."""
        from apollo.data.hcg_client import validate_entity_id

        with pytest.raises(ValueError, match="suspicious pattern"):
            validate_entity_id("test DELETE n")

    def test_entity_id_rejects_create_keyword(self):
        """Verify CREATE keyword injection is blocked."""
        from apollo.data.hcg_client import validate_entity_id

        with pytest.raises(ValueError, match="suspicious pattern"):
            validate_entity_id("test CREATE (n)")

    def test_entity_id_rejects_set_keyword(self):
        """Verify SET keyword injection is blocked."""
        from apollo.data.hcg_client import validate_entity_id

        with pytest.raises(ValueError, match="suspicious pattern"):
            validate_entity_id("test SET n.prop = 'value'")

    def test_entity_id_rejects_merge_keyword(self):
        """Verify MERGE keyword injection is blocked."""
        from apollo.data.hcg_client import validate_entity_id

        with pytest.raises(ValueError, match="suspicious pattern"):
            validate_entity_id("test MERGE (n)")

    def test_entity_id_rejects_call_keyword(self):
        """Verify CALL keyword injection is blocked."""
        from apollo.data.hcg_client import validate_entity_id

        with pytest.raises(ValueError, match="suspicious pattern"):
            validate_entity_id("test CALL db.info()")

'''

# Find the location to insert (before TestWebSocketBroadcastLock or at end of UTC tests)
# Insert after the existing timezone preservation tests
insert_marker = "class TestWebSocketBroadcastLock:"
if insert_marker in content:
    content = content.replace(insert_marker, new_tests + "\n" + insert_marker)
    with open(test_file, "w") as f:
        f.write(content)
    print(f"Added new coverage tests before {insert_marker}")
    print("New tests added:")
    print("- test_entity_handles_none_updated_at")
    print("- test_process_handles_none_completed_at")
    print("- test_plan_history_handles_none_optional_datetimes")
    print("- test_state_history_handles_none_optional_fields")
    print("- TestNeo4jInputValidationEdgeCases class (6 tests)")
else:
    print(f"ERROR: Could not find marker '{insert_marker}'")
