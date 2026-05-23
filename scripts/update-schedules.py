#!/usr/bin/env python3
import csv
import json
import sys
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


GTFS_URL = "https://assets.metrolinx.com/raw/upload/v1683228856/Documents/Metrolinx/Open%20Data/GO-GTFS.zip"
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "GoSchedule" / "Schedules.json"
ORIGIN_DESTINATIONS = {
    ("UN", "MP"): "union-to-maple",
    ("MP", "UN"): "maple-to-union",
}


def rows_from_zip(feed, name):
    with feed.open(name) as raw:
        text = (line.decode("utf-8-sig") for line in raw)
        yield from csv.DictReader(text)


def gtfs_seconds(value):
    hours, minutes, seconds = [int(part) for part in value.split(":")]
    return hours * 3600 + minutes * 60 + seconds


def display_time(value):
    seconds = gtfs_seconds(value) % 86400
    hour = seconds // 3600
    minute = (seconds % 3600) // 60
    suffix = "AM" if hour < 12 else "PM"
    display_hour = hour % 12
    if display_hour == 0:
        display_hour = 12
    return f"{display_hour}:{minute:02d} {suffix}"


def minutes_between(start, end):
    return max(0, (gtfs_seconds(end) - gtfs_seconds(start)) // 60)


def main():
    archive_path = Path("/tmp/GO-GTFS.zip")
    urllib.request.urlretrieve(GTFS_URL, archive_path)

    with zipfile.ZipFile(archive_path) as feed:
        feed_info = next(rows_from_zip(feed, "feed_info.txt"))

        routes = {
            row["route_id"]: {
                "shortName": row["route_short_name"],
                "longName": row["route_long_name"],
                "type": row["route_type"],
            }
            for row in rows_from_zip(feed, "routes.txt")
        }

        service_dates = defaultdict(list)
        for row in rows_from_zip(feed, "calendar_dates.txt"):
            if row["exception_type"] == "1":
                service_dates[row["service_id"]].append(row["date"])

        trips = {}
        for row in rows_from_zip(feed, "trips.txt"):
            route = routes.get(row["route_id"])
            if route is None:
                continue

            trips[row["trip_id"]] = {
                "route": route["shortName"],
                "routeName": route["longName"],
                "mode": "Train" if route["type"] == "2" else "Bus",
                "serviceId": row["service_id"],
                "headsign": row["trip_headsign"],
            }

        stop_times = defaultdict(list)
        for row in rows_from_zip(feed, "stop_times.txt"):
            if row["stop_id"] in {"UN", "MP"} and row["trip_id"] in trips:
                stop_times[row["trip_id"]].append(row)

        directions = {value: [] for value in ORIGIN_DESTINATIONS.values()}
        for trip_id, times in stop_times.items():
            by_stop = {row["stop_id"]: row for row in times}
            if "UN" not in by_stop or "MP" not in by_stop:
                continue

            for (origin, destination), direction_id in ORIGIN_DESTINATIONS.items():
                origin_row = by_stop[origin]
                destination_row = by_stop[destination]
                if int(origin_row["stop_sequence"]) >= int(destination_row["stop_sequence"]):
                    continue

                trip = trips[trip_id]
                for service_date in service_dates.get(trip["serviceId"], []):
                    directions[direction_id].append(
                        {
                            "serviceDate": service_date,
                            "departureTime": origin_row["departure_time"],
                            "arrivalTime": destination_row["arrival_time"],
                            "departureDisplay": display_time(origin_row["departure_time"]),
                            "arrivalDisplay": display_time(destination_row["arrival_time"]),
                            "durationMinutes": minutes_between(
                                origin_row["departure_time"],
                                destination_row["arrival_time"],
                            ),
                            "route": trip["route"],
                            "routeName": trip["routeName"],
                            "mode": trip["mode"],
                            "headsign": trip["headsign"],
                        }
                    )

        for trips_for_direction in directions.values():
            trips_for_direction.sort(key=lambda item: (item["serviceDate"], gtfs_seconds(item["departureTime"])))

        payload = {
            "source": "Metrolinx GO Transit GTFS",
            "sourceURL": GTFS_URL,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "feedStartDate": feed_info["feed_start_date"],
            "feedEndDate": feed_info["feed_end_date"],
            "feedVersion": feed_info["feed_version"],
            "directions": directions,
        }

    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT}")
    print(f"Union -> Maple trips: {len(directions['union-to-maple'])}")
    print(f"Maple -> Union trips: {len(directions['maple-to-union'])}")


if __name__ == "__main__":
    sys.exit(main())
