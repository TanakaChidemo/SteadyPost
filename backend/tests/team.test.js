const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");
const invitationModel = require("../src/models/invitation.model");

jest.setTimeout(30000);

// F10 (#07): anyone on SteadyPost can be added to someone else's business with an invite link.
describe("Teams and invite links", () => {
  const userIds = [];
  const workspaceIds = [];
  let rosie, bakery;

  async function signUp(name) {
    const user = await userModel.create({ email: `team_${name.toLowerCase()}_${Date.now()}_${userIds.length}@example.com`, name });
    userIds.push(user.id);
    const ws = await workspaceModel.create({ name: `${name}'s Business`, ownerId: user.id });
    workspaceIds.push(ws.id);
    await membershipModel.create({ workspaceId: ws.id, userId: user.id, role: "owner", status: "active" });
    await userModel.setActiveWorkspace(user.id, ws.id);
    return { user, own: ws, token: createToken(user) };
  }

  const api = (who, ws) => {
    const headers = { Authorization: `Bearer ${who.token}` };
    if (ws) headers["X-Workspace-Id"] = ws.id;
    return headers;
  };
  const tokenOf = (link) => decodeURIComponent(link.split("token=")[1]);

  async function inviteLink(role = "editor", label = "") {
    const res = await request(app).post("/api/v1/workspaces/current/invitations").set(api(rosie, bakery)).send({ role, label });
    expect(res.status).toBe(201);
    return res.body.inviteLink;
  }
  const accept = (who, link) =>
    request(app).post("/api/v1/workspaces/invitations/accept").set(api(who)).send({ token: tokenOf(link) });
  const roleIn = async (who, ws) => (await membershipModel.findByUserAndWorkspace(who.user.id, ws.id))?.role || null;

  beforeAll(async () => {
    await setupTestDB();
    rosie = await signUp("Rosie");
    bakery = rosie.own;
  });

  afterAll(async () => {
    await invitationModel.Invitation.deleteMany({ workspaceId: { $in: workspaceIds } });
    await membershipModel.Membership.deleteMany({ workspaceId: { $in: workspaceIds } });
    await workspaceModel.Workspace.deleteMany({ _id: { $in: workspaceIds } });
    await mongoose.connection.collection("users").deleteMany({ _id: { $in: userIds } });
    await teardownTestDB();
  });

  it("adds someone with their own business to the team, keeping their business theirs", async () => {
    const sam = await signUp("Sam");
    const link = await inviteLink("editor", "Sam");

    const preview = await request(app).get(`/api/v1/workspaces/invitations/${encodeURIComponent(tokenOf(link))}`).set(api(sam));
    expect(preview.body).toEqual({ workspaceName: "Rosie's Business", ownerName: "Rosie", role: "editor", alreadyMember: false });

    const res = await accept(sam, link);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ workspaceId: bakery.id, role: "editor" });

    const list = (await request(app).get("/api/v1/workspaces").set(api(sam))).body.items;
    expect(list.map((w) => [w.name, w.role, w.ownerName])).toEqual(
      expect.arrayContaining([
        ["Sam's Business", "owner", "Sam"],
        ["Rosie's Business", "editor", "Rosie"],
      ])
    );
    expect(list.find((w) => w.role === "editor").permissions).toContain("post.submit");
    expect(list.find((w) => w.role === "editor").permissions).not.toContain("post.publish");
  });

  it("lets several invite links be open at once", async () => {
    const links = await Promise.all([inviteLink("viewer"), inviteLink("viewer"), inviteLink("editor")]);
    expect(new Set(links).size).toBe(3);
  });

  it("only lets a link be used once, even by two people at the same moment", async () => {
    const [ama, ben] = [await signUp("Ama"), await signUp("Ben")];
    const link = await inviteLink("viewer");
    const results = await Promise.all([accept(ama, link), accept(ben, link)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect([await roleIn(ama, bakery), await roleIn(ben, bakery)].filter(Boolean)).toEqual(["viewer"]);

    const late = await signUp("Late");
    expect((await accept(late, link)).status).toBe(400);
  });

  it("refuses expired and cancelled links", async () => {
    const expired = await inviteLink();
    await invitationModel.Invitation.updateOne({ tokenHash: invitationModel.hashToken(tokenOf(expired)) }, { expiresAt: new Date(Date.now() - 1000) });

    const cancelled = await inviteLink();
    const pending = (await request(app).get("/api/v1/workspaces/current/members").set(api(rosie, bakery))).body.invitations;
    const toCancel = (await invitationModel.Invitation.findOne({ tokenHash: invitationModel.hashToken(tokenOf(cancelled)) }).lean())._id;
    expect(pending.some((i) => i.id === toCancel)).toBe(true);
    expect((await request(app).delete(`/api/v1/workspaces/current/invitations/${toCancel}`).set(api(rosie, bakery))).status).toBe(204);

    const kim = await signUp("Kim");
    expect((await accept(kim, expired)).status).toBe(400);
    expect((await accept(kim, cancelled)).status).toBe(400);
    expect(await roleIn(kim, bakery)).toBeNull();
  });

  it("tells a member they're already on the team, without using up the link", async () => {
    const lee = await signUp("Lee");
    await accept(lee, await inviteLink("viewer"));
    const second = await inviteLink("editor");
    const res = await accept(lee, second);
    expect(res.status).toBe(409);
    expect(await roleIn(lee, bakery)).toBe("viewer");
    expect((await invitationModel.findUsable(tokenOf(second))) !== null).toBe(true);
  });

  it("never shows invite tokens, and only shows pending invites to the owner", async () => {
    const viewer = await signUp("Vee");
    await accept(viewer, await inviteLink("viewer"));
    await inviteLink("editor");

    const asOwner = await request(app).get("/api/v1/workspaces/current/members").set(api(rosie, bakery));
    const asViewer = await request(app).get("/api/v1/workspaces/current/members").set(api(viewer, bakery));
    expect(asOwner.body.invitations.length).toBeGreaterThan(0);
    expect(asViewer.body.invitations).toEqual([]);
    expect(asViewer.body.members.find((m) => m.isYou)).toMatchObject({ name: "Vee", role: "viewer" });
    expect(JSON.stringify([asOwner.body, asViewer.body])).not.toMatch(/token/i);
  });

  it("lets the owner change a role and remove someone, but not touch the owner", async () => {
    const zoe = await signUp("Zoe");
    await accept(zoe, await inviteLink("editor"));
    const members = (await request(app).get("/api/v1/workspaces/current/members").set(api(rosie, bakery))).body.members;
    const zoeId = members.find((m) => m.name === "Zoe").id;
    const ownerId = members.find((m) => m.role === "owner").id;

    const asEditor = await request(app).patch(`/api/v1/workspaces/current/members/${zoeId}`).set(api(zoe, bakery)).send({ role: "viewer" });
    expect(asEditor.status).toBe(403);

    expect((await request(app).patch(`/api/v1/workspaces/current/members/${zoeId}`).set(api(rosie, bakery)).send({ role: "viewer" })).status).toBe(200);
    expect(await roleIn(zoe, bakery)).toBe("viewer");
    expect((await request(app).patch(`/api/v1/workspaces/current/members/${ownerId}`).set(api(rosie, bakery)).send({ role: "viewer" })).status).toBe(400);
    expect((await request(app).patch(`/api/v1/workspaces/current/members/${zoeId}`).set(api(rosie, bakery)).send({ role: "owner" })).status).toBe(400);

    expect((await request(app).delete(`/api/v1/workspaces/current/members/${zoeId}`).set(api(rosie, bakery))).status).toBe(204);
    expect((await request(app).get("/api/v1/posts").set(api(zoe, bakery))).status).toBe(403);
  });

  it("lets a removed member come back with a new link", async () => {
    const max = await signUp("Max");
    await accept(max, await inviteLink("editor"));
    const memberId = (await membershipModel.findByUserAndWorkspace(max.user.id, bakery.id)).id;
    await request(app).delete(`/api/v1/workspaces/current/members/${memberId}`).set(api(rosie, bakery));

    const res = await accept(max, await inviteLink("viewer"));
    expect(res.status).toBe(200);
    expect(await roleIn(max, bakery)).toBe("viewer");
    expect(await membershipModel.Membership.countDocuments({ workspaceId: bakery.id, userId: max.user.id })).toBe(1);
  });

  it("lets a member leave a team and moves them back to their own business", async () => {
    const pat = await signUp("Pat");
    await accept(pat, await inviteLink("editor"));
    const res = await request(app).post("/api/v1/workspaces/current/leave").set(api(pat, bakery));
    expect(res.status).toBe(200);
    expect(res.body.activeWorkspaceId).toBe(pat.own.id);
    expect(await roleIn(pat, bakery)).toBeNull();

    const ownerLeaves = await request(app).post("/api/v1/workspaces/current/leave").set(api(rosie, bakery));
    expect(ownerLeaves.status).toBe(400);
  });

  it("refuses links to a business that was archived", async () => {
    const owner = await signUp("Arch");
    await workspaceModel.create({ name: "Arch spare", ownerId: owner.user.id }).then(async (ws) => {
      workspaceIds.push(ws.id);
      await membershipModel.create({ workspaceId: ws.id, userId: owner.user.id, role: "owner", status: "active" });
    });
    const res = await request(app).post("/api/v1/workspaces/current/invitations").set(api(owner, owner.own)).send({ role: "viewer" });
    await request(app).post("/api/v1/workspaces/current/archive").set(api(owner, owner.own));

    const guest = await signUp("Guest");
    expect((await accept(guest, res.body.inviteLink)).status).toBe(400);
  });
});
