import request from "supertest";
import { createApp } from "../app.js";
import { registerUser } from "./helpers.js";

describe("CSV Import", () => {
  const app = createApp();

  test("upload CSV", async () => {
    const { response: reg } = await registerUser(app);
    const token = reg.body.token;
    const csv = "name,email,status\nAlice,alice@example.com,NEW\nBob,bob@example.com,CONTACTED\n";

    const response = await request(app)
      .post("/api/import/csv")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from(csv), "leads.csv");

    expect(response.status).toBe(201);
    expect(response.body.imported).toBe(2);
  });

  test("reject invalid CSV", async () => {
    const { response: reg } = await registerUser(app);
    const token = reg.body.token;
    const invalidCsv = "fullname,mail\nAlice,alice@example.com\n";

    const response = await request(app)
      .post("/api/import/csv")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from(invalidCsv), "invalid.csv");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(true);
  });

  test("enforce limits", async () => {
    const { response: reg } = await registerUser(app);
    const token = reg.body.token;

    for (let i = 0; i < 4; i += 1) {
      await request(app)
        .post("/api/leads")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: `Lead ${i}`, email: `lead_${i}@example.com`, status: "NEW" });
    }

    const csv = "name,email,status\nA,a@example.com,NEW\nB,b@example.com,NEW\n";

    const response = await request(app)
      .post("/api/import/csv")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from(csv), "overflow.csv");

    expect(response.status).toBe(403);
    expect(response.body.error).toBe(true);
  });
});
