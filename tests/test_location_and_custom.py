"""Tests for saved location and custom restaurant APIs."""

from fastapi.testclient import TestClient

from app.database import delete_custom_restaurant, init_db, set_setting
from app.main import app

init_db()
client = TestClient(app)


def setup_function() -> None:
    set_setting("map_location", "")


def test_location_defaults():
    response = client.get("/api/location")
    assert response.status_code == 200
    payload = response.json()
    assert "lat" in payload
    assert "lng" in payload
    assert payload.get("label")


def test_location_save_and_load():
    save = client.put(
        "/api/location",
        json={
            "lat": 41.8781,
            "lng": -87.6298,
            "label": "Chicago, IL",
            "source": "manual",
        },
    )
    assert save.status_code == 200
    saved = save.json()
    assert saved["label"] == "Chicago, IL"

    load = client.get("/api/location")
    assert load.status_code == 200
    payload = load.json()
    assert payload["lat"] == 41.8781
    assert payload["lng"] == -87.6298
    assert payload["label"] == "Chicago, IL"


def test_custom_restaurant_crud():
    create = client.post(
        "/api/custom-restaurants",
        json={
            "name": "Test Custom Spot",
            "lat": 40.4259,
            "lng": -86.9081,
            "cuisine": "Thai",
            "address": "123 Main St",
        },
    )
    assert create.status_code == 200
    payload = create.json()
    place_id = payload["restaurant"]["id"]
    assert place_id.startswith("custom/")

    listing = client.get("/api/custom-restaurants")
    assert listing.status_code == 200
    restaurants = listing.json()["restaurants"]
    assert any(item["id"] == place_id for item in restaurants)

    delete = client.delete(f"/api/custom-restaurants/{place_id}")
    assert delete.status_code == 200
    assert all(item["id"] != place_id for item in delete.json()["restaurants"])


def test_custom_restaurants_merge_into_nearby():
    from app.custom_places import filter_custom_places
    from app.database import add_custom_restaurant

    saved = add_custom_restaurant(
        name="Nearby Custom Cafe",
        lat=40.4265,
        lng=-86.9075,
        cuisine="Cafe",
        address="Near center",
    )
    place_id = saved["id"]

    try:
        matches = filter_custom_places(
            [saved],
            user_lat=40.4259,
            user_lng=-86.9081,
            radius_meters=1609,
            cuisine="any",
        )
        assert any(item["id"] == place_id for item in matches)
        assert matches[0]["custom"] is True
    finally:
        delete_custom_restaurant(place_id)


def test_geocode_requires_min_length():
    response = client.get("/api/geocode", params={"q": "a"})
    assert response.status_code == 422


if __name__ == "__main__":
    test_location_defaults()
    test_location_save_and_load()
    test_custom_restaurant_crud()
    test_custom_restaurants_merge_into_nearby()
    test_geocode_requires_min_length()
    print("All location and custom restaurant tests passed.")
