const express = require("express");
const publishController = require("../controllers/publish.controller");
const { requireAuth } = require("../middleware/auth");
const { resolveWorkspace } = require("../middleware/workspaceContext");
const { requireWorkspaceRole } = require("../middleware/requireWorkspaceRole");

const router = express.Router();
router.use(requireAuth);

// Only the owner publishes (F10): editors submit for approval instead.
router.post("/now", resolveWorkspace, requireWorkspaceRole("owner"), publishController.publishNow);
router.get("/status/:scheduledPostId", publishController.getStatus);

module.exports = router;
