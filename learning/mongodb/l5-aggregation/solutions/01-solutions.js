// Solutions — Exercise 01
load('/learning/l5-aggregation/lib/telemetry.js');
print('readings:', seed());

section('1. Engine on / off minutes per vehicle (org-south)');
show(
  db.readings.aggregate([
    { $match: { organizationId: 'org-south' } },
    {
      $group: {
        _id: '$vehicleId',
        engineOnMinutes: { $sum: { $cond: ['$engineOn', 1, 0] } },
        engineOffMinutes: { $sum: { $cond: ['$engineOn', 0, 1] } },
      },
    },
    { $sort: { _id: 1 } },
  ]),
);
// $cond inside $sum counts several categories in one pass ("conditional
// aggregation", like SUM(CASE WHEN … THEN 1 ELSE 0 END) in SQL).

section('2. Average driving speed per vehicle type, without $lookup');
const vans = db.vehicles.distinct('_id', {
  organizationId: 'org-north',
  type: 'van',
});
show(
  db.readings.aggregate([
    { $match: { organizationId: 'org-north', speed: { $gt: 0 } } },
    {
      $group: {
        _id: { $cond: [{ $in: ['$vehicleId', vans] }, 'van', 'truck'] },
        avgSpeed: { $avg: '$speed' },
      },
    },
    { $set: { avgSpeed: round('$avgSpeed') } },
    { $sort: { _id: 1 } },
  ]),
);
// Two queries: one to get the van ids, one to aggregate. Works for a small,
// stable list; with many types or vehicles, $lookup (exercise 04) or a copy of
// the type in each reading (an extended reference, L2) is better.

section('3. Lowest fuel level ever, and when');
show(
  db.readings.aggregate([
    { $match: { organizationId: 'org-north' } },
    { $sort: { fuelLevel: 1, timestamp: 1 } },
    {
      $group: {
        _id: null,
        vehicleId: { $first: '$vehicleId' },
        fuelLevel: { $first: '$fuelLevel' },
        at: { $first: '$timestamp' },
      },
    },
    { $project: { _id: 0 } },
  ]),
);
// $min returns the lowest VALUE, but no other field of the document it came
// from. Sorting first and taking $first keeps the whole reading together.
// ($sort + $limit: 1 would also work; $group with $first generalises to
// "lowest per vehicle" by changing _id.)
