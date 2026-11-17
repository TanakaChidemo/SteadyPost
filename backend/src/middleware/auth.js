const jwt = require("jsonwebtoken");

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "changeme_access_secret";

function userFromToken(token) {
  const secret = process.env.JWT_ACCESS_SECRET || JWT_ACCESS_SECRET;
  const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
  return {
    id: payload.sub,
    email: payload.email,
    role: payload.role || "member",
    activeWorkspaceId: payload.activeWorkspaceId || null,
  };
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  try {
    req.user = userFromToken(header.split(" ")[1]);
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * For routes that also work signed out: with no Authorization header,
 * `req.user` stays unset. A token that's sent must still be valid (401
 * otherwise), so the app refreshes it rather than being treated as signed out.
 */
function optionalAuth(req, res, next) {
  if (!req.headers.authorization) return next();
  return requireAuth(req, res, next);
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    return next();
  };
}

module.exports = { requireAuth, optionalAuth, requireRole };
