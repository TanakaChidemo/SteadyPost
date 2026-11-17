const express = require("express");
const controller = require("../controllers/workspace.controller");
const team = require("../controllers/team.controller");
const { requireAuth, optionalAuth } = require("../middleware/auth");
const { resolveWorkspace } = require("../middleware/workspaceContext");
const { requirePermission } = require("../middleware/requirePermission");

const router = express.Router();

// An invite link shows whose team it's for before you sign in, so a new
// invitee knows what they're signing up to (F10).
router.get("/invitations/:token", optionalAuth, team.previewInvitation);

router.use(requireAuth);

router.get("/", controller.list);
router.post("/", controller.create);
router.post("/switch/:id", controller.switchWorkspace);
router.post("/invitations/accept", team.acceptInvitation);

router.get("/current", resolveWorkspace, (req, res) => {
  return controller.getById(req, res);
});

router.put("/current", resolveWorkspace, requirePermission("workspace.manage"), controller.update);
router.post("/current/archive", resolveWorkspace, requirePermission("workspace.manage"), controller.archive);
router.get("/current/members", resolveWorkspace, requirePermission("members.read"), team.listMembers);
router.post("/current/invitations", resolveWorkspace, requirePermission("members.manage"), team.invite);
router.delete(
  "/current/invitations/:invitationId",
  resolveWorkspace,
  requirePermission("members.manage"),
  team.revokeInvitation
);
router.patch("/current/members/:memberId", resolveWorkspace, requirePermission("members.manage"), team.changeRole);
router.delete("/current/members/:memberId", resolveWorkspace, requirePermission("members.manage"), team.removeMember);
router.post("/current/leave", resolveWorkspace, team.leave);

router.get("/:id", controller.getById);

module.exports = router;
