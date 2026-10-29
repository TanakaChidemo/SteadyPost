const userModel = require("../models/user.model");
const membershipModel = require("../models/membership.model");
const workspaceModel = require("../models/workspace.model");

/** The first workspace the user is an active member of that isn't archived. */
async function firstActiveWorkspaceId(userId) {
  const memberships = await membershipModel.listUserWorkspaces(userId);
  const [first] = await workspaceModel.filterActiveIds(memberships.map((m) => m.workspaceId));
  return first || null;
}

/**
 * Resolves the active workspace for the incoming authenticated request.
 * Prioritizes `X-Workspace-Id` header, then query parameter,
 * falling back to the user's `activeWorkspaceId`.
 *
 * Enforces that the user has an active membership in that workspace and that
 * it isn't archived. If the user's saved active workspace has been archived,
 * another of their workspaces is used instead.
 */
async function resolveWorkspace(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const requested = req.headers["x-workspace-id"] || req.query.workspaceId;
  let workspaceId = requested;

  if (!workspaceId) {
    const user = await userModel.findById(req.user.id);
    workspaceId = user?.activeWorkspaceId;

    if (workspaceId && (await workspaceModel.filterActiveIds([workspaceId])).length === 0) {
      workspaceId = null; // archived since it was made active
    }

    if (!workspaceId) {
      // Fallback: pick the first active workspace membership for this user
      workspaceId = await firstActiveWorkspaceId(req.user.id);
      if (workspaceId) {
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

  if (requested && (await workspaceModel.filterActiveIds([workspaceId])).length === 0) {
    return res.status(404).json({ error: "This workspace has been archived" });
  }

  req.workspaceId = workspaceId;
  req.membership = membership;
  return next();
}

module.exports = { resolveWorkspace, firstActiveWorkspaceId };
