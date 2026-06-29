"""Smoke tests for list APIs and page responses."""

from fastapi.testclient import TestClient

from app.database import init_db
from app.main import app

init_db()
client = TestClient(app)

SAMPLE = {
    "id": "node/test-smoke",
    "name": "Smoke Test Cafe",
    "lat": 40.4259,
    "lng": -86.9081,
    "tags": {"amenity": "cafe", "name": "Smoke Test Cafe"},
}


def test_home_and_lists_pages():
    assert client.get("/").status_code == 200
    assert client.get("/lists").status_code == 200


def test_lists_api_shape():
    response = client.get("/api/lists")
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload.get("wantToVisit"), list)
    assert isinstance(payload.get("visited"), list)


def test_lists_crud_flow():
    client.delete(f"/api/lists/want/{SAMPLE['id']}")
    client.delete(f"/api/lists/visited/{SAMPLE['id']}")

    add_want = client.post("/api/lists/want", json=SAMPLE)
    assert add_want.status_code == 200
    want_payload = add_want.json()
    assert isinstance(want_payload.get("wantToVisit"), list)
    assert any(item["id"] == SAMPLE["id"] for item in want_payload["wantToVisit"])

    add_visited = client.post("/api/lists/visited", json=SAMPLE)
    assert add_visited.status_code == 200
    visited_payload = add_visited.json()
    assert isinstance(visited_payload.get("visited"), list)
    assert any(item["id"] == SAMPLE["id"] for item in visited_payload["visited"])
    assert all(item["id"] != SAMPLE["id"] for item in visited_payload.get("wantToVisit", []))

    delete_visited = client.delete(f"/api/lists/visited/{SAMPLE['id']}")
    assert delete_visited.status_code == 200
    assert all(item["id"] != SAMPLE["id"] for item in delete_visited.json().get("visited", []))


def test_migrate_endpoint_shape():
    response = client.post(
        "/api/lists/migrate",
        json={"wantToVisit": [], "visited": []},
    )
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload.get("wantToVisit"), list)
    assert isinstance(payload.get("visited"), list)


if __name__ == "__main__":
    test_home_and_lists_pages()
    test_lists_api_shape()
    test_lists_crud_flow()
    test_migrate_endpoint_shape()
    print("All list smoke tests passed.")
