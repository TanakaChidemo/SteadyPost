const express = require("express");

const authRoutes = require("./auth.routes");
const contentRoutes = require("./content.routes");
const aiRoutes = require("./ai.routes");
const publishRoutes = require("./publish.routes");
const socialAccountRoutes = require("./socialAccounts.routes");
const websiteRoutes = require("./website.routes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/content", contentRoutes);
router.use("/ai", aiRoutes);
router.use("/publish", publishRoutes);
router.use("/social-accounts", socialAccountRoutes);
router.use("/website", websiteRoutes);

module.exports = router;
