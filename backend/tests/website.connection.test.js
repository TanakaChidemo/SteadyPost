const mongoose = require("mongoose");
const request = require("supertest");

jest.mock("../src/services/website/fetchPage", () => {
  const actual = jest.requireActual("../src/services/website/fetchPage");
  return { ...actual, fetchPage: jest.fn() };
});

const { fetchPage, WebsiteFetchError } = require("../src/services/website/fetchPage");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");
const websiteConnectionModel = require("../src/models/websiteConnection.model");
const businessProfileModel = require("../src/models/businessProfile.model");

jest.setTimeout(30000);

const bakeryPage = (name, extra = "") => ({
  url: "https://rosies.example/",
  html: `<script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Bakery","name":"${name}",
     "address":{"@type":"PostalAddress","streetAddress":"12 Market Street","addressLocality":"Leeds"}${extra}}
  </script>
  <link rel="alternate" type="application/rss+xml" href="/blog/feed.xml">`,
});

async function createMember(label, workspaceId, role) {
  const user = await userModel.create({ email: `web_${label}_${Date.now()}@example.com`, name: label });
  await userModel.setActiveWorkspace(user.id, workspaceId);
  await membershipModel.create({ workspaceId, userId: user.id, role, status: "active", joinedAt: new Date() });
  return { user, token: createToken({ ...user, activeWorkspaceId: workspaceId }) };
}

