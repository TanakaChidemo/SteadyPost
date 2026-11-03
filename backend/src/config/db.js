const mongoose = require("mongoose");
const logger = require("./logger");

let mongod = null;

async function connectDB() {
  let uri = process.env.MONGODB_URI;

  if (uri === "memory") {
    try {
      const { MongoMemoryServer } = require("mongodb-memory-server");
      logger.info("Starting in-memory MongoDB server (opt-in MONGODB_URI=memory)...");
      mongod = await MongoMemoryServer.create();
      uri = mongod.getUri();
      logger.info({ uri }, "In-memory MongoDB server started");
    } catch (memErr) {
      throw new Error(
        "MONGODB_URI=memory was specified, but mongodb-memory-server failed to start: " +
          memErr.message
      );
    }
  }

  if (!uri) {
    throw new Error(
      "MONGODB_URI environment variable is not defined. Please set MONGODB_URI or use MONGODB_URI=memory for opt-in local testing."
    );
  }

  mongoose.connection.on("error", (err) => {
    logger.error({ err }, "MongoDB connection error");
  });

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  logger.info("Connected to MongoDB");
}

async function disconnectDB() {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
}

module.exports = { connectDB, disconnectDB };
