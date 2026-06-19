"""Unit tests for :class:`apollo.client.hcg_query_client.HCGQueryClient`.

The client is a thin HTTP wrapper around Sophia's ``/hcg/*`` read API. These
tests mock ``requests.get`` so they exercise the URL/params/header building,
the JSON shape coercion (dict-vs-list defaults), and the error-wrapping paths
without needing a live Sophia.
"""

from __future__ import annotations

from typing import Any, Dict, Optional
from unittest.mock import Mock, patch

import pytest
import requests

from apollo.client.hcg_query_client import (
    HCGQueryClient,
    HCGQueryError,
    _build_headers,
    _normalize_base_url,
)
from apollo.config.settings import SophiaConfig


def _client(api_key: Optional[str] = "tok") -> HCGQueryClient:
    config = SophiaConfig(host="localhost", port=47000, timeout=5, api_key=api_key)
    return HCGQueryClient(config)


def _mock_response(
    json_data: Any = None,
    *,
    status_code: int = 200,
    raise_json: bool = False,
    text: str = "",
) -> Mock:
    response = Mock()
    response.status_code = status_code
    response.text = text
    response.raise_for_status = Mock()
    if raise_json:
        response.json = Mock(side_effect=ValueError("no json"))
    else:
        response.json = Mock(return_value=json_data)
    return response


# --- helpers -------------------------------------------------------------


def test_normalize_base_url_from_host_port() -> None:
    assert _normalize_base_url("localhost", 47000) == "http://localhost:47000"


def test_normalize_base_url_honours_full_url() -> None:
    assert _normalize_base_url("https://sophia.example/", 1) == "https://sophia.example"


def test_build_headers_with_and_without_key() -> None:
    assert _build_headers("abc")["Authorization"] == "Bearer abc"
    assert "Authorization" not in _build_headers(None)
    assert "Authorization" not in _build_headers("")


def test_init_builds_base_url_and_headers() -> None:
    client = _client("secret")
    assert client.base_url == "http://localhost:47000"
    assert client.timeout == 5
    assert client._headers["Authorization"] == "Bearer secret"


# --- happy paths ---------------------------------------------------------


def test_stats_returns_dict() -> None:
    client = _client()
    payload: Dict[str, Any] = {"total_nodes": 10}
    with patch("apollo.client.hcg_query_client.requests.get") as get:
        get.return_value = _mock_response(payload)
        assert client.stats() == payload
        url = get.call_args.args[0]
        assert url == "http://localhost:47000/hcg/stats"
        assert get.call_args.kwargs["headers"]["Authorization"] == "Bearer tok"
        assert get.call_args.kwargs["timeout"] == 5


def test_stats_coerces_non_dict_to_empty() -> None:
    client = _client()
    with patch("apollo.client.hcg_query_client.requests.get") as get:
        get.return_value = _mock_response([1, 2, 3])
        assert client.stats() == {}


def test_types_returns_list_and_passes_limit() -> None:
    client = _client()
    with patch("apollo.client.hcg_query_client.requests.get") as get:
        get.return_value = _mock_response([{"name": "cell"}])
        assert client.types(limit=42) == [{"name": "cell"}]
        assert get.call_args.kwargs["params"] == {"limit": 42}


def test_types_coerces_non_list_to_empty() -> None:
    client = _client()
    with patch("apollo.client.hcg_query_client.requests.get") as get:
        get.return_value = _mock_response({"oops": True})
        assert client.types() == []


def test_neighborhood_builds_path_and_params() -> None:
    client = _client()
    with patch("apollo.client.hcg_query_client.requests.get") as get:
        get.return_value = _mock_response({"nodes": [], "edges": []})
        result = client.neighborhood("uuid-1", depth=2, limit=7)
        assert result == {"nodes": [], "edges": []}
        assert get.call_args.args[0].endswith("/hcg/neighborhood/uuid-1")
        assert get.call_args.kwargs["params"] == {"depth": 2, "limit": 7}


def test_neighborhood_coerces_non_dict_to_empty() -> None:
    client = _client()
    with patch("apollo.client.hcg_query_client.requests.get") as get:
        get.return_value = _mock_response("not-a-dict")
        assert client.neighborhood("u") == {}


def test_search_returns_list_and_passes_query() -> None:
    client = _client()
    with patch("apollo.client.hcg_query_client.requests.get") as get:
        get.return_value = _mock_response([{"uuid": "x"}])
        assert client.search("cell", limit=3) == [{"uuid": "x"}]
        assert get.call_args.kwargs["params"] == {"q": "cell", "limit": 3}
        assert get.call_args.args[0].endswith("/hcg/search")


def test_search_coerces_non_list_to_empty() -> None:
    client = _client()
    with patch("apollo.client.hcg_query_client.requests.get") as get:
        get.return_value = _mock_response({"oops": True})
        assert client.search("q") == []


def test_entity_builds_path() -> None:
    client = _client()
    with patch("apollo.client.hcg_query_client.requests.get") as get:
        get.return_value = _mock_response({"uuid": "e1", "name": "Cell"})
        result = client.entity("e1")
        assert result == {"uuid": "e1", "name": "Cell"}
        assert get.call_args.args[0].endswith("/hcg/entities/e1")


def test_entity_coerces_non_dict_to_empty() -> None:
    client = _client()
    with patch("apollo.client.hcg_query_client.requests.get") as get:
        get.return_value = _mock_response(["not", "a", "dict"])
        assert client.entity("e1") == {}


# --- error wrapping ------------------------------------------------------


def test_connection_error_wrapped() -> None:
    client = _client()
    with patch("apollo.client.hcg_query_client.requests.get") as get:
        get.side_effect = requests.ConnectionError("refused")
        with pytest.raises(HCGQueryError) as exc:
            client.stats()
        assert "Failed to reach Sophia HCG endpoint" in str(exc.value)


def test_http_error_wrapped_with_snippet() -> None:
    client = _client()
    response = _mock_response(text="boom detail")
    response.raise_for_status.side_effect = requests.HTTPError("500")
    response.status_code = 500
    with patch("apollo.client.hcg_query_client.requests.get") as get:
        get.return_value = response
        with pytest.raises(HCGQueryError) as exc:
            client.stats()
        message = str(exc.value)
        assert "failed with status 500" in message
        assert "boom detail" in message


def test_http_error_truncates_long_snippet() -> None:
    client = _client()
    response = _mock_response(text="x" * 500)
    response.raise_for_status.side_effect = requests.HTTPError("500")
    response.status_code = 500
    with patch("apollo.client.hcg_query_client.requests.get") as get:
        get.return_value = response
        with pytest.raises(HCGQueryError) as exc:
            client.stats()
        assert "..." in str(exc.value)


def test_invalid_json_wrapped() -> None:
    client = _client()
    with patch("apollo.client.hcg_query_client.requests.get") as get:
        get.return_value = _mock_response(raise_json=True)
        with pytest.raises(HCGQueryError) as exc:
            client.stats()
        assert "was not valid JSON" in str(exc.value)
