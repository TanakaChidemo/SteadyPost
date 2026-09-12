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
router.get("/oauth/meta", requireAuth, authController.startMetaOAuth);
router.get("/oauth/meta/callback", authController.handleMetaOAuthCallback);
router.get("/oauth/linkedin", requireAuth, authController.notImplemented);
router.get("/oauth/twitter", requireAuth, authController.notImplemented);

module.exports = router;
