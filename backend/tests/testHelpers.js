const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "changeme_access_secret";

if (typeof jest !== "undefined") {
  jest.setTimeout(30000);
}

function createToken(payload) {
  return jwt.sign(
    {
      sub: payload.id,
      email: payload.email,
      role: payload.role || "member",
      activeWorkspaceId: payload.activeWorkspaceId || null,
    },
    JWT_ACCESS_SECRET,
    { expiresIn: "1h", algorithm: "HS256" }
  );
}

async function setupTestDB() {
  if (mongoose.connection.readyState === 0) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is required for tests");
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  }
}

async function teardownTestDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = { createToken, setupTestDB, teardownTestDB };
