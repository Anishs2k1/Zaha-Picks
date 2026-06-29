import httpx

from app.filters import (
    build_yelp_url,
    distance_meters,
    format_address,
    format_distance,
    infer_cuisine,
    is_open_for_meal,
    matches_cuisine,
)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def normalize_restaurant(element: dict, user_lat: float, user_lng: float) -> dict | None:
    lat = element.get("lat") or (element.get("center") or {}).get("lat")
    lng = element.get("lon") or (element.get("center") or {}).get("lon")
    if lat is None or lng is None:
        return None

    tags = element.get("tags") or {}
    name = tags.get("name")
    if not name:
        return None

    distance = distance_meters(user_lat, user_lng, lat, lng)
    cuisine = infer_cuisine(tags, name)
    opening_hours = tags.get("opening_hours") or tags.get("opening_hours:covid19")
    address = format_address(tags)

    return {
        "id": f"{element.get('type')}/{element.get('id')}",
        "name": name,
        "lat": lat,
        "lng": lng,
        "cuisine": cuisine,
        "opening_hours": opening_hours,
        "distance": round(distance),
        "distance_label": format_distance(distance),
        "address": address,
        "yelp_url": build_yelp_url(name, lat, lng, tags, address),
        "tags": tags,
    }


async def fetch_restaurants(
    lat: float,
    lng: float,
    radius_meters: int,
    cuisine: str,
    meal: str,
    open_now_only: bool,
) -> list[dict]:
    radius = round(radius_meters)
    query = f"""
    [out:json][timeout:25];
    (
      node["amenity"~"restaurant|fast_food|cafe"](around:{radius},{lat},{lng});
      way["amenity"~"restaurant|fast_food|cafe"](around:{radius},{lat},{lng});
    );
    out center tags;
    """

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            OVERPASS_URL,
            data={"data": query},
            headers={"User-Agent": "ZahaPicks/0.2 (Python/FastAPI)"},
        )
        response.raise_for_status()
        data = response.json()

    places = []
    for element in data.get("elements", []):
        place = normalize_restaurant(element, lat, lng)
        if not place:
            continue
        if place["distance"] > radius_meters:
            continue
        if not matches_cuisine(place["tags"], cuisine):
            continue
        if open_now_only and place["opening_hours"]:
            if not is_open_for_meal(place["opening_hours"], meal):
                continue
        places.append(place)

    places.sort(key=lambda item: item["distance"])
    return places
