const express = require("express");
const controller = require("../controllers/post.controller");
const { requireAuth } = require("../middleware/auth");
const { resolveWorkspace } = require("../middleware/workspaceContext");
const { requirePermission } = require("../middleware/requirePermission");

const router = express.Router();
router.use(requireAuth, resolveWorkspace);

router.get("/", controller.list);
router.post("/", requirePermission("post.write"), controller.create);
router.get("/top-performing", controller.getTopPerforming);
router.post("/generate-variants", requirePermission("post.write"), controller.generateVariants);
router.post("/batch-create", requirePermission("post.write"), controller.batchCreate);
router.post("/publish-approved", requirePermission("post.publish"), controller.publishApproved);
router.get("/:id", controller.getById);
router.put("/:id", requirePermission("post.write"), controller.update);
router.post("/:id/repurpose", requirePermission("post.write"), controller.repurposePost);
router.post("/:id/submit-approval", requirePermission("post.submit"), controller.submitApproval);
router.post("/:id/approve", requirePermission("post.review"), controller.approve);
router.post("/:id/request-changes", requirePermission("post.review"), controller.requestChanges);
router.post("/:id/reject", requirePermission("post.review"), controller.reject);
router.post("/:id/publish-now", requirePermission("post.publish"), controller.publishNow);
router.delete("/:id", requirePermission("post.delete"), controller.deletePost);

module.exports = router;
