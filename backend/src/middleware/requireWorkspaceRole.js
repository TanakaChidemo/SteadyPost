/**
 * Role-based access control guard scoped to the workspace membership.
 *
 * @param  {...string} allowedRoles - E.g. 'owner', 'editor', 'viewer'
 */
function requireWorkspaceRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.membership || !allowedRoles.includes(req.membership.role)) {
      return res.status(403).json({
        error: `Insufficient workspace permissions. Requires one of roles: ${allowedRoles.join(", ")}`,
      });
    }
    return next();
  };
}

module.exports = { requireWorkspaceRole };
