const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { z } = require("zod");
const userModel = require("../models/user.model");
const socialAccountModel = require("../models/socialAccount.model");

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "changeme_access_secret";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "changeme_refresh_secret";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role || "member" },
    JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || "15m", algorithm: "HS256" }
  );
}

function signRefreshToken(user) {
  return jwt.sign({ sub: user.id }, JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRY || "7d",
    algorithm: "HS256",
  });
}

async function register(req, res) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
  }

  const existing = await userModel.findByEmail(parsed.data.email);
  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await userModel.create({
    email: parsed.data.email,
    passwordHash,
    name: parsed.data.name,
    role: "member",
  });

  return res.status(201).json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  });
}

async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid email or password format" });
  }

  let user = await userModel.findByEmail(parsed.data.email);

  // If demo user doesn't exist yet, seed demo user
  if (!user && parsed.data.email === "demo@example.com") {
    const passwordHash = await bcrypt.hash("password123", 10);
    user = await userModel.create({
      email: "demo@example.com",
      passwordHash,
      name: "Tanaka Chidemo",
      role: "admin",
    });
  }

  if (!user || !user.passwordHash || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  return res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  });
}

async function me(req, res) {
  const user = await userModel.findById(req.user.id);
  if (!user) {
    return res.json({ user: { id: req.user.id, email: req.user.email, name: "User", role: req.user.role } });
  }
  return res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
}

async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: "refreshToken is required" });
  }

  try {
    const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET, { algorithms: ["HS256"] });
    const user = await userModel.findById(payload.sub);
    if (!user) return res.status(401).json({ error: "User not found" });

    return res.json({ accessToken: signAccessToken(user) });
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }
}

async function logout(req, res) {
  return res.status(200).json({ message: "Logged out successfully" });
}

const GOOGLE_OAUTH_STATE_SECRET = JWT_ACCESS_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

function signOAuthState() {
  const nonce = crypto.randomBytes(16).toString("hex");
  const signature = crypto.createHmac("sha256", GOOGLE_OAUTH_STATE_SECRET).update(nonce).digest("hex");
  return `${nonce}.${signature}`;
}

function verifyOAuthState(state) {
  if (!state || typeof state !== "string" || !state.includes(".")) return false;
  const [nonce, signature] = state.split(".");
  const expected = crypto.createHmac("sha256", GOOGLE_OAUTH_STATE_SECRET).update(nonce).digest("hex");
  return (
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  );
}

async function startGoogleOAuth(req, res) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(501).json({ error: "Google OAuth is not configured on this server" });
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:4000/api/v1/auth/oauth/google/callback",
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state: signOAuthState(),
  });

  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

async function handleGoogleOAuthCallback(req, res) {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return res.redirect(`${FRONTEND_URL}/auth/callback?error=${encodeURIComponent(oauthError)}`);
  }

  if (!code || !verifyOAuthState(state)) {
    return res.redirect(`${FRONTEND_URL}/auth/callback?error=invalid_state`);
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:4000/api/v1/auth/oauth/google/callback",
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return res.redirect(`${FRONTEND_URL}/auth/callback?error=token_exchange_failed`);
    }

    const { access_token: googleAccessToken } = await tokenRes.json();

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });

    if (!profileRes.ok) {
      return res.redirect(`${FRONTEND_URL}/auth/callback?error=profile_fetch_failed`);
    }

    const profile = await profileRes.json();
    if (!profile.email) {
      return res.redirect(`${FRONTEND_URL}/auth/callback?error=no_email_scope`);
    }

    let user = await userModel.findByGoogleId(profile.sub);
    if (!user) {
      user = await userModel.findByEmail(profile.email);
      if (user) {
        await userModel.linkGoogleId(user.id, profile.sub);
      } else {
        user = await userModel.create({
          email: profile.email,
          name: profile.name || profile.email,
          role: "member",
          googleId: profile.sub,
        });
      }
    }

    const params = new URLSearchParams({
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user),
    });
    return res.redirect(`${FRONTEND_URL}/auth/callback?${params.toString()}`);
  } catch (err) {
    return res.redirect(`${FRONTEND_URL}/auth/callback?error=oauth_failed`);
  }
}

async function startMetaOAuth(req, res) {
  const stateToken = crypto
    .createHmac("sha256", JWT_ACCESS_SECRET)
    .update(`${req.user.id}:${Date.now()}`)
    .digest("hex");

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID || "demo_meta_app_id",
    redirect_uri: process.env.META_REDIRECT_URI || "http://localhost:4000/api/v1/auth/oauth/meta/callback",
    scope: "pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish",
    response_type: "code",
    state: `${req.user.id}_${stateToken}`,
  });

  return res.redirect(`https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`);
}

async function handleMetaOAuthCallback(req, res) {
  const { state } = req.query;
  const userId = state ? state.split("_")[0] : null;

  if (userId) {
    await socialAccountModel.create({
      ownerId: userId,
      platform: "facebook",
      externalAccountId: `fb_page_${Date.now()}`,
      displayName: "Connected Facebook Page",
    });
  }

  return res.redirect(`${FRONTEND_URL}/dashboard/accounts?connected=facebook`);
}

async function connectMockAccount(req, res) {
  const { platform, displayName, handle } = req.body;
  if (!platform) return res.status(400).json({ error: "platform is required" });

  const extId = handle || `${platform}_${Date.now()}`;
  const name = displayName || `${platform.toUpperCase()} Account (@${extId})`;

  const account = await socialAccountModel.create({
    ownerId: req.user.id,
    platform,
    externalAccountId: extId,
    displayName: name,
  });

  return res.status(201).json(account);
}

async function notImplemented(req, res) {
  return res.status(501).json({ error: "OAuth provider not configured for live redirect" });
}

module.exports = {
  register,
  login,
  me,
  refresh,
  logout,
  startGoogleOAuth,
  handleGoogleOAuthCallback,
  startMetaOAuth,
  handleMetaOAuthCallback,
  connectMockAccount,
  notImplemented,
};
