const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");

const routes = require("./routes");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "steadypost-backend", timestamp: new Date().toISOString() });
});

// OpenAPI docs (served from ../../docs/openapi.yaml)
try {
  const openapiPath = path.join(__dirname, "../../docs/openapi.yaml");
  const openapiDocument = YAML.load(openapiPath);
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapiDocument));
} catch (err) {
  // OpenAPI spec optional at boot; log and continue.
  // eslint-disable-next-line no-console
  console.warn("OpenAPI spec not loaded:", err.message);
}

app.use("/api/v1", routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
