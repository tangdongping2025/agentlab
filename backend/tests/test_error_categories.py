import asyncio

from runtime.error_categories import (
    classify,
    SERVICE_UNAVAILABLE,
    NETWORK,
    BAD_REQUEST,
    INTERNAL,
)


def test_classify_5xx_status_is_service_unavailable():
    assert classify(503) == SERVICE_UNAVAILABLE
    assert classify(502) == SERVICE_UNAVAILABLE


def test_classify_4xx_status_is_bad_request():
    assert classify(400) == BAD_REQUEST
    assert classify(401) == BAD_REQUEST


def test_classify_service_keyword_strings():
    assert classify("503 No available accounts") == SERVICE_UNAVAILABLE
    assert classify("Upstream access forbidden") == SERVICE_UNAVAILABLE
    assert classify("api_error: boom") == SERVICE_UNAVAILABLE


def test_classify_network_exception_by_type():
    assert classify(ConnectionError("refused")) == NETWORK
    assert classify(asyncio.TimeoutError()) == NETWORK


def test_classify_network_keyword_string():
    assert classify("connection reset") == NETWORK
    assert classify("DNS resolution failed") == NETWORK


def test_classify_internal_for_plain_exception():
    assert classify(RuntimeError("boom")) == INTERNAL
    assert classify(ValueError("bad")) == INTERNAL


def test_classify_internal_for_unknown_type():
    assert classify(object()) == INTERNAL
