const socialAccountModel = require("../models/socialAccount.model");

/**
 * Validates that a social account belongs to the requester's workspace.
 * Fixes the publishing ownership vulnerability where accounts could be queued cross-tenant.
 *
 * @param {Object} params
 * @param {string} params.socialAccountId - Social account ID to check
 * @param {string} params.workspaceId - Active workspace ID from request
 * @param {string} params.userId - Authenticated user ID
 * @returns {Promise<Object>} The verified social account
 * @throws {Error} with status 404 if account not found, or 403 if ownership does not match
 */
async function validateAccountWorkspaceOwnership({ socialAccountId, workspaceId, userId }) {
  if (!socialAccountId) {
    return null;
  }

  const account = await socialAccountModel.findById(socialAccountId);
  if (!account) {
    const error = new Error("Social account not found");
    error.status = 404;
    throw error;
  }

  // Account must match the active workspace.
  // If account has no workspaceId (legacy seeded account), check if ownerId matches.
  const isWorkspaceMatch = Boolean(workspaceId && account.workspaceId && account.workspaceId === workspaceId);
  const isOwnerFallbackMatch = Boolean(!account.workspaceId && userId && account.ownerId === userId);

  if (!isWorkspaceMatch && !isOwnerFallbackMatch) {
    const error = new Error("Chosen social account does not belong to the requester's workspace");
    error.status = 403;
    throw error;
  }

  return account;
}

module.exports = {
  validateAccountWorkspaceOwnership,
};
