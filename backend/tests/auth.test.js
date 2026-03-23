import request from "supertest";
import { createApp } from "../app.js";
import { loginUser, registerUser } from "./helpers.js";

describe("Auth", () => {
  const app = createApp();

  test("register creates user", async () => {
    const { response } = await registerUser(app);

    expect(response.status).toBe(201);
    expect(response.body.token).toBeTruthy();
    expect(response.body.user.email).toBeTruthy();
    expect(response.body.user.role).toBe("FREE");
    expect(response.body.user.referralCode).toBeTruthy();
  });

  test("login returns JWT", async () => {
    const { payload } = await registerUser(app);
    const loginResponse = await loginUser(app, payload.email, payload.password);

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.token).toBeTruthy();
    expect(loginResponse.body.user.email).toBe(payload.email.toLowerCase());
  });

  test("invalid login fails", async () => {
    const { payload } = await registerUser(app);
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: payload.email,
      password: "wrong-password"
    });

    expect(loginResponse.status).toBe(401);
    expect(loginResponse.body.error).toBe(true);
  });
});
