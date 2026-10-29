const express = require("express");
const aiController = require("../controllers/ai.controller");
const postController = require("../controllers/post.controller");
const { requireAuth } = require("../middleware/auth");
const { resolveWorkspace } = require("../middleware/workspaceContext");
const { requireWorkspaceRole } = require("../middleware/requireWorkspaceRole");

const router = express.Router();
router.use(requireAuth, resolveWorkspace);

router.post(
  "/generate-caption",
  requireWorkspaceRole("owner", "editor"),
  aiController.generateCaption
);
router.post(
  "/suggest-hashtags",
  requireWorkspaceRole("owner", "editor"),
  aiController.suggestHashtags
);
router.post(
  "/repurpose",
  requireWorkspaceRole("owner", "editor"),
  aiController.repurposeContent
);
router.post(
  "/generate-variants",
  requireWorkspaceRole("owner", "editor"),
  postController.generateVariants
);

module.exports = router;
