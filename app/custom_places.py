import uuid

from app.filters import distance_meters, format_distance, matches_cuisine


def new_custom_id() -> str:
    return f"custom/{uuid.uuid4().hex[:12]}"


def row_to_place(row: dict, user_lat: float, user_lng: float) -> dict:
    distance = distance_meters(user_lat, user_lng, row["lat"], row["lng"])
    cuisine = (row.get("cuisine") or "").strip() or "Custom"
    address = (row.get("address") or "").strip() or "Added by you"
    return {
        "id": row["id"],
        "name": row["name"],
        "lat": row["lat"],
        "lng": row["lng"],
        "cuisine": cuisine,
        "opening_hours": None,
        "distance": round(distance),
        "distance_label": format_distance(distance),
        "address": address,
        "yelp_url": None,
        "tags": {"custom": "yes", "name": row["name"], "cuisine": cuisine.lower()},
        "custom": True,
        "notes": row.get("notes") or "",
    }


def matches_cuisine_place(place: dict, cuisine_filter: str) -> bool:
    if cuisine_filter == "any":
        return True

    tags = {
        **(place.get("tags") or {}),
        "cuisine": (place.get("cuisine") or "").lower(),
        "name": place.get("name") or "",
    }
    return matches_cuisine(tags, cuisine_filter)


def filter_custom_places(
    rows: list[dict],
    user_lat: float,
    user_lng: float,
    radius_meters: int,
    cuisine: str,
) -> list[dict]:
    places = []
    for row in rows:
        place = row_to_place(row, user_lat, user_lng)
        if place["distance"] > radius_meters:
            continue
        if not matches_cuisine_place(place, cuisine):
            continue
        places.append(place)
    places.sort(key=lambda item: item["distance"])
    return places
