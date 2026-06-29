"""Tests for restaurant search filtering."""

from fastapi.testclient import TestClient

from app.filters import filter_by_search, matches_search
from app.main import app

client = TestClient(app)


def test_matches_search_by_name():
    place = {
        "name": "Curry Up Now",
        "cuisine": "Indian",
        "address": "Stevenson Street, San Francisco",
    }
    assert matches_search(place, "curry")
    assert matches_search(place, "curry up")
    assert not matches_search(place, "pizza")


def test_matches_search_by_cuisine_and_address():
    place = {
        "name": "Main Street Grill",
        "cuisine": "American",
        "address": "100 Main Street",
    }
    assert matches_search(place, "american")
    assert matches_search(place, "main street")
    assert not matches_search(place, "sushi")


def test_filter_by_search_empty_query():
    places = [{"name": "A"}, {"name": "B"}]
    assert filter_by_search(places, "") == places
    assert filter_by_search(places, "   ") == places


def test_filter_by_search_filters_list():
    places = [
        {"name": "Curry Up Now", "cuisine": "Indian", "address": ""},
        {"name": "Joe's Pizza", "cuisine": "Pizza", "address": ""},
    ]
    filtered = filter_by_search(places, "pizza")
    assert len(filtered) == 1
    assert filtered[0]["name"] == "Joe's Pizza"


def test_search_api_requires_min_length():
    response = client.get(
        "/api/search",
        params={"lat": 40.4259, "lng": -86.9081, "q": "a"},
    )
    assert response.status_code == 422


def test_search_api_rejects_empty_query():
    response = client.get(
        "/api/search",
        params={"lat": 40.4259, "lng": -86.9081, "q": ""},
    )
    assert response.status_code == 422


def test_restaurants_api_has_no_search_param_required():
    response = client.get(
        "/api/restaurants",
        params={
            "lat": 40.4259,
            "lng": -86.9081,
            "radius_meters": 1609,
            "cuisine": "any",
            "meal": "lunch",
            "open_now": "false",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload.get("restaurants"), list)
    assert "status" in payload


if __name__ == "__main__":
    test_matches_search_by_name()
    test_matches_search_by_cuisine_and_address()
    test_filter_by_search_empty_query()
    test_filter_by_search_filters_list()
    test_search_api_requires_min_length()
    test_search_api_rejects_empty_query()
    test_restaurants_api_has_no_search_param_required()
    print("All search tests passed.")
