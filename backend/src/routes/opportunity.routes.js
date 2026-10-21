const express = require("express");
const controller = require("../controllers/opportunity.controller");
const { requireAuth } = require("../middleware/auth");
const { resolveWorkspace } = require("../middleware/workspaceContext");
const { requireWorkspaceRole } = require("../middleware/requireWorkspaceRole");

const router = express.Router();
router.use(requireAuth, resolveWorkspace);

router.get("/", controller.list);
router.get("/:id", controller.getById);
router.post("/:id/respond", requireWorkspaceRole("owner", "editor"), controller.respond);
router.post("/:id/convert-draft", requireWorkspaceRole("owner", "editor"), controller.convertToDraft);

module.exports = router;
