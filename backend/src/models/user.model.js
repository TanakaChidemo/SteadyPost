const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const userSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("user") },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null },
    name: { type: String, required: true },
    role: { type: String, default: "member" },
    // No `default: null` here on purpose — a unique+sparse index only
    // excludes documents where the field is absent, not ones set to null,
    // so every password-only user would collide on a null googleId.
    googleId: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);

async function findByEmail(email) {
  return withId(await User.findOne({ email }).lean());
}

async function findById(id) {
  return withId(await User.findById(id).lean());
}

async function findByGoogleId(googleId) {
  return withId(await User.findOne({ googleId }).lean());
}

async function create({ email, passwordHash, name, role = "member", googleId }) {
  const doc = { email, name, role };
  if (passwordHash) doc.passwordHash = passwordHash;
  if (googleId) doc.googleId = googleId;
  const user = await User.create(doc);
  return withId(user.toObject());
}

async function linkGoogleId(userId, googleId) {
  return withId(await User.findByIdAndUpdate(userId, { googleId }, { new: true }).lean());
}

module.exports = { findByEmail, findById, findByGoogleId, create, linkGoogleId };
