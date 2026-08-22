import httpx

from app.database import get_geocode_cache, set_geocode_cache

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "ZahaPicks/0.3 (restaurant lists; contact via GitHub Anishs2k1/Zaha-Picks)"


def _format_nominatim_address(payload: dict) -> str | None:
    address = payload.get("address") or {}
    house = address.get("house_number")
    road = address.get("road")
    city = (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("hamlet")
    )
    state = address.get("state")
    postcode = address.get("postcode")

    street_line = " ".join(part for part in [house, road] if part)
    locality = ", ".join(part for part in [city, state, postcode] if part)

    if street_line and locality:
        return f"{street_line}, {locality}"
    if street_line:
        return street_line
    if locality:
        return locality

    display = (payload.get("display_name") or "").strip()
    if display:
        parts = [part.strip() for part in display.split(",")[:3] if part.strip()]
        if parts:
            return ", ".join(parts)

    return None


async def reverse_geocode(lat: float, lng: float) -> str | None:
    cache_key = f"{round(lat, 5)},{round(lng, 5)}"
    cached = get_geocode_cache(cache_key)
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                NOMINATIM_URL,
                params={
                    "lat": lat,
                    "lon": lng,
                    "format": "json",
                    "zoom": 18,
                    "addressdetails": 1,
                },
                headers={"User-Agent": USER_AGENT},
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPError:
        return None

    formatted = _format_nominatim_address(payload)
    if formatted:
        set_geocode_cache(cache_key, formatted)
    return formatted


def _format_search_label(payload: dict) -> str:
    address = payload.get("address") or {}
    city = (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("hamlet")
    )
    state = address.get("state")
    road = address.get("road")

    if road and city:
        return f"{road}, {city}"
    if city and state:
        return f"{city}, {state}"

    display = (payload.get("display_name") or "").strip()
    if display:
        parts = [part.strip() for part in display.split(",")[:3] if part.strip()]
        if parts:
            return ", ".join(parts)
    return display or "Selected location"


async def forward_geocode(query: str, limit: int = 5) -> list[dict]:
    cleaned = query.strip()
    if len(cleaned) < 2:
        return []

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                NOMINATIM_SEARCH_URL,
                params={
                    "q": cleaned,
                    "format": "json",
                    "limit": limit,
                    "addressdetails": 1,
                },
                headers={"User-Agent": USER_AGENT},
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPError:
        return []

    results = []
    for item in payload:
        try:
            lat = float(item["lat"])
            lng = float(item["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        results.append(
            {
                "lat": lat,
                "lng": lng,
                "label": _format_search_label(item),
            }
        )
    return results
