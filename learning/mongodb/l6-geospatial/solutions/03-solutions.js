// Solutions — Exercise 03. Task 2 uses geofenceEvents: run exercise 03 first.
load('/learning/l6-geospatial/lib/geo.js');
const TZ = 'Africa/Cairo';
const cairo = (d) =>
  d.toLocaleTimeString('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  });

db.readings.createIndex({
  organizationId: 1,
  location: '2dsphere',
  timestamp: -1,
});

section('1. Org-south arrivals at a 300 m circle around the south depot');
show(
  db.readings.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: PLACES.depotSouth.center },
        key: 'location',
        query: { organizationId: 'org-south' },
        distanceField: 'metres',
      },
    },
    { $set: { inside: { $lte: ['$metres', 300] } } },
    {
      $setWindowFields: {
        partitionBy: '$vehicleId',
        sortBy: { timestamp: 1 },
        output: { wasInside: { $shift: { output: '$inside', by: -1 } } },
      },
    },
    { $match: { inside: true, wasInside: false } },
    { $group: { _id: '$vehicleId', arrivals: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]),
);
// The partition by vehicle is what keeps one vehicle's readings from being
// compared with another's.

section('2. Visits of v-102');
const names = Object.fromEntries(
  db.geofences
    .find()
    .toArray()
    .map((g) => [g._id, g.name]),
);
db.geofenceEvents
  .aggregate([
    { $match: { organizationId: 'org-north', vehicleId: 'v-102' } },
    {
      $setWindowFields: {
        partitionBy: '$fenceId',
        sortBy: { at: 1 },
        output: {
          next: { $shift: { output: { type: '$type', at: '$at' }, by: 1 } },
        },
      },
    },
    { $match: { type: 'enter', 'next.type': 'exit' } },
    { $sort: { at: 1 } },
  ])
  .forEach((v) =>
    print(
      '  ' + names[v.fenceId].padEnd(22),
      cairo(v.at),
      '→',
      cairo(v.next.at),
      Math.round((v.next.at - v.at) / 60000) + ' min',
    ),
  );

section('3. Shuffled delivery');
// The same onReading() as exercise 03, section 2.
function onReading(r) {
  const now = db.geofences
    .find(
      { organizationId: r.organizationId, area: { $geoIntersects: { $geometry: r.location } } },
      { _id: 1 },
    )
    .toArray()
    .map((g) => g._id);
  const key = { organizationId: r.organizationId, vehicleId: r.vehicleId };
  const state = db.vehicleFenceState.findOne(key);
  if (state && state.timestamp >= r.timestamp) return; // late reading: no events
  const before = state ? state.fences : [];
  const events = [
    ...now.filter((f) => !before.includes(f)).map((f) => ({ type: 'enter', fenceId: f })),
    ...before.filter((f) => !now.includes(f)).map((f) => ({ type: 'exit', fenceId: f })),
  ];
  if (state && events.length) {
    db.geofenceEvents.insertMany(events.map((e) => ({ ...key, ...e, at: r.timestamp })));
  }
  db.vehicleFenceState.updateOne(
    key,
    { $set: { fences: now, timestamp: r.timestamp } },
    { upsert: true },
  );
} // prettier-ignore
db.geofences.createIndex({ organizationId: 1, area: '2dsphere' });
const v101 = db.readings.find({ vehicleId: 'v-101' }).toArray();
const inOrder = () => {
  db.vehicleFenceState.deleteMany({});
  db.geofenceEvents.deleteMany({});
  v101
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach(onReading);
  return db.geofenceEvents.countDocuments();
};
const shuffled = () => {
  db.vehicleFenceState.deleteMany({});
  db.geofenceEvents.deleteMany({});
  const s = v101.slice();
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [s[i], s[j]] = [s[j], s[i]];
  }
  s.forEach(onReading);
  return db.geofenceEvents.countDocuments();
};
print(
  '  in time order:',
  inOrder(),
  'events | shuffled:',
  shuffled(),
  'events',
);
// `if (state && state.timestamp >= r.timestamp) return;` drops every reading
// older than the newest one seen. In random order, most readings arrive "late"
// and are skipped, so most events are LOST (but no false ones are added).
// The cost of the guard is missed events; the fix is to process readings in
// time order per vehicle (buffer a little, or one ordered consumer per
// vehicle: L12) and recompute events from history when late data arrives.
