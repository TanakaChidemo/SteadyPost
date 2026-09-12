const mongoose = require("mongoose");
const logger = require("./logger");

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Copy backend/.env.example to backend/.env and set MONGODB_URI to your MongoDB Atlas connection string."
    );
  }

  mongoose.connection.on("error", (err) => {
    logger.error({ err }, "MongoDB connection error");
  });

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  logger.info("Connected to MongoDB");
}

module.exports = { connectDB };
