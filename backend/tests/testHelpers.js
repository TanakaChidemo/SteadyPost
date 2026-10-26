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
    let uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/steadypost_test";
    if (uri === "memory") {
      const { MongoMemoryServer } = require("mongodb-memory-server");
      if (!global.__TEST_MONGOD__) {
        global.__TEST_MONGOD__ = await MongoMemoryServer.create();
      }
      uri = global.__TEST_MONGOD__.getUri();
    }
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  }
}

async function teardownTestDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (global.__TEST_MONGOD__) {
    await global.__TEST_MONGOD__.stop();
    global.__TEST_MONGOD__ = null;
  }
}

module.exports = { createToken, setupTestDB, teardownTestDB };
