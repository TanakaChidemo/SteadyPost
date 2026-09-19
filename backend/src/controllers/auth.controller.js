const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { z } = require("zod");
const userModel = require("../models/user.model");
const socialAccountModel = require("../models/socialAccount.model");
const logger = require("../config/logger");

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

const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v20.0";
const META_GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

// /me/accounts only reflects classic, personal Page roles. A Page created
// under (or added to) a Business Portfolio is "owned by" that portfolio
// instead — the person's access is a Business Manager task assignment, which
// /me/accounts never sees, even with pages_show_list granted and full
// control in the Business Suite UI. For those, Pages have to be looked up
// through the Business Portfolio itself (requires business_management).
// Returns every accessible Page (deduped by id) — the caller decides which
// one(s) to actually connect, rather than us silently picking one.
async function findAccessiblePages(accessToken) {
  const pagesById = new Map();

  const pagesRes = await fetch(
    `${META_GRAPH_API_BASE}/me/accounts?access_token=${encodeURIComponent(accessToken)}`
  );
  const pagesData = await pagesRes.json();
  logger.info({ status: pagesRes.status, pagesData }, "Meta /me/accounts response");
  if (pagesRes.ok && Array.isArray(pagesData.data)) {
    for (const page of pagesData.data) pagesById.set(page.id, page);
  }

  const businessesRes = await fetch(
    `${META_GRAPH_API_BASE}/me/businesses?access_token=${encodeURIComponent(accessToken)}`
  );
  const businessesData = await businessesRes.json();
  logger.info({ status: businessesRes.status, businessesData }, "Meta /me/businesses response");
  if (businessesRes.ok && Array.isArray(businessesData.data)) {
    for (const business of businessesData.data) {
      const ownedPagesRes = await fetch(
        `${META_GRAPH_API_BASE}/${business.id}/owned_pages?fields=id,name,category&access_token=${encodeURIComponent(accessToken)}`
      );
      const ownedPagesData = await ownedPagesRes.json();
      logger.info(
        { status: ownedPagesRes.status, businessId: business.id, ownedPagesData },
        "Meta /{business}/owned_pages response"
      );
      if (ownedPagesRes.ok && Array.isArray(ownedPagesData.data)) {
        for (const page of ownedPagesData.data) {
          if (!pagesById.has(page.id)) pagesById.set(page.id, page);
        }
      }
    }
  }

  return Array.from(pagesById.values());
}

// Facebook Login for Business's Page/asset picker only appears when the login
// is triggered through the JS SDK's FB.login({ config_id }) — a plain
// server-side redirect to the OAuth dialog never shows it. The frontend
// calls FB.login() itself and hands us the resulting User Access Token.
//
// Step 1: list every Page the token can see, so the frontend can show a
// picker instead of us guessing which one the person wants connected.
async function listMetaPages(req, res) {
  const { accessToken } = req.body;
  if (!accessToken) {
    return res.status(400).json({ error: "accessToken is required" });
  }

  try {
    const pages = await findAccessiblePages(accessToken);
    return res.json({
      pages: pages.map((page) => ({ id: page.id, name: page.name, category: page.category || null })),
    });
  } catch (err) {
    logger.error({ err: err.message }, "Meta page listing failed");
    return res.status(502).json({ error: "oauth_failed" });
  }
}

// Step 2: connect the one Page the user actually picked (plus its linked
// Instagram Business account, if any). requireAuth gives us the owner via
// the JWT, so there's no need for a signed-state round trip a redirect-based
// flow would otherwise need.
async function connectMetaPage(req, res) {
  const { accessToken, pageId } = req.body;
  if (!accessToken || !pageId) {
    return res.status(400).json({ error: "accessToken and pageId are required" });
  }

  try {
    const pageRes = await fetch(
      `${META_GRAPH_API_BASE}/${pageId}?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(accessToken)}`
    );
    const page = await pageRes.json();
    logger.info({ status: pageRes.status, pageId: page.id }, "Meta Page connect lookup");
    if (!pageRes.ok || !page.access_token) {
      return res.status(422).json({ error: "no_facebook_page_found" });
    }

    await socialAccountModel.create({
      ownerId: req.user.id,
      platform: "facebook",
      externalAccountId: page.id,
      displayName: page.name || "Connected Facebook Page",
      accessToken: page.access_token,
    });

    const igAccount = page.instagram_business_account;
    if (igAccount) {
      await socialAccountModel.create({
        ownerId: req.user.id,
        platform: "instagram",
        externalAccountId: igAccount.id,
        displayName: igAccount.username ? `@${igAccount.username}` : "Connected Instagram Account",
        accessToken: page.access_token,
      });
    }

    return res.json({ connected: igAccount ? ["facebook", "instagram"] : ["facebook"] });
  } catch (err) {
    logger.error({ err: err.message }, "Meta Page connect failed");
    return res.status(502).json({ error: "oauth_failed" });
  }
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
  listMetaPages,
  connectMetaPage,
  connectMockAccount,
  notImplemented,
};
