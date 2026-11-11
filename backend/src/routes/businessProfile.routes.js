const express = require("express");
const controller = require("../controllers/businessProfile.controller");
const { requireAuth } = require("../middleware/auth");
const { resolveWorkspace } = require("../middleware/workspaceContext");
const { requirePermission } = require("../middleware/requirePermission");

const router = express.Router();
router.use(requireAuth, resolveWorkspace);

router.get("/profile", controller.getProfile);
router.put("/profile", requirePermission("profile.update"), controller.updateProfile);

router.get("/notifications", controller.getNotificationSettings);
router.put("/notifications", requirePermission("workspace.manage"), controller.updateNotificationSettings);

module.exports = router;
