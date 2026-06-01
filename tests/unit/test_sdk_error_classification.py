"""Transport-error classification in execute_*_call (apollo#171).

A read timeout (service reachable but slow to respond — e.g. a long LLM
generation) must be reported distinctly from a connection failure, instead of
both collapsing into "Cannot reach Hermes".
"""

from types import SimpleNamespace

from urllib3.exceptions import MaxRetryError, ReadTimeoutError

from apollo.sdk import execute_hermes_call, execute_sophia_call


def _sdk():
    return SimpleNamespace(base_url="http://hermes:17000", timeout=30)


def _raises(exc):
    def _op():
        raise exc

    return _op


def _read_timeout():
    return ReadTimeoutError(None, "/llm", "Read timed out.")


def test_hermes_read_timeout_reported_as_timeout():
    ok, data, err = execute_hermes_call(
        _sdk(), "generating a reply", _raises(_read_timeout())
    )
    assert ok is False
    assert data is None
    assert "timed out after 30s" in err
    assert "Cannot reach Hermes" not in err


def test_hermes_read_timeout_wrapped_in_maxretry_reported_as_timeout():
    # urllib3 wraps the real cause inside MaxRetryError.reason
    wrapped = MaxRetryError(None, "/llm", reason=_read_timeout())
    _, _, err = execute_hermes_call(_sdk(), "generating a reply", _raises(wrapped))
    assert "timed out after 30s" in err
    assert "Cannot reach Hermes" not in err


def test_hermes_connection_failure_reported_as_unreachable():
    _, _, err = execute_hermes_call(
        _sdk(),
        "generating a reply",
        _raises(ConnectionError("Connection refused")),
    )
    assert "Cannot reach Hermes" in err
    assert "timed out" not in err


def test_sophia_read_timeout_reported_as_timeout():
    _, _, err = execute_sophia_call(_sdk(), "planning", _raises(_read_timeout()))
    assert "timed out after 30s" in err
    assert "Cannot connect to Sophia" not in err


def test_sophia_connection_failure_reported_as_unreachable():
    _, _, err = execute_sophia_call(
        _sdk(), "planning", _raises(ConnectionError("Connection refused"))
    )
    assert "Cannot connect to Sophia" in err
    assert "timed out" not in err
