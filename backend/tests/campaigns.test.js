import { jest } from "@jest/globals";
import request from "supertest";
import { createApp } from "../app.js";
import * as mailer from "../lib/mailer.js";
import { registerUser } from "./helpers.js";

describe("Campaigns", () => {
  const app = createApp();

  test("create campaign", async () => {
    const { response: reg } = await registerUser(app);
    const token = reg.body.token;

    const response = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Welcome", subject: "Hi", body: "<p>Hello</p>" });

    expect(response.status).toBe(201);
    expect(response.body.subject).toBe("Hi");
  });

  test("send campaign", async () => {
    const sendSpy = jest.spyOn(mailer, "sendBulkEmail").mockResolvedValue({ sent: 1, failed: 0 });

    const { response: reg } = await registerUser(app);
    const token = reg.body.token;

    await request(app)
      .post("/api/leads")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Lead", email: "lead@example.com", status: "NEW" });

    const campaign = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Offer", subject: "Promo", body: "<p>Promo</p>" });

    const response = await request(app)
      .post(`/api/campaigns/${campaign.body.id}/send`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sent: 1, failed: 0 });
    expect(sendSpy).toHaveBeenCalledTimes(1);

    sendSpy.mockRestore();
  });
});
