const express = require("express");
const controller = require("../controllers/channelSetup.controller");
const { requireAuth } = require("../middleware/auth");
const { resolveWorkspace } = require("../middleware/workspaceContext");
const { requirePermission } = require("../middleware/requirePermission");

const router = express.Router();
router.use(requireAuth, resolveWorkspace);

router.get("/guides", requirePermission("workspace.read"), controller.getGuides);
router.get("/progress", requirePermission("workspace.read"), controller.getProgress);
router.put("/progress/:platform", requirePermission("accounts.manage"), controller.updateProgress);
router.post("/check/:platform", requirePermission("accounts.manage"), controller.checkPlatform);

module.exports = router;
