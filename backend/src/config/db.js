const mongoose = require("mongoose");
const logger = require("./logger");

let mongod = null;

async function connectDB() {
  let uri = process.env.MONGODB_URI;

  if (!uri || uri === "memory" || uri.startsWith("mongodb+srv://<user>")) {
    try {
      const { MongoMemoryServer } = require("mongodb-memory-server");
      logger.info("Starting in-memory MongoDB server...");
      mongod = await MongoMemoryServer.create();
      uri = mongod.getUri();
      logger.info({ uri }, "In-memory MongoDB server started");
    } catch (memErr) {
      if (!uri) {
        throw new Error(
          "MONGODB_URI is not set and in-memory MongoDB failed to start: " + memErr.message
        );
      }
    }
  }

  mongoose.connection.on("error", (err) => {
    logger.error({ err }, "MongoDB connection error");
  });

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    logger.info("Connected to MongoDB");
  } catch (connectErr) {
    if (!mongod) {
      try {
        const { MongoMemoryServer } = require("mongodb-memory-server");
        logger.warn("Could not connect to external MONGODB_URI. Starting in-memory MongoDB for local dev...");
        mongod = await MongoMemoryServer.create();
        const fallbackUri = mongod.getUri();
        await mongoose.connect(fallbackUri);
        logger.info({ fallbackUri }, "Connected to in-memory MongoDB fallback");
        return;
      } catch (fallbackErr) {
        // rethrow original connectErr
      }
    }
    throw connectErr;
  }
}

async function disconnectDB() {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
}

module.exports = { connectDB, disconnectDB };
