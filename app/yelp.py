import os
import re

import httpx

from app.filters import build_yelp_url

YELP_SEARCH_URL = "https://api.yelp.com/v3/businesses/search"
_yelp_cache: dict[str, str] = {}


def _cache_key(name: str, lat: float, lng: float) -> str:
    return f"{name.strip().lower()}:{round(lat, 5)}:{round(lng, 5)}"


def _normalize_name(value: str) -> str:
    return " ".join(re.sub(r"[^\w\s]", " ", value.lower()).split())


def _name_score(query: str, candidate: str) -> float:
    query_norm = _normalize_name(query)
    candidate_norm = _normalize_name(candidate)
    if not query_norm or not candidate_norm:
        return 0.0
    if query_norm == candidate_norm:
        return 1.0
    if query_norm in candidate_norm or candidate_norm in query_norm:
        return 0.9

    query_tokens = set(query_norm.split())
    candidate_tokens = set(candidate_norm.split())
    if not query_tokens or not candidate_tokens:
        return 0.0
    overlap = len(query_tokens & candidate_tokens)
    union = len(query_tokens | candidate_tokens)
    return overlap / union


def _pick_best_business(name: str, businesses: list[dict]) -> dict | None:
    if not businesses:
        return None

    scored = []
    for business in businesses:
        name_score = _name_score(name, business.get("name", ""))
        if name_score < 0.45:
            continue
        distance = business.get("distance", 99999)
        scored.append((name_score - (distance / 5000), business))

    if not scored:
        return None

    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[0][1]


def _clean_yelp_business_url(url: str) -> str:
    return url.split("?", 1)[0]


async def resolve_yelp_business_url(
    name: str,
    lat: float,
    lng: float,
    address: str = "",
    tags: dict | None = None,
) -> dict:
    tags = tags or {}
    cache_key = _cache_key(name, lat, lng)
    if cache_key in _yelp_cache:
        return {"url": _yelp_cache[cache_key], "direct": True, "source": "cache"}

    for key in ("website", "contact:website", "url"):
        value = (tags.get(key) or "").strip()
        if "yelp.com/biz/" in value.lower():
            direct = _clean_yelp_business_url(value)
            _yelp_cache[cache_key] = direct
            return {"url": direct, "direct": True, "source": "osm"}

    api_key = os.getenv("YELP_API_KEY", "").strip()
    if not api_key:
        search_url = build_yelp_url(name, lat, lng, tags, address or "Address not listed")
        return {
            "url": search_url,
            "direct": False,
            "source": "search",
            "message": "Add YELP_API_KEY to .env for direct Yelp business pages.",
        }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                YELP_SEARCH_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                params={
                    "term": name,
                    "latitude": lat,
                    "longitude": lng,
                    "limit": 5,
                    "radius": min(400, 800),
                    "sort_by": "best_match",
                },
            )
            response.raise_for_status()
            businesses = response.json().get("businesses", [])
    except httpx.HTTPError:
        search_url = build_yelp_url(name, lat, lng, tags, address or "Address not listed")
        return {"url": search_url, "direct": False, "source": "search"}

    match = _pick_best_business(name, businesses)
    if match and match.get("url"):
        direct = _clean_yelp_business_url(match["url"])
        _yelp_cache[cache_key] = direct
        return {"url": direct, "direct": True, "source": "yelp_api"}

    search_url = build_yelp_url(name, lat, lng, tags, address or "Address not listed")
    return {"url": search_url, "direct": False, "source": "search"}
