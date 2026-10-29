const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");
const businessProfileModel = require("../src/models/businessProfile.model");

jest.setTimeout(30000);

describe("Business profile per workspace (F01 #04.1)", () => {
  let wsA, wsB, ownerA, ownerB;
  const userIds = [];

  const auth = (who, workspaceId) => {
    const headers = { Authorization: `Bearer ${who.token}` };
    if (workspaceId) headers["X-Workspace-Id"] = workspaceId;
    return headers;
  };

  async function createOwner(label, workspaceName) {
    const user = await userModel.create({ email: `bpi_${label}_${Date.now()}@example.com`, name: label });
    const ws = await workspaceModel.create({ name: workspaceName, ownerId: user.id });
    await userModel.setActiveWorkspace(user.id, ws.id);
    await membershipModel.create({ workspaceId: ws.id, userId: user.id, role: "owner", status: "active" });
    userIds.push(user.id);
    return { ws, who: { user, token: createToken({ ...user, activeWorkspaceId: ws.id }) } };
  }

  beforeAll(async () => {
    await setupTestDB();
    await businessProfileModel.BusinessProfile.init(); // build the unique index before testing it
    ({ ws: wsA, who: ownerA } = await createOwner("ownerA", "Alpha Bakery"));
    ({ ws: wsB, who: ownerB } = await createOwner("ownerB", "Beta Barbers"));
    await request(app)
      .put("/api/v1/business-profile/profile")
      .set(auth(ownerA))
      .send({ offer: "Alpha's secret recipes", audience: "Alpha customers" });
  });

  afterAll(async () => {
    const workspaceIds = [wsA.id, wsB.id];
    await businessProfileModel.BusinessProfile.deleteMany({ workspaceId: { $in: workspaceIds } });
    await membershipModel.Membership.deleteMany({ workspaceId: { $in: workspaceIds } });
    await workspaceModel.Workspace.deleteMany({ _id: { $in: workspaceIds } });
    await mongoose.connection.collection("users").deleteMany({ _id: { $in: userIds } });
    await teardownTestDB();
  });

  it("allows only one profile per workspace", async () => {
    await expect(businessProfileModel.create({ workspaceId: wsA.id, offer: "A second profile" })).rejects.toThrow(
      /duplicate key/
    );
    expect(await businessProfileModel.BusinessProfile.countDocuments({ workspaceId: wsA.id })).toBe(1);
  });

  it("updating a profile changes the existing one instead of adding another", async () => {
    await request(app).put("/api/v1/business-profile/profile").set(auth(ownerA)).send({ businessType: "Bakery" });
    expect(await businessProfileModel.BusinessProfile.countDocuments({ workspaceId: wsA.id })).toBe(1);
  });

  it("workspace B can't read workspace A's profile", async () => {
    const res = await request(app).get("/api/v1/business-profile/profile").set(auth(ownerB, wsA.id));
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain("secret recipes");
  });

  it("workspace B can't change workspace A's profile", async () => {
    const res = await request(app)
      .put("/api/v1/business-profile/profile")
      .set(auth(ownerB, wsA.id))
      .send({ offer: "Hijacked", name: "Hijacked" });

    expect(res.status).toBe(403);
    expect((await businessProfileModel.findByWorkspaceId(wsA.id)).offer).toBe("Alpha's secret recipes");
    expect((await workspaceModel.findById(wsA.id)).name).toBe("Alpha Bakery");
  });

  it("each workspace reads its own profile", async () => {
    const a = await request(app).get("/api/v1/business-profile/profile").set(auth(ownerA));
    const b = await request(app).get("/api/v1/business-profile/profile").set(auth(ownerB));

    expect(a.body).toMatchObject({ workspaceId: wsA.id, name: "Alpha Bakery", offer: "Alpha's secret recipes" });
    expect(b.body).toMatchObject({ workspaceId: wsB.id, name: "Beta Barbers", offer: "" });
  });
});