describe("Website connection per workspace (F24 #03.1)", () => {
  let wsA, wsB, ownerA, viewerA, ownerB;
  const userIds = [];

  const connect = (who, body, workspaceId) => {
    const req = request(app).put("/api/v1/website/connection").set("Authorization", `Bearer ${who.token}`);
    if (workspaceId) req.set("X-Workspace-Id", workspaceId);
    return req.send(body);
  };
  const read = (who, workspaceId) => {
    const req = request(app).get("/api/v1/website/connection").set("Authorization", `Bearer ${who.token}`);
    if (workspaceId) req.set("X-Workspace-Id", workspaceId);
    return req;
  };

  beforeAll(async () => {
    await setupTestDB();
    const ownerAUser = await userModel.create({ email: `web_ownerA_${Date.now()}@example.com`, name: "Owner A" });
    const ownerBUser = await userModel.create({ email: `web_ownerB_${Date.now()}@example.com`, name: "Owner B" });
    wsA = await workspaceModel.create({ name: "Alpha Bakery", ownerId: ownerAUser.id });
    wsB = await workspaceModel.create({ name: "Beta Barbers", ownerId: ownerBUser.id });

    for (const [user, ws] of [
      [ownerAUser, wsA],
      [ownerBUser, wsB],
    ]) {
      await userModel.setActiveWorkspace(user.id, ws.id);
      await membershipModel.create({ workspaceId: ws.id, userId: user.id, role: "owner", status: "active" });
    }
    ownerA = { user: ownerAUser, token: createToken({ ...ownerAUser, activeWorkspaceId: wsA.id }) };
    ownerB = { user: ownerBUser, token: createToken({ ...ownerBUser, activeWorkspaceId: wsB.id }) };
    viewerA = await createMember("viewerA", wsA.id, "viewer");
    userIds.push(ownerAUser.id, ownerBUser.id, viewerA.user.id);
  });

  afterEach(() => fetchPage.mockReset());

  afterAll(async () => {
    const workspaceIds = [wsA.id, wsB.id];
    await websiteConnectionModel.WebsiteConnection.deleteMany({ workspaceId: { $in: workspaceIds } });
    await membershipModel.Membership.deleteMany({ workspaceId: { $in: workspaceIds } });
    await workspaceModel.Workspace.deleteMany({ _id: { $in: workspaceIds } });
    await mongoose.connection.collection("users").deleteMany({ _id: { $in: userIds } });
    await teardownTestDB();
  });

  it("returns 404 before any website is connected", async () => {
    const res = await read(ownerA);
    expect(res.status).toBe(404);
  });

  it("connects a website and saves the extracted fields to the workspace", async () => {
    fetchPage.mockResolvedValue(bakeryPage("Rosie's Bakery", ',"description":"Cakes baked fresh every morning."'));

    const res = await connect(ownerA, { url: "rosies.example" });

    expect(res.status).toBe(200);
    expect(fetchPage).toHaveBeenCalledWith("rosies.example");
    expect(res.body).toMatchObject({
      workspaceId: wsA.id,
      url: "https://rosies.example/",
      found: true,
      fields: {
        name: "Rosie's Bakery",
        description: "Cakes baked fresh every morning.",
        address: { streetAddress: "12 Market Street", locality: "Leeds" },
        contentFeedUrl: "https://rosies.example/blog/feed.xml",
      },
      sources: { name: "json-ld", description: "json-ld", address: "json-ld", contentFeedUrl: "html" },
    });
    expect(new Date(res.body.lastSyncedTime).getTime()).not.toBeNaN();

    const saved = await read(ownerA);
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual(res.body);
  });

  it("never changes the workspace's name or profile, even when the site's name differs", async () => {
    // Decided 2026-10-22: the site's name is only ever offered as a suggestion.
    expect((await workspaceModel.findById(wsA.id)).name).toBe("Alpha Bakery");
    expect(await businessProfileModel.findByWorkspaceId(wsA.id)).toBeNull();
  });

  it("re-running connect refreshes the same connection instead of adding another", async () => {
    const before = (await read(ownerA)).body;
    fetchPage.mockResolvedValue(bakeryPage("Rosie's Bakehouse"));

    const res = await connect(ownerA, { url: "rosies.example" });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(before.id);
    expect(res.body.fields.name).toBe("Rosie's Bakehouse");
    expect(new Date(res.body.lastSyncedTime) >= new Date(before.lastSyncedTime)).toBe(true);
    expect(await websiteConnectionModel.WebsiteConnection.countDocuments({ workspaceId: wsA.id })).toBe(1);
  });

  it("keeps the saved connection when a refresh fails", async () => {
    fetchPage.mockRejectedValue(new WebsiteFetchError("TIMEOUT", "The website took too long to respond"));

    const res = await connect(ownerA, { url: "rosies.example" });

    expect(res.status).toBe(504);
    expect((await read(ownerA)).body.fields.name).toBe("Rosie's Bakehouse");
  });

  it("rejects a missing url without fetching", async () => {
    const res = await connect(ownerA, {});
    expect(res.status).toBe(400);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("lets a viewer read the connection but not change it", async () => {
    expect((await read(viewerA)).status).toBe(200);

    const res = await connect(viewerA, { url: "elsewhere.example" });
    expect(res.status).toBe(403);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  describe("workspace isolation", () => {
    it("workspace B cannot read workspace A's connection", async () => {
      const res = await read(ownerB, wsA.id);
      expect(res.status).toBe(403);
      expect(res.body.fields).toBeUndefined();
    });

    it("workspace B cannot change workspace A's connection", async () => {
      fetchPage.mockResolvedValue(bakeryPage("Hijacked"));

      const res = await connect(ownerB, { url: "evil.example" }, wsA.id);

      expect(res.status).toBe(403);
      expect(fetchPage).not.toHaveBeenCalled();
      expect((await read(ownerA)).body.fields.name).toBe("Rosie's Bakehouse");
    });

    it("workspace B's own connection is separate from A's", async () => {
      expect((await read(ownerB)).status).toBe(404);

      fetchPage.mockResolvedValue({ url: "https://beta.example/", html: "<p>no markup</p>" });
      const res = await connect(ownerB, { url: "beta.example" });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ workspaceId: wsB.id, found: false, fields: { name: null } });
      expect((await read(ownerA)).body.fields.name).toBe("Rosie's Bakehouse");
    });
  });
});
