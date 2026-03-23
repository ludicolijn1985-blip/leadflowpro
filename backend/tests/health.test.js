import request from "supertest";
import { createApp } from "../app.js";

describe("Health", () => {
  const app = createApp();

  test("GET /health returns { status: 'ok' }", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
