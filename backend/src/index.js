require("dotenv").config();
require("express-async-errors");

const http = require("http");
const app = require("./app");
const logger = require("./config/logger");
const { connectDB } = require("./config/db");
const { seedDemoData } = require("./data/seed");
const { initQueues } = require("./queue");

const PORT = process.env.PORT || 4000;

async function start() {
  await connectDB();
  await seedDemoData();
  await initQueues();

  const server = http.createServer(app);
  server.listen(PORT, () => {
    logger.info(`smp-backend listening on port ${PORT}`);
  });

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
