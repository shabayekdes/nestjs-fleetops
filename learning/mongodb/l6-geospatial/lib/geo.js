// Shared helpers for Learning Stage 6. Loaded by every exercise and solution
// with load('/learning/l6-geospatial/lib/geo.js').
//
// SYNTHETIC location data around Cairo. No real vehicle or driver locations
// are used anywhere in this track: location data about drivers is personal
// data.
//
// The picture:
// - each organization has a depot; two customer zones (Downtown, Heliopolis)
//   are shared by everyone, as real places are;
// - a vehicle repeats a 2-hour cycle: parked at its depot (45 min), drives
//   15 min (on a curved route) to its customer zone, waits there 45 min,
//   drives back;
// - parked vehicles still "move" a few metres: GPS jitter, as on real devices.
// Coordinates are GeoJSON order: [longitude, latitude].

function section(title) {
  print('');
  print('=== ' + title + ' ===');
}

function show(cursorOrArray, max = 20) {
  const rows = Array.isArray(cursorOrArray)
    ? cursorOrArray
    : cursorOrArray.toArray();
  rows.slice(0, max).forEach((r) => print('   ', JSON.stringify(r)));
  if (rows.length > max) print('    … ' + (rows.length - max) + ' more');
}

// An axis-aligned square polygon around a centre, `half` degrees each way.
// The ring is closed: the first point is repeated at the end.
function square(center, half) {
  const [x, y] = center;
  const r = (v) => Math.round(v * 1e6) / 1e6; // no 31.195999999999998
  return {
    type: 'Polygon',
    coordinates: [
      [
        [r(x - half), r(y - half)],
        [r(x + half), r(y - half)],
        [r(x + half), r(y + half)],
        [r(x - half), r(y + half)],
        [r(x - half), r(y - half)],
      ],
    ],
  };
}

const PLACES = {
  depotNorth: { center: [31.2, 30.06], half: 0.004 },
  depotSouth: { center: [31.21, 30.0], half: 0.004 },
  downtown: { center: [31.245, 30.045], half: 0.006 },
  heliopolis: { center: [31.32, 30.09], half: 0.008 },
};

const FLEET = [
  { vehicleId: 'v-101', organizationId: 'org-north', depot: 'depotNorth', zone: 'downtown' },
  { vehicleId: 'v-102', organizationId: 'org-north', depot: 'depotNorth', zone: 'heliopolis' },
  { vehicleId: 'v-103', organizationId: 'org-north', depot: 'depotNorth', zone: 'downtown' },
  { vehicleId: 'v-104', organizationId: 'org-north', depot: 'depotNorth', zone: 'heliopolis' },
  { vehicleId: 'v-201', organizationId: 'org-south', depot: 'depotSouth', zone: 'downtown' },
  { vehicleId: 'v-202', organizationId: 'org-south', depot: 'depotSouth', zone: 'downtown' },
]; // prettier-ignore

const START = ISODate('2026-10-05T05:00:00Z'); // 08:00 Cairo
const MINUTES = 6 * 60;
const EARTH_RADIUS_M = 6_378_100; // the radius MongoDB uses for spheres

// Great-circle distance in metres between two [lng, lat] points.
function haversine([lng1, lat1], [lng2, lat2]) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// Deterministic "random" in [-0.5, 0.5).
function noise(a, b) {
  return ((((a * 7919 + b * 104729) % 1000) + 1000) % 1000) / 1000 - 0.5;
}

