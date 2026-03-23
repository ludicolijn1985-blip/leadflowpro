import { jest } from "@jest/globals";

const stripeMock = {
  checkout: {
    sessions: {
      create: jest.fn()
    }
  },
  webhooks: {
    constructEvent: jest.fn()
  }
};

jest.unstable_mockModule("../lib/stripe.js", () => ({
  stripe: stripeMock
}));

const request = (await import("supertest")).default;
const { createApp } = await import("../app.js");
const { prisma } = await import("../lib/prisma.js");
const { registerUser } = await import("./helpers.js");

describe("Billing", () => {
  const app = createApp();

  test("create checkout session", async () => {
    stripeMock.checkout.sessions.create.mockResolvedValueOnce({ url: "https://checkout.stripe.test/session_1" });

    const { response: reg } = await registerUser(app);
    const token = reg.body.token;

    const response = await request(app)
      .post("/api/billing/checkout-session")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.url).toBe("https://checkout.stripe.test/session_1");
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  test("webhook handling upgrades user and prevents duplicate processing", async () => {
    const { response: reg } = await registerUser(app);
    const userId = reg.body.user.id;

    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: "evt_test_unique_1",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { userId },
          client_reference_id: userId,
          customer: "cus_123"
        }
      }
    });

    const payload = JSON.stringify({ test: true });
    const first = await request(app)
      .post("/api/billing/webhook")
      .set("stripe-signature", "t=123,v1=abc")
      .set("Content-Type", "application/json")
      .send(payload);

    expect(first.status).toBe(200);
    expect(first.body.received).toBe(true);

    const userAfterFirst = await prisma.user.findUnique({ where: { id: userId } });
    expect(userAfterFirst.role).toBe("PRO");

    const second = await request(app)
      .post("/api/billing/webhook")
      .set("stripe-signature", "t=123,v1=abc")
      .set("Content-Type", "application/json")
      .send(payload);

    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
  });
});
