const express = require("express");
const authController = require("../controllers/auth.controller");
const { requireAuth } = require("../middleware/auth");

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
router.post("/connect-mock", requireAuth, authController.connectMockAccount);
// The frontend completes the Meta login itself via the Facebook JS SDK
// (FB.login with a Business Login config_id) and posts the resulting User
// Access Token here — see frontend/lib/facebookSdk.js for why. Listing and
// connecting are separate steps so the user can pick which Page to use.
router.post("/oauth/meta/pages", requireAuth, authController.listMetaPages);
router.post("/oauth/meta/connect", requireAuth, authController.connectMetaPage);
router.get("/oauth/linkedin", requireAuth, authController.notImplemented);
router.get("/oauth/twitter", requireAuth, authController.notImplemented);

module.exports = router;
