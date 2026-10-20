const userModel = require("../models/user.model");
const membershipModel = require("../models/membership.model");

/**
 * Resolves the active workspace for the incoming authenticated request.
 * Prioritizes `X-Workspace-Id` header, then query parameter,
 * falling back to the user's `activeWorkspaceId`.
 *
 * Enforces that the user has an active membership in that workspace.
 */
async function resolveWorkspace(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: "Authentication required" });
  }

  let workspaceId = req.headers["x-workspace-id"] || req.query.workspaceId;

  if (!workspaceId) {
    const user = await userModel.findById(req.user.id);
    workspaceId = user?.activeWorkspaceId;

    if (!workspaceId) {
      // Fallback: pick the first active workspace membership for this user
      const memberships = await membershipModel.listUserWorkspaces(req.user.id);
      if (memberships.length > 0) {
        workspaceId = memberships[0].workspaceId;
        // Lazily backfill user's active workspace
        await userModel.setActiveWorkspace(req.user.id, workspaceId);
      }
    }
  }

  if (!workspaceId) {
    return res.status(400).json({
      error: "No active workspace found. Create or join a workspace first.",
    });
  }

  const membership = await membershipModel.findByUserAndWorkspace(req.user.id, workspaceId);
  if (!membership || membership.status !== "active") {
    return res.status(403).json({ error: "Access denied to requested workspace" });
  }

  req.workspaceId = workspaceId;
  req.membership = membership;
  return next();
}

module.exports = { resolveWorkspace };
