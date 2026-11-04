const express = require("express");
const publishController = require("../controllers/publish.controller");
const { requireAuth } = require("../middleware/auth");
const { resolveWorkspace } = require("../middleware/workspaceContext");
const { requirePermission } = require("../middleware/requirePermission");

const router = express.Router();
router.use(requireAuth);

// Only the owner publishes (F10): editors submit for approval instead.
router.post("/now", resolveWorkspace, requirePermission("post.publish"), publishController.publishNow);
router.get("/status/:scheduledPostId", publishController.getStatus);

module.exports = router;
