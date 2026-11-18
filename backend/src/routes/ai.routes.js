const express = require("express");
const aiController = require("../controllers/ai.controller");
const postController = require("../controllers/post.controller");
const { requireAuth } = require("../middleware/auth");
const { resolveWorkspace } = require("../middleware/workspaceContext");
const { requirePermission } = require("../middleware/requirePermission");

const router = express.Router();
router.use(requireAuth, resolveWorkspace);

router.post(
  "/generate-caption",
  requirePermission("ai.use"),
  aiController.generateCaption
);
router.post(
  "/suggest-hashtags",
  requirePermission("ai.use"),
  aiController.suggestHashtags
);
router.post(
  "/repurpose",
  requirePermission("ai.use"),
  aiController.repurposeContent
);
router.post(
  "/generate-variants",
  requirePermission("ai.use"),
  postController.generateVariants
);

module.exports = router;
