# L6 — Geospatial features: notes

All location data in this track is synthetic. Location history is personal data about drivers.

## GeoJSON rules

| Rule                                     | Why it bites                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `[longitude, latitude]`                  | A swapped pair is still a valid point, just elsewhere (and may look plausible) |
| Distances are metres on a sphere         | 0.001° is 111 m of latitude but only 96 m of longitude at Cairo                |
| Polygon rings are closed                 | First point repeated at the end; otherwise rejected                            |
| Holes lie strictly inside the outer ring | A hole sharing an edge with the outer ring is rejected                         |
| No self-crossing edges                   | A bow-tie is rejected                                                          |
| GeoJSON has no circle                    | Store `{ center, radiusM }` and query `$centerSphere`, or a many-sided polygon |
| `$centerSphere` radius is in **radians** | metres / 6 378 100                                                             |

## Which operator

| Question                       | Operator                                     | Notes                                                                    |
| ------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------ |
| Nearest N, with distances      | `$geoNear` (first aggregation stage)         | `query` for the tenant, `key` for the field, `distanceMultiplier` for km |
| Nearest first, no distance     | `$near` (find)                               | Not allowed in counts                                                    |
| Points inside an area / circle | `$geoWithin` + `$geometry` / `$centerSphere` | A plain filter: counts, other sorts, other conditions                    |
| Areas containing a point       | `$geoIntersects` on the areas                | Index on the areas; the geofence lookup per reading                      |
| Routes crossing an area        | `$geoIntersects` on `LineString`s            | Catches crossings between two fixes                                      |

Geo operators take literal geometries, not field references: you cannot join readings to fences inside one query, and there is no point-in-polygon **expression** for `$set` / `$cond`.

## Tenant isolation

- The geo index is `{ organizationId: 1, location: '2dsphere' }`. With it, a `$geoNear` that forgets `organizationId` **fails** ("unable to find index"). With a plain `{ location: '2dsphere' }` index the same query **returned the other organization's vehicles**, which were in the same street.
- Geofences belong to an organization too, even when two organizations draw the same place.

## Geofence events

- "Inside" is state; "enter"/"exit" are changes between consecutive readings of one vehicle.
- **Batch, circular fence:** `$geoNear` (distance to the centre for every reading) → `inside` → `$shift` → changes. One circle per pipeline.
- **Ingest time, any polygons:** per reading, `$geoIntersects` against the organization's fences, compare with the vehicle's stored set, write enter/exit events, update the state. 1 440 readings → 48 events in ~2.4 s from mongosh; a service would cache fences in memory.
- **Noise:** a vehicle parked 3 m outside a fence edge with ±10 m GPS jitter produced 27 events in an hour. Requiring 3 readings in a row cut it to 4, at the cost of 3 minutes of latency. Hysteresis (separate enter/exit distances) or a minimum dwell time are alternatives.
- **Order matters:** the "ignore readings older than the state" guard kept events correct but, with shuffled delivery, kept only 3 of 12. Events need per-vehicle ordered processing (L12) and recomputation when late data arrives.
- Visits = each `enter` paired with the next `exit` of the same vehicle and fence (`$shift` by +1).

## Location history

- GPS distance ≠ odometer: summing straight lines between one-minute fixes gave ~0.78 of the odometer, and parked GPS jitter added kilometres never driven. Prefer the odometer; filter GPS distance to moving readings.
- Trips (gaps and islands on `engineOn`) stored with their route as a `LineString` make "trips through Heliopolis" one indexed query. The trip boundary is a decision: without the first engine-off reading (the arrival), only 3 of 6 trips reached the zone; with it, all 6.
- Thin paths for maps: 360 points → 144 by keeping every driving point and one parked point per 5 minutes.
- Privacy: round coordinates for analytics (3 decimals ≈ 100 m), aggregate into grid cells for heat maps, expire raw readings, keep trips and summaries, scope everything by organization.

## For v2.x GPS + telematics (and L8)

- Latest position collection with `{ organizationId, location: '2dsphere' }` for "nearest vehicles" and "who is in zone X now".
- Geofences collection with `{ organizationId, area: '2dsphere' }`; validate polygons when users save them.
- Geofence events computed at ingestion, per vehicle, in time order, debounced; stored as events, not recomputed per request.
- Trips derived from readings, stored with routes; raw readings expire.
- Still out of scope: real devices, live tracking, road snapping, a map UI, real location data.

## My notes

<!-- Add your own decisions, trade-offs and open questions here. -->
