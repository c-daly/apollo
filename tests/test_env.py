"""Tests for the apollo.env module."""

from pathlib import Path

from apollo.env import (
    get_env_value,
    get_milvus_config,
    get_neo4j_config,
    get_repo_root,
    get_sophia_config,
    load_stack_env,
)


class TestGetEnvValue:
    """Tests for get_env_value function."""

    def test_returns_os_env_var(self, monkeypatch):
        """OS environment takes precedence."""
        monkeypatch.setenv("TEST_VAR", "from_os")
        result = get_env_value("TEST_VAR", {"TEST_VAR": "from_mapping"}, "default")
        assert result == "from_os"

    def test_returns_mapping_value_when_no_os_env(self, monkeypatch):
        """Falls back to provided mapping when not in OS env."""
        monkeypatch.delenv("TEST_VAR", raising=False)
        result = get_env_value("TEST_VAR", {"TEST_VAR": "from_mapping"}, "default")
        assert result == "from_mapping"

    def test_returns_default_when_not_found(self, monkeypatch):
        """Returns default when not found anywhere."""
        monkeypatch.delenv("MISSING_VAR", raising=False)
        result = get_env_value("MISSING_VAR", {}, "default_value")
        assert result == "default_value"

    def test_returns_none_when_no_default(self, monkeypatch):
        """Returns None when not found and no default."""
        monkeypatch.delenv("MISSING_VAR", raising=False)
        result = get_env_value("MISSING_VAR")
        assert result is None


class TestGetRepoRoot:
    """Tests for get_repo_root function."""

    def test_returns_path_object(self):
        """get_repo_root returns a Path object."""
        root = get_repo_root()
        assert isinstance(root, Path)

    def test_root_contains_expected_files(self):
        """Repo root contains expected markers (pyproject.toml, src/)."""
        root = get_repo_root()
        assert (root / "pyproject.toml").exists()
        assert (root / "src").is_dir()

    def test_honors_apollo_repo_root_env_var(self, monkeypatch, tmp_path):
        """APOLLO_REPO_ROOT env var overrides default resolution."""
        # Clear any cached value
        load_stack_env.cache_clear()

        # Create a temporary directory to simulate a relocated repo
        fake_root = tmp_path / "relocated_apollo"
        fake_root.mkdir()

        monkeypatch.setenv("APOLLO_REPO_ROOT", str(fake_root))
        result = get_repo_root()
        assert result == fake_root

        # Clean up
        monkeypatch.delenv("APOLLO_REPO_ROOT")

    def test_ignores_nonexistent_apollo_repo_root(self, monkeypatch):
        """APOLLO_REPO_ROOT is ignored if path doesn't exist."""
        monkeypatch.setenv("APOLLO_REPO_ROOT", "/nonexistent/path/to/apollo")
        result = get_repo_root()
        # Should fall back to default resolution
        assert (result / "pyproject.toml").exists()

        # Clean up
        monkeypatch.delenv("APOLLO_REPO_ROOT")

    def test_honors_github_workspace(self, monkeypatch, tmp_path):
        """GITHUB_WORKSPACE is used in CI environments."""
        # Clear APOLLO_REPO_ROOT to test GITHUB_WORKSPACE fallback
        monkeypatch.delenv("APOLLO_REPO_ROOT", raising=False)

        fake_workspace = tmp_path / "github_workspace"
        fake_workspace.mkdir()

        monkeypatch.setenv("GITHUB_WORKSPACE", str(fake_workspace))
        result = get_repo_root()
        assert result == fake_workspace

        # Clean up
        monkeypatch.delenv("GITHUB_WORKSPACE")


class TestLoadStackEnv:
    """Tests for load_stack_env function."""

    def test_returns_dict(self):
        """load_stack_env returns a dictionary."""
        # Clear cache to ensure fresh load
        load_stack_env.cache_clear()
        result = load_stack_env()
        assert isinstance(result, dict)

    def test_parses_env_file(self, tmp_path):
        """Parses key=value pairs from .env file."""
        load_stack_env.cache_clear()
        env_file = tmp_path / ".env.test"
        env_file.write_text("FOO=bar\nBAZ=qux\n# comment\nEMPTY=\n")

        result = load_stack_env(env_file)
        assert result["FOO"] == "bar"
        assert result["BAZ"] == "qux"
        assert result["EMPTY"] == ""

    def test_strips_quotes(self, tmp_path):
        """Strips surrounding quotes from values."""
        load_stack_env.cache_clear()
        env_file = tmp_path / ".env.test"
        env_file.write_text("DOUBLE=\"double quoted\"\nSINGLE='single quoted'\n")

        result = load_stack_env(env_file)
        assert result["DOUBLE"] == "double quoted"
        assert result["SINGLE"] == "single quoted"

    def test_returns_empty_for_missing_file(self, tmp_path):
        """Returns empty dict for nonexistent file."""
        load_stack_env.cache_clear()
        result = load_stack_env(tmp_path / "nonexistent.env")
        assert result == {}


class TestServiceConfigs:
    """Tests for service configuration helpers."""

    def test_get_neo4j_config_defaults(self, monkeypatch):
        """get_neo4j_config returns sensible defaults."""
        # Clear env vars to test defaults
        monkeypatch.delenv("NEO4J_URI", raising=False)
        monkeypatch.delenv("NEO4J_USER", raising=False)
        monkeypatch.delenv("NEO4J_PASSWORD", raising=False)

        config = get_neo4j_config()
        assert config["uri"] == "bolt://localhost:27687"
        assert config["user"] == "neo4j"
        assert config["password"] == "neo4jtest"

    def test_get_neo4j_config_from_env(self, monkeypatch):
        """get_neo4j_config reads from environment."""
        monkeypatch.setenv("NEO4J_URI", "bolt://custom:7687")
        monkeypatch.setenv("NEO4J_USER", "custom_user")
        monkeypatch.setenv("NEO4J_PASSWORD", "custom_pass")

        config = get_neo4j_config()
        assert config["uri"] == "bolt://custom:7687"
        assert config["user"] == "custom_user"
        assert config["password"] == "custom_pass"

    def test_get_milvus_config_defaults(self, monkeypatch):
        """get_milvus_config returns sensible defaults."""
        monkeypatch.delenv("MILVUS_HOST", raising=False)
        monkeypatch.delenv("MILVUS_PORT", raising=False)
        monkeypatch.delenv("MILVUS_HEALTHCHECK", raising=False)

        config = get_milvus_config()
        assert config["host"] == "localhost"
        assert config["port"] == "29530"
        assert "healthz" in config["healthcheck"]

    def test_get_sophia_config_defaults(self, monkeypatch):
        """get_sophia_config returns sensible defaults."""
        monkeypatch.delenv("SOPHIA_HOST", raising=False)
        monkeypatch.delenv("SOPHIA_PORT", raising=False)

        config = get_sophia_config()
        assert config["host"] == "localhost"
        assert config["port"] == "28080"
        assert config["base_url"] == "http://localhost:28080"
