const crypto = require("crypto");

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

// Mongoose lean() results only carry `_id`. Existing controllers reference
// `.id` on users/social accounts/scheduled posts (a holdover from the
// in-memory store's shape) — this keeps both working without touching
// every call site.
function withId(doc) {
  if (!doc) return doc;
  return { ...doc, id: doc._id };
}

module.exports = { newId, withId };
