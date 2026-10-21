const express = require("express");

const authRoutes = require("./auth.routes");
const contentRoutes = require("./content.routes");
const aiRoutes = require("./ai.routes");
const publishRoutes = require("./publish.routes");
const socialAccountRoutes = require("./socialAccounts.routes");
const workspaceRoutes = require("./workspace.routes");
const businessProfileRoutes = require("./businessProfile.routes");
const postRoutes = require("./post.routes");
const opportunityRoutes = require("./opportunity.routes");
const websiteRoutes = require("./website.routes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/workspaces", workspaceRoutes);
router.use("/business-profile", businessProfileRoutes);
router.use("/posts", postRoutes);
router.use("/opportunities", opportunityRoutes);
router.use("/content", contentRoutes);
router.use("/ai", aiRoutes);
router.use("/publish", publishRoutes);
router.use("/social-accounts", socialAccountRoutes);
router.use("/website", websiteRoutes);

module.exports = router;
