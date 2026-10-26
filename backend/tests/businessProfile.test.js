const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");
const businessProfileModel = require("../src/models/businessProfile.model");
const notificationSettingsModel = require("../src/models/notificationSettings.model");

jest.setTimeout(30000);

describe("Business profile validation and onboarding (F01 #04)", () => {
  let ws, owner, viewer;
  const userIds = [];
  const workspaceIds = [];

  const auth = (who) => ({ Authorization: `Bearer ${who.token}` });
  const getProfile = (who) => request(app).get("/api/v1/business-profile/profile").set(auth(who));
  const putProfile = (who, body) => request(app).put("/api/v1/business-profile/profile").set(auth(who)).send(body);
  const createWorkspace = (who, body) => request(app).post("/api/v1/workspaces").set(auth(who)).send(body);

  async function createMember(label, workspaceId, role) {
    const user = await userModel.create({ email: `bp_${label}_${Date.now()}@example.com`, name: label });
    await userModel.setActiveWorkspace(user.id, workspaceId);
    await membershipModel.create({ workspaceId, userId: user.id, role, status: "active", joinedAt: new Date() });
    userIds.push(user.id);
    return { user, token: createToken({ ...user, activeWorkspaceId: workspaceId }) };
  }

  beforeAll(async () => {
    await setupTestDB();
    const ownerUser = await userModel.create({ email: `bp_owner_${Date.now()}@example.com`, name: "Owner" });
    ws = await workspaceModel.create({ name: "Rosie's Bakery", ownerId: ownerUser.id });
    workspaceIds.push(ws.id);
    await userModel.setActiveWorkspace(ownerUser.id, ws.id);
    await membershipModel.create({ workspaceId: ws.id, userId: ownerUser.id, role: "owner", status: "active" });
    userIds.push(ownerUser.id);
    owner = { user: ownerUser, token: createToken({ ...ownerUser, activeWorkspaceId: ws.id }) };
    viewer = await createMember("viewer", ws.id, "viewer");
  });

  afterAll(async () => {
    const created = await membershipModel.Membership.find({ userId: owner.user.id }).lean();
    workspaceIds.push(...created.map((m) => m.workspaceId));
    await businessProfileModel.BusinessProfile.deleteMany({ workspaceId: { $in: workspaceIds } });
    await notificationSettingsModel.NotificationSettings.deleteMany({ workspaceId: { $in: workspaceIds } });
    await membershipModel.Membership.deleteMany({ workspaceId: { $in: workspaceIds } });
    await workspaceModel.Workspace.deleteMany({ _id: { $in: workspaceIds } });
    await mongoose.connection.collection("users").deleteMany({ _id: { $in: userIds } });
    await teardownTestDB();
  });

  it("creates an empty profile on first read that still needs onboarding", async () => {
    const res = await getProfile(owner);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ workspaceId: ws.id, name: "Rosie's Bakery", onboardingComplete: false });
    expect(res.body.onboardingCompletedAt).toBeNull();
  });

  it("saves valid fields, trimming text and keeping the name on the workspace", async () => {
    const res = await putProfile(owner, {
      name: "  Rosie's Bakery & Cafe ",
      businessType: "Bakery",
      offer: "  Celebration cakes and sourdough. ",
      audience: "Local families",
      location: { city: "Leeds", country: "GB" },
      tone: ["casual", "playful"],
      goals: ["community_growth"],
      activeChannels: ["instagram"],
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: "Rosie's Bakery & Cafe",
      offer: "Celebration cakes and sourdough.",
      location: { city: "Leeds", region: "", country: "GB", serviceArea: "" },
      tone: ["casual", "playful"],
      activeChannels: ["instagram"],
    });
    expect((await workspaceModel.findById(ws.id)).name).toBe("Rosie's Bakery & Cafe");
  });

  it("leaves fields that aren't sent unchanged", async () => {
    const res = await putProfile(owner, { audience: "Local families and offices" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ businessType: "Bakery", audience: "Local families and offices" });
  });

  it("removes repeated tones, goals and channels", async () => {
    const res = await putProfile(owner, { tone: ["bold", "bold"], activeChannels: ["facebook", "facebook"] });
    expect(res.status).toBe(200);
    expect(res.body.tone).toEqual(["bold"]);
    expect(res.body.activeChannels).toEqual(["facebook"]);
  });

  it.each([
    ["an unknown tone", { tone: ["sarcastic"] }],
    ["an unknown goal", { goals: ["world_domination"] }],
    ["an unknown channel", { activeChannels: ["myspace"] }],
    ["tone as a string", { tone: "casual" }],
    ["an offer over 500 characters", { offer: "x".repeat(501) }],
    ["a name over 80 characters", { name: "x".repeat(81) }],
    ["a non-string audience", { audience: 42 }],
    ["a location that isn't an object", { location: "Leeds" }],
    ["onboardingCompleted set to false", { onboardingCompleted: false }],
  ])("rejects %s and saves nothing", async (_label, body) => {
    const before = await businessProfileModel.findByWorkspaceId(ws.id);
    const res = await putProfile(owner, { businessType: "Changed", ...body });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect((await businessProfileModel.findByWorkspaceId(ws.id)).businessType).toBe(before.businessType);
  });

  it("ignores fields that aren't part of the profile, including another workspace id", async () => {
    const res = await putProfile(owner, { workspaceId: "ws_someone_else", onboardingCompletedAt: "2020-01-01" });
    expect(res.status).toBe(200);
    expect(res.body.workspaceId).toBe(ws.id);
    expect(res.body.onboardingCompletedAt).toBeNull();
  });

  it("doesn't let a viewer change the profile", async () => {
    const res = await putProfile(viewer, { offer: "Hijacked" });
    expect(res.status).toBe(403);
  });

  it("marks onboarding complete when the wizard finishes", async () => {
    const res = await putProfile(owner, { onboardingCompleted: true });
    expect(res.status).toBe(200);
    expect(res.body.onboardingComplete).toBe(true);
    expect(new Date(res.body.onboardingCompletedAt).getTime()).toBeGreaterThan(Date.now() - 60000);

    const list = await request(app).get("/api/v1/workspaces").set(auth(owner));
    expect(list.body.items.find((w) => w.id === ws.id).onboardingComplete).toBe(true);
  });

  it("treats a profile filled in before the wizard existed as onboarded", () => {
    expect(businessProfileModel.isOnboardingComplete({ offer: "Cakes", audience: "Locals" })).toBe(true);
    expect(businessProfileModel.isOnboardingComplete({ offer: "Cakes", audience: "" })).toBe(false);
    expect(businessProfileModel.isOnboardingComplete(null)).toBe(false);
  });

  describe("creating a workspace with its profile", () => {
    it("saves every onboarding field and can mark onboarding complete", async () => {
      const res = await createWorkspace(owner, {
        name: "Kofi's Barbers",
        businessType: "Barber",
        websiteUrl: "https://kofis.example",
        offer: "Fades and beard trims",
        audience: "Students",
        location: { city: "Manchester", serviceArea: "City centre" },
        tone: ["bold"],
        goals: ["lead_generation"],
        activeChannels: ["instagram", "facebook"],
        onboardingCompleted: true,
      });

      expect(res.status).toBe(201);
      expect(res.body.workspace.name).toBe("Kofi's Barbers");
      expect(res.body.profile).toMatchObject({
        location: { city: "Manchester", serviceArea: "City centre", country: "" },
        tone: ["bold"],
        activeChannels: ["instagram", "facebook"],
      });
      expect(res.body.profile.onboardingCompletedAt).not.toBeNull();
    });

    it("starts a workspace created without finishing onboarding as not onboarded", async () => {
      const res = await createWorkspace(owner, { name: "Half Done Ltd" });
      expect(res.status).toBe(201);
      expect(businessProfileModel.isOnboardingComplete(res.body.profile)).toBe(false);
    });

    it("rejects invalid profile fields without creating the workspace", async () => {
      const name = `Invalid Co ${Date.now()}`;
      const res = await createWorkspace(owner, { name, tone: ["sarcastic"] });
      expect(res.status).toBe(400);
      expect(await workspaceModel.findOne({ name })).toBeNull();
    });
  });
});