// Where vehicle v is (without GPS jitter) at minute m, and whether it drives.
function truePosition(v, m) {
  const n = Number(v.vehicleId.slice(2));
  const depot = PLACES[v.depot].center;
  const zone = PLACES[v.zone].center;
  // Each vehicle parks at its own spot inside the depot / zone.
  const spot = ((n % 5) - 2) * 0.0008;
  const home = [depot[0] + spot, depot[1] - spot];
  const away = [zone[0] - spot, zone[1] + spot];
  const t = (m + n * 17) % 120;
  const between = (from, to, f) => {
    // A curved route: a sideways bulge in the middle, like real streets.
    const bulge = Math.sin(Math.PI * f) * 0.01;
    return [
      from[0] + (to[0] - from[0]) * f - bulge * (to[1] - from[1]) * 10,
      from[1] + (to[1] - from[1]) * f + bulge * (to[0] - from[0]) * 10,
    ];
  };
  if (t < 30) return { at: home, driving: false };
  if (t < 45) return { at: between(home, away, (t - 30) / 15), driving: true };
  if (t < 90) return { at: away, driving: false };
  if (t < 105) return { at: between(away, home, (t - 90) / 15), driving: true };
  return { at: home, driving: false };
}

// All readings of one vehicle, one per minute, in time order.
function vehicleReadings(v) {
  const n = Number(v.vehicleId.slice(2));
  let odometer = 10_000 + n * 50;
  let prev = truePosition(v, -1).at;
  const out = [];
  for (let m = 0; m < MINUTES; m++) {
    const { at, driving } = truePosition(v, m);
    const step = haversine(prev, at); // metres along the straight segment
    // Streets are not straight lines: the road distance is ~20% longer.
    odometer += (step * 1.2) / 1000;
    prev = at;
    // GPS jitter of up to ±10 m (about 0.0001°) on every fix.
    const fix = [
      Math.round((at[0] + noise(m, n) * 0.0002) * 1e6) / 1e6,
      Math.round((at[1] + noise(n, m) * 0.0002) * 1e6) / 1e6,
    ];
    out.push({
      organizationId: v.organizationId,
      vehicleId: v.vehicleId,
      timestamp: new Date(START.getTime() + m * 60_000),
      location: { type: 'Point', coordinates: fix },
      speed: driving ? Math.round(((step * 1.2) / 1000) * 60) : 0,
      engineOn: driving,
      odometer: Math.round(odometer * 100) / 100,
    });
  }
  return out;
}

// Drops and reloads `readings` (6 vehicles × 360 minutes = 2 160 readings),
// `latestPosition` (one document per vehicle: its last reading) and
// `geofences` (the four places).
function seed() {
  db.readings.drop();
  for (const v of FLEET) db.readings.insertMany(vehicleReadings(v));
  db.readings.createIndex({ organizationId: 1, vehicleId: 1, timestamp: -1 });

  db.latestPosition.drop();
  db.latestPosition.insertMany(
    db.readings
      .aggregate([
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: '$vehicleId',
            organizationId: { $first: '$organizationId' },
            timestamp: { $first: '$timestamp' },
            location: { $first: '$location' },
          },
        },
        { $project: { _id: 0, vehicleId: '$_id', organizationId: 1, timestamp: 1, location: 1 } },
      ])
      .toArray(),
  ); // prettier-ignore
  db.latestPosition.createIndex(
    { organizationId: 1, vehicleId: 1 },
    { unique: true },
  );

  db.geofences.drop();
  db.geofences.insertMany([
    { _id: 'gf-depot-north', organizationId: 'org-north', name: 'North depot', kind: 'depot', area: square(PLACES.depotNorth.center, PLACES.depotNorth.half) },
    { _id: 'gf-downtown-n', organizationId: 'org-north', name: 'Downtown customers', kind: 'customer', area: square(PLACES.downtown.center, PLACES.downtown.half) },
    { _id: 'gf-heliopolis-n', organizationId: 'org-north', name: 'Heliopolis customers', kind: 'customer', area: square(PLACES.heliopolis.center, PLACES.heliopolis.half) },
    { _id: 'gf-depot-south', organizationId: 'org-south', name: 'South depot', kind: 'depot', area: square(PLACES.depotSouth.center, PLACES.depotSouth.half) },
    { _id: 'gf-downtown-s', organizationId: 'org-south', name: 'Downtown', kind: 'customer', area: square(PLACES.downtown.center, PLACES.downtown.half) },
  ]); // prettier-ignore
  return db.readings.countDocuments();
}

function km(metres) {
  return Math.round(metres / 100) / 10;
}
