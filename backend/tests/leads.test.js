import request from "supertest";
import { createApp } from "../app.js";
import { registerUser } from "./helpers.js";

describe("Leads", () => {
  const app = createApp();

  test("protected routes reject missing token", async () => {
    const response = await request(app).get("/api/leads");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe(true);
  });

  test("accept valid token and create/get leads", async () => {
    const { response: reg } = await registerUser(app);
    const token = reg.body.token;

    const createResponse = await request(app)
      .post("/api/leads")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Alice", email: "alice@example.com", status: "NEW" });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.name).toBe("Alice");

    const listResponse = await request(app).get("/api/leads").set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0].email).toBe("alice@example.com");
  });

  test("enforce FREE limit (5)", async () => {
    const { response: reg } = await registerUser(app);
    const token = reg.body.token;

    for (let i = 1; i <= 5; i += 1) {
      const response = await request(app)
        .post("/api/leads")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: `Lead ${i}`, email: `lead${i}@example.com`, status: "NEW" });
      expect(response.status).toBe(201);
    }

    const blocked = await request(app)
      .post("/api/leads")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Lead 6", email: "lead6@example.com", status: "NEW" });

    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe(true);
  });

  test("ownership enforced", async () => {
    const { response: ownerReg } = await registerUser(app);
    const ownerToken = ownerReg.body.token;

    const { response: otherReg } = await registerUser(app);
    const otherToken = otherReg.body.token;

    const created = await request(app)
      .post("/api/leads")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Private Lead", email: "private@example.com", status: "NEW" });

    const leadId = created.body.id;

    const forbiddenDelete = await request(app)
      .delete(`/api/leads/${leadId}`)
      .set("Authorization", `Bearer ${otherToken}`);

    expect(forbiddenDelete.status).toBe(404);
    expect(forbiddenDelete.body.error).toBe(true);
  });
});
