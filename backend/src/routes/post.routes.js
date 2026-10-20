const express = require("express");
const controller = require("../controllers/post.controller");
const { requireAuth } = require("../middleware/auth");
const { resolveWorkspace } = require("../middleware/workspaceContext");
const { requireWorkspaceRole } = require("../middleware/requireWorkspaceRole");

const router = express.Router();
router.use(requireAuth, resolveWorkspace);

router.get("/", controller.list);
router.post("/", requireWorkspaceRole("owner", "editor"), controller.create);
router.get("/:id", controller.getById);
router.put("/:id", requireWorkspaceRole("owner", "editor"), controller.update);
router.post("/:id/submit-approval", requireWorkspaceRole("owner", "editor"), controller.submitApproval);
router.post("/:id/approve", requireWorkspaceRole("owner"), controller.approve);
router.post("/:id/request-changes", requireWorkspaceRole("owner"), controller.requestChanges);
router.post("/:id/publish-now", requireWorkspaceRole("owner", "editor"), controller.publishNow);
router.delete("/:id", requireWorkspaceRole("owner"), controller.deletePost);

module.exports = router;
