import math
import re
from datetime import datetime
from urllib.parse import quote_plus

from app.constants import CUISINE_ALIASES, METERS_PER_MILE

DAY_NAMES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
TIME_PATTERN = re.compile(r"^(\d{1,2}):(\d{2})$")
DAY_PATTERN = re.compile(r"^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?")


def meal_window(meal: str) -> tuple[int, int]:
    if meal == "lunch":
        return 11 * 60, 15 * 60
    return 17 * 60, 22 * 60


def parse_time_to_minutes(value: str) -> int | None:
    match = TIME_PATTERN.match(value.strip())
    if not match:
        return None
    return int(match.group(1)) * 60 + int(match.group(2))


def is_open_for_meal(opening_hours: str | None, meal: str, now: datetime | None = None) -> bool:
    if not opening_hours or opening_hours.lower() == "24/7":
        return True

    now = now or datetime.now()
    js_day = (now.weekday() + 1) % 7
    today = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][js_day]
    today_name_idx = DAY_NAMES.index(today)
    current_minutes = now.hour * 60 + now.minute
    start, end = meal_window(meal)

    for segment in [part.strip() for part in opening_hours.split(";") if part.strip()]:
        day_match = DAY_PATTERN.match(segment)
        if not day_match:
            continue

        start_day = day_match.group(1)
        end_day = day_match.group(2) or start_day
        start_idx = DAY_NAMES.index(start_day)
        end_idx = DAY_NAMES.index(end_day)

        if start_idx <= end_idx:
            day_matches = start_idx <= today_name_idx <= end_idx
        else:
            day_matches = today_name_idx >= start_idx or today_name_idx <= end_idx

        if not day_matches:
            continue

        time_part = DAY_PATTERN.sub("", segment).strip()
        for range_part in [part.strip() for part in time_part.split(",") if part.strip()]:
            open_str, _, close_str = range_part.partition("-")
            open_minutes = parse_time_to_minutes(open_str)
            close_minutes = parse_time_to_minutes(close_str)
            if open_minutes is None or close_minutes is None:
                continue

            overlaps_meal = max(open_minutes, start) < min(close_minutes, end)
            if overlaps_meal and open_minutes <= current_minutes <= close_minutes:
                return True

    return False


def matches_cuisine(tags: dict, cuisine_filter: str) -> bool:
    if cuisine_filter == "any":
        return True

    cuisine = (tags.get("cuisine") or "").lower()
    name = (tags.get("name") or "").lower()
    terms = CUISINE_ALIASES.get(cuisine_filter, [cuisine_filter])
    return any(term in cuisine or term in name for term in terms)


def distance_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371000
    to_rad = math.radians
    d_lat = to_rad(lat2 - lat1)
    d_lng = to_rad(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(d_lng / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def format_distance(meters: float) -> str:
    miles = meters / METERS_PER_MILE
    return "< 0.1 mi" if miles < 0.1 else f"{miles:.1f} mi"


def format_address(tags: dict) -> str:
    if tags.get("addr:full"):
        return tags["addr:full"].strip()

    street = " ".join(
        part
        for part in [tags.get("addr:housenumber"), tags.get("addr:street")]
        if part
    )
    city = (
        tags.get("addr:city")
        or tags.get("addr:town")
        or tags.get("addr:place")
        or tags.get("addr:suburb")
    )
    state = tags.get("addr:state")
    postcode = tags.get("addr:postcode")

    if street and city:
        locality = ", ".join(part for part in [city, state, postcode] if part)
        return f"{street}, {locality}" if locality else street

    parts = [street, city, state, postcode]
    cleaned = [part for part in parts if part]
    return " ".join(cleaned) if cleaned else "Address not listed"


def format_cuisine_label(raw: str) -> str:
    return ", ".join(
        segment.strip().replace("_", " ").title()
        for segment in raw.split(";")
        if segment.strip()
    )


def infer_cuisine(tags: dict, name: str, existing: str | None = None) -> str:
    existing_value = (existing or "").strip()
    if existing_value and existing_value.lower() not in {"unspecified", "unknown"}:
        return format_cuisine_label(existing_value)

    raw_cuisine = (tags.get("cuisine") or "").strip()
    if raw_cuisine:
        return format_cuisine_label(raw_cuisine)

    haystack = " ".join(
        part
        for part in [
            name,
            tags.get("brand") or "",
            tags.get("operator") or "",
            tags.get("description") or "",
        ]
        if part
    ).lower()

    for label, terms in CUISINE_ALIASES.items():
        if any(term in haystack for term in terms):
            return label.title()

    amenity = (tags.get("amenity") or "").lower()
    if amenity == "fast_food":
        return "Fast Food"
    if amenity == "cafe":
        return "Cafe"
    if amenity == "restaurant":
        return "Restaurant"

    return "Unspecified"


def build_yelp_url(name: str, lat: float, lng: float, tags: dict, address: str) -> str:
    for key in ("website", "contact:website", "url"):
        value = (tags.get(key) or "").strip()
        if "yelp.com" in value.lower():
            return value

    find_desc = quote_plus(name)
    if address != "Address not listed":
        find_loc = quote_plus(address)
    else:
        find_loc = quote_plus(f"{lat},{lng}")

    return f"https://www.yelp.com/search?find_desc={find_desc}&find_loc={find_loc}"
