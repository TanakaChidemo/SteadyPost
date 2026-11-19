const express = require("express");
const authController = require("../controllers/auth.controller");
const { requireAuth } = require("../middleware/auth");
const { resolveWorkspace } = require("../middleware/workspaceContext");
const { requirePermission } = require("../middleware/requirePermission");

// Connecting a social account attaches it to the active business: owner only (F10).
const canManageAccounts = [requireAuth, resolveWorkspace, requirePermission("accounts.manage")];

const router = express.Router();

// Local auth
router.post("/register", authController.register);
router.post("/login", authController.login);
router.get("/me", requireAuth, authController.me);
router.post("/refresh", authController.refresh);
router.post("/logout", requireAuth, authController.logout);

// Google OAuth login (sign in/sign up with Google — no existing session required)
router.get("/oauth/google", authController.startGoogleOAuth);
router.get("/oauth/google/callback", authController.handleGoogleOAuthCallback);

// Social account linking
router.post("/connect-mock", ...canManageAccounts, authController.connectMockAccount);
// The frontend completes the Meta login itself via the Facebook JS SDK
// (FB.login with a Business Login config_id) and posts the resulting User
// Access Token here — see frontend/lib/facebookSdk.js for why. Listing and
// connecting are separate steps so the user can pick which Page to use.
router.post("/oauth/meta/pages", ...canManageAccounts, authController.listMetaPages);
router.post("/oauth/meta/connect", ...canManageAccounts, authController.connectMetaPage);
router.get("/oauth/linkedin", requireAuth, authController.notImplemented);
router.get("/oauth/twitter", requireAuth, authController.notImplemented);

module.exports = router;
