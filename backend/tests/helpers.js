import request from "supertest";

let counter = 0;

export function uniqueEmail() {
  counter += 1;
  return `user${Date.now()}_${counter}@example.com`;
}

export async function registerUser(app, overrides = {}) {
  const payload = {
    email: uniqueEmail(),
    password: "password123",
    ...overrides
  };

  const response = await request(app).post("/api/auth/register").send(payload);
  return { response, payload };
}

export async function loginUser(app, email, password = "password123") {
  return request(app).post("/api/auth/login").send({ email, password });
}
