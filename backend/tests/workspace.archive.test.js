const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");
const businessProfileModel = require("../src/models/businessProfile.model");

jest.setTimeout(30000);

describe("Archiving a workspace", () => {
  const userIds = [];
  const workspaceIds = [];

  const auth = (who, workspaceId) => {
    const headers = { Authorization: `Bearer ${who.token}` };
    if (workspaceId) headers["X-Workspace-Id"] = workspaceId;
    return headers;
  };

  async function createUser(label) {
    const user = await userModel.create({ email: `arch_${label}_${Date.now()}@example.com`, name: label });
    userIds.push(user.id);
    return { user, token: createToken(user) };
  }

  async function createWorkspace(owner, name) {
    const ws = await workspaceModel.create({ name, ownerId: owner.user.id });
    workspaceIds.push(ws.id);
    await membershipModel.create({ workspaceId: ws.id, userId: owner.user.id, role: "owner", status: "active" });
    await businessProfileModel.create({ workspaceId: ws.id, offer: `${name} offer`, audience: "Locals" });
    return ws;
  }

  async function addMember(ws, who, role) {
    await membershipModel.create({ workspaceId: ws.id, userId: who.user.id, role, status: "active" });
  }

  const archive = (who, workspaceId) =>
    request(app).post("/api/v1/workspaces/current/archive").set(auth(who, workspaceId));

  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await businessProfileModel.BusinessProfile.deleteMany({ workspaceId: { $in: workspaceIds } });
    await membershipModel.Membership.deleteMany({ workspaceId: { $in: workspaceIds } });
    await workspaceModel.Workspace.deleteMany({ _id: { $in: workspaceIds } });
    await mongoose.connection.collection("users").deleteMany({ _id: { $in: userIds } });
    await teardownTestDB();
  });

  describe("by its owner", () => {
    let owner, bakery, barbers, res;

    beforeAll(async () => {
      owner = await createUser("owner");
      bakery = await createWorkspace(owner, "Rosie's Bakery");
      barbers = await createWorkspace(owner, "Kofi's Barbers");
      await userModel.setActiveWorkspace(owner.user.id, bakery.id);
      res = await archive(owner, bakery.id);
    });

    it("archives it and moves the owner to their other workspace", async () => {
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        archived: { id: bakery.id, name: "Rosie's Bakery" },
        activeWorkspaceId: barbers.id,
      });
      expect((await userModel.findById(owner.user.id)).activeWorkspaceId).toBe(barbers.id);
    });

    it("keeps the workspace and its data", async () => {
      const ws = await workspaceModel.findById(bakery.id);
      expect(ws.status).toBe("archived");
      expect(ws.archivedAt).toBeInstanceOf(Date);
      expect((await businessProfileModel.findByWorkspaceId(bakery.id)).offer).toBe("Rosie's Bakery offer");
      expect(await membershipModel.findByUserAndWorkspace(owner.user.id, bakery.id)).toBeTruthy();
    });

    it("leaves it out of the workspace list", async () => {
      const list = await request(app).get("/api/v1/workspaces").set(auth(owner));
      expect(list.body.items.map((w) => w.id)).toEqual([barbers.id]);
    });

    it("stops it being opened or switched to", async () => {
      const profile = await request(app).get("/api/v1/business-profile/profile").set(auth(owner, bakery.id));
      expect(profile.status).toBe(404);
      expect(profile.body.error).toBe("This workspace has been archived");

      const byId = await request(app).get(`/api/v1/workspaces/${bakery.id}`).set(auth(owner));
      expect(byId.status).toBe(404);

      const switched = await request(app).post(`/api/v1/workspaces/switch/${bakery.id}`).set(auth(owner));
      expect(switched.status).toBe(404);
      expect((await userModel.findById(owner.user.id)).activeWorkspaceId).toBe(barbers.id);
    });

    it("can't be archived twice", async () => {
      expect((await archive(owner, bakery.id)).status).toBe(404);
    });
  });

  it("keeps the owner's active workspace when archiving a different one", async () => {
    const owner = await createUser("keeps");
    const active = await createWorkspace(owner, "Active Shop");
    const other = await createWorkspace(owner, "Old Shop");
    await userModel.setActiveWorkspace(owner.user.id, active.id);

    const res = await archive(owner, other.id);

    expect(res.status).toBe(200);
    expect(res.body.activeWorkspaceId).toBe(active.id);
    expect((await userModel.findById(owner.user.id)).activeWorkspaceId).toBe(active.id);
  });

  it("refuses to archive the owner's only workspace", async () => {
    const owner = await createUser("only");
    const only = await createWorkspace(owner, "Only Shop");

    const res = await archive(owner, only.id);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("You can't archive your only workspace.");
    expect((await workspaceModel.findById(only.id)).status).toBe("active");
  });

  it("is owner only", async () => {
    const owner = await createUser("rbacOwner");
    const editor = await createUser("editor");
    const viewer = await createUser("viewer");
    const ws = await createWorkspace(owner, "Team Shop");
    await createWorkspace(owner, "Spare Shop");
    await addMember(ws, editor, "editor");
    await addMember(ws, viewer, "viewer");

    expect((await archive(editor, ws.id)).status).toBe(403);
    expect((await archive(viewer, ws.id)).status).toBe(403);
    expect((await workspaceModel.findById(ws.id)).status).toBe("active");
  });

  it("moves other members whose active workspace was archived to another of theirs", async () => {
    const owner = await createUser("teamOwner");
    const editor = await createUser("teamEditor");
    const shared = await createWorkspace(owner, "Shared Shop");
    await createWorkspace(owner, "Owner's Other Shop");
    const editorsOwn = await createWorkspace(editor, "Editor's Own Shop");
    await addMember(shared, editor, "editor");
    await userModel.setActiveWorkspace(editor.user.id, shared.id);

    expect((await archive(owner, shared.id)).status).toBe(200);

    // No X-Workspace-Id: the server falls back from the archived one.
    const profile = await request(app).get("/api/v1/business-profile/profile").set(auth(editor));
    expect(profile.status).toBe(200);
    expect(profile.body.workspaceId).toBe(editorsOwn.id);
    expect((await userModel.findById(editor.user.id)).activeWorkspaceId).toBe(editorsOwn.id);

    const list = await request(app).get("/api/v1/workspaces").set(auth(editor));
    expect(list.body.items.map((w) => w.id)).toEqual([editorsOwn.id]);
  });

  it("stops invitations to an archived workspace being accepted", async () => {
    const owner = await createUser("inviter");
    const invitee = await createUser("invitee");
    const ws = await createWorkspace(owner, "Closing Shop");
    await createWorkspace(owner, "Open Shop");

    const invite = await request(app)
      .post("/api/v1/workspaces/current/invitations")
      .set(auth(owner, ws.id))
      .send({ email: invitee.user.email, role: "editor" });
    expect(invite.status).toBe(201);
    const token = invite.body.inviteLink.split("token=")[1];

    expect((await archive(owner, ws.id)).status).toBe(200);

    const accepted = await request(app)
      .post("/api/v1/workspaces/invitations/accept")
      .set(auth(invitee))
      .send({ token });
    expect(accepted.status).toBe(400);
    expect(await membershipModel.findByUserAndWorkspace(invitee.user.id, ws.id)).toBeNull();
  });
});
