const express = require("express");
const controller = require("../controllers/workspace.controller");
const { requireAuth } = require("../middleware/auth");
const { resolveWorkspace } = require("../middleware/workspaceContext");
const { requireWorkspaceRole } = require("../middleware/requireWorkspaceRole");

const router = express.Router();
router.use(requireAuth);

router.get("/", controller.list);
router.post("/", controller.create);
router.post("/switch/:id", controller.switchWorkspace);
router.post("/invitations/accept", controller.acceptInvitation);

router.get("/current", resolveWorkspace, (req, res) => {
  return controller.getById(req, res);
});

router.put("/current", resolveWorkspace, requireWorkspaceRole("owner"), controller.update);
router.post("/current/archive", resolveWorkspace, requireWorkspaceRole("owner"), controller.archive);
router.get("/current/members", resolveWorkspace, controller.listMembers);
router.post("/current/invitations", resolveWorkspace, requireWorkspaceRole("owner"), controller.inviteMember);
router.delete(
  "/current/members/:memberId",
  resolveWorkspace,
  requireWorkspaceRole("owner"),
  controller.removeMember
);

router.get("/:id", controller.getById);

module.exports = router;
