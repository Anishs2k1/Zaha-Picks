"""Tests for restaurant search filtering."""

from app.filters import filter_by_search, matches_search


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


if __name__ == "__main__":
    test_matches_search_by_name()
    test_matches_search_by_cuisine_and_address()
    test_filter_by_search_empty_query()
    test_filter_by_search_filters_list()
    print("All search tests passed.")
