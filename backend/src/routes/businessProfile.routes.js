const express = require("express");
const controller = require("../controllers/businessProfile.controller");
const { requireAuth } = require("../middleware/auth");
const { resolveWorkspace } = require("../middleware/workspaceContext");
const { requireWorkspaceRole } = require("../middleware/requireWorkspaceRole");

const router = express.Router();
router.use(requireAuth, resolveWorkspace);

router.get("/profile", controller.getProfile);
router.put("/profile", requireWorkspaceRole("owner", "editor"), controller.updateProfile);

router.get("/notifications", controller.getNotificationSettings);
router.put("/notifications", requireWorkspaceRole("owner"), controller.updateNotificationSettings);

module.exports = router;
