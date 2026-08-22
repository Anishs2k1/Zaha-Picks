import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from app.custom_places import new_custom_id

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "zaha_picks.db"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db() -> None:
    with _connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS saved_restaurants (
                osm_id TEXT PRIMARY KEY,
                list_type TEXT NOT NULL CHECK(list_type IN ('want', 'visited')),
                name TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                cuisine TEXT NOT NULL,
                address TEXT NOT NULL,
                saved_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_saved_restaurants_list_type
            ON saved_restaurants(list_type);

            CREATE TABLE IF NOT EXISTS geocode_cache (
                cache_key TEXT PRIMARY KEY,
                address TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS user_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS custom_restaurants (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                cuisine TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_custom_restaurants_created_at
            ON custom_restaurants(created_at DESC);
            """
        )


def _row_to_place(row: sqlite3.Row) -> dict:
    return {
        "id": row["osm_id"],
        "name": row["name"],
        "lat": row["lat"],
        "lng": row["lng"],
        "cuisine": row["cuisine"],
        "address": row["address"],
        "savedAt": row["saved_at"],
    }


def get_lists() -> dict:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT osm_id, list_type, name, lat, lng, cuisine, address, saved_at
            FROM saved_restaurants
            ORDER BY saved_at DESC
            """
        ).fetchall()

    want_to_visit = []
    visited = []
    for row in rows:
        place = _row_to_place(row)
        if row["list_type"] == "want":
            want_to_visit.append(place)
        else:
            visited.append(place)

    return {"wantToVisit": want_to_visit, "visited": visited}


def save_place(place: dict, list_type: str) -> dict:
    saved_at = datetime.now(timezone.utc).isoformat()
    with _connect() as connection:
        connection.execute("DELETE FROM saved_restaurants WHERE osm_id = ?", (place["id"],))
        connection.execute(
            """
            INSERT INTO saved_restaurants
            (osm_id, list_type, name, lat, lng, cuisine, address, saved_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                place["id"],
                list_type,
                place["name"],
                place["lat"],
                place["lng"],
                place["cuisine"],
                place["address"],
                saved_at,
            ),
        )

    saved = dict(place)
    saved["savedAt"] = saved_at
    return saved


def remove_place(osm_id: str, list_type: str) -> bool:
    with _connect() as connection:
        cursor = connection.execute(
            """
            DELETE FROM saved_restaurants
            WHERE osm_id = ? AND list_type = ?
            """,
            (osm_id, list_type),
        )
        return cursor.rowcount > 0


def is_in_list(osm_id: str, list_type: str) -> bool:
    with _connect() as connection:
        row = connection.execute(
            """
            SELECT 1
            FROM saved_restaurants
            WHERE osm_id = ? AND list_type = ?
            LIMIT 1
            """,
            (osm_id, list_type),
        ).fetchone()
    return row is not None


def get_geocode_cache(cache_key: str) -> str | None:
    with _connect() as connection:
        row = connection.execute(
            "SELECT address FROM geocode_cache WHERE cache_key = ?",
            (cache_key,),
        ).fetchone()
    return row["address"] if row else None


def set_geocode_cache(cache_key: str, address: str) -> None:
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO geocode_cache (cache_key, address, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET
                address = excluded.address,
                created_at = excluded.created_at
            """,
            (cache_key, address, datetime.now(timezone.utc).isoformat()),
        )


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_setting(key: str) -> str | None:
    with _connect() as connection:
        row = connection.execute(
            "SELECT value FROM user_settings WHERE key = ?",
            (key,),
        ).fetchone()
    return row["value"] if row else None


def set_setting(key: str, value: str) -> None:
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO user_settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            """,
            (key, value, _utc_now()),
        )


def get_saved_location() -> dict | None:
    raw = get_setting("map_location")
    if not raw:
        return None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None

    lat = payload.get("lat")
    lng = payload.get("lng")
    if lat is None or lng is None:
        return None

    return {
        "lat": float(lat),
        "lng": float(lng),
        "label": (payload.get("label") or "").strip() or "Saved location",
        "source": (payload.get("source") or "manual").strip() or "manual",
    }


def save_location(lat: float, lng: float, label: str, source: str = "manual") -> dict:
    payload = {
        "lat": lat,
        "lng": lng,
        "label": label.strip() or "Saved location",
        "source": source,
    }
    set_setting("map_location", json.dumps(payload))
    return payload


def _custom_row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "lat": row["lat"],
        "lng": row["lng"],
        "cuisine": row["cuisine"],
        "address": row["address"],
        "notes": row["notes"],
        "createdAt": row["created_at"],
    }


def get_custom_restaurants() -> list[dict]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, name, lat, lng, cuisine, address, notes, created_at
            FROM custom_restaurants
            ORDER BY created_at DESC
            """
        ).fetchall()
    return [_custom_row_to_dict(row) for row in rows]


def add_custom_restaurant(
    name: str,
    lat: float,
    lng: float,
    cuisine: str = "",
    address: str = "",
    notes: str = "",
) -> dict:
    place_id = new_custom_id()
    created_at = _utc_now()
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO custom_restaurants
            (id, name, lat, lng, cuisine, address, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                place_id,
                name.strip(),
                lat,
                lng,
                cuisine.strip(),
                address.strip(),
                notes.strip(),
                created_at,
            ),
        )
    return {
        "id": place_id,
        "name": name.strip(),
        "lat": lat,
        "lng": lng,
        "cuisine": cuisine.strip(),
        "address": address.strip(),
        "notes": notes.strip(),
        "createdAt": created_at,
    }


def delete_custom_restaurant(place_id: str) -> bool:
    with _connect() as connection:
        cursor = connection.execute(
            "DELETE FROM custom_restaurants WHERE id = ?",
            (place_id,),
        )
        return cursor.rowcount > 0
