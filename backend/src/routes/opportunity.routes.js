const express = require("express");
const controller = require("../controllers/opportunity.controller");
const { requireAuth } = require("../middleware/auth");
const { resolveWorkspace } = require("../middleware/workspaceContext");
const { requirePermission } = require("../middleware/requirePermission");

const router = express.Router();
router.use(requireAuth, resolveWorkspace);

router.get("/", controller.list);
router.get("/:id", controller.getById);
router.post("/:id/respond", requirePermission("opportunity.respond"), controller.respond);
router.post("/:id/convert-draft", requirePermission("post.write"), controller.convertToDraft);

module.exports = router;
