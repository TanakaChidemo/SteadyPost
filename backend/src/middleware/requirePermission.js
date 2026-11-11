const { can, refusalMessage } = require("../auth/permissions");

/**
 * Allows the request only if the member's role may take `action` in the
 * workspace resolved by `resolveWorkspace` (see auth/permissions.js).
 */
function requirePermission(action) {
  can("owner", action); // fail at startup on a misspelt action, not on first request
  return (req, res, next) => {
    if (!req.membership || !can(req.membership.role, action)) {
      return res.status(403).json({ error: refusalMessage(action), code: "FORBIDDEN" });
    }
    return next();
  };
}

module.exports = { requirePermission };
