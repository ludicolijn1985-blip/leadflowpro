import { config } from "../config.js";
import { appError } from "../lib/errors.js";
import { logInfo, logWarn, logError } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { stripe } from "../lib/stripe.js";
import { isCuidLike } from "../lib/validation.js";

const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "invoice.payment_succeeded"
]);

// 🔥 DEFINITIEVE IDEMPOTENCY FIX (GEEN DB ERRORS MEER)
async function markEventProcessed(eventId) {
  const existing = await prisma.webhookEvent.findUnique({
    where: { id: eventId }
  });

  if (existing) {
    return false; // duplicate → niets doen
  }

  await prisma.webhookEvent.create({
    data: { id: eventId }
  });

  return true;
}

async function upgradeUserToProById(userId) {
  if (!userId) return;

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      role: "PRO",
      trialEnd: null
    }
  });

  if (user.referredBy) {
    await prisma.referralEarning.create({
      data: {
        referrerId: user.referredBy,
        referredUserId: user.id,
        amount: 5,
        currency: "EUR"
      }
    });
  }
}

async function upgradeUserToProByCustomer(customerId) {
  if (!customerId) return;

  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId }
  });

  if (!user) return;

  await upgradeUserToProById(user.id);
}

export async function createCheckoutSession(req, res, next) {
  try {
    if (!isCuidLike(req.user.id)) {
      return next(appError(400, "Invalid user context for billing", "BILLING_INVALID_USER"));
    }

    const coupon = req.body?.coupon ? String(req.body.coupon).trim() : "";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      success_url: `${config.frontendUrl}/dashboard?upgrade=success`,
      cancel_url: `${config.frontendUrl}/dashboard?upgrade=cancelled`,
      client_reference_id: req.user.id,
      customer_email: req.user.email,
      metadata: { userId: req.user.id },
      discounts: coupon ? [{ coupon }] : undefined,
      line_items: [
        {
          quantity: 1,
          price: config.stripePriceId
        }
      ]
    });

    if (!session.url) {
      return next(appError(502, "Failed to create checkout session", "BILLING_SESSION_FAILED"));
    }

    return res.json({ url: session.url });
  } catch (error) {
    error.status = error.status || 502;
    error.code = error.code || "BILLING_STRIPE_ERROR";
    return next(error);
  }
}

export async function handleStripeWebhook(req, res, next) {
  try {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      return next(appError(400, "Missing Stripe signature", "BILLING_MISSING_SIGNATURE"));
    }

    const event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      config.stripeWebhookSecret
    );

    logInfo("Stripe webhook received", {
      eventId: event.id,
      eventType: event.type
    });

    if (!HANDLED_EVENTS.has(event.type)) {
      return res.json({ received: true, ignored: true });
    }

    const shouldProcess = await markEventProcessed(event.id);

    if (!shouldProcess) {
      logWarn("Duplicate webhook skipped", {
        eventId: event.id,
        eventType: event.type
      });

      return res.json({ received: true, duplicate: true });
    }

    // 🔥 EVENT HANDLING
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const userId =
        session.metadata?.userId ||
        session.client_reference_id;

      if (userId) {
        await upgradeUserToProById(userId);
      }

      if (userId && session.customer) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            stripeCustomerId: String(session.customer)
          }
        });
      }

      logInfo("User upgraded from checkout", {
        eventId: event.id,
        userId
      });
    }

    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;

      const customerId = invoice.customer
        ? String(invoice.customer)
        : "";

      await upgradeUserToProByCustomer(customerId);

      const user = await prisma.user.findFirst({
        where: { stripeCustomerId: customerId }
      });

      if (user) {
        await prisma.invoiceRecord.create({
          data: {
            userId: user.id,
            stripeId: String(invoice.id),
            amount: Number(invoice.amount_paid || 0) / 100,
            currency: String(invoice.currency || "eur")
          }
        });
      }

      logInfo("Invoice processed", {
        eventId: event.id,
        customerId
      });
    }

    return res.json({ received: true });
  } catch (error) {
    if (error.type && error.type.startsWith("Stripe")) {
      return next(
        appError(400, "Invalid Stripe webhook payload", "BILLING_WEBHOOK_INVALID")
      );
    }

    logError("Webhook processing failed", {
      error: error.message
    });

    error.status = error.status || 500;
    error.code = error.code || "BILLING_WEBHOOK_ERROR";

    return next(error);
  }
}

export async function listBillingHistory(req, res, next) {
  try {
    const [invoices, earnings] = await Promise.all([
      prisma.invoiceRecord.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" }
      }),
      prisma.referralEarning.findMany({
        where: { referrerId: req.user.id },
        orderBy: { createdAt: "desc" }
      })
    ]);

    return res.json({
      invoices,
      referralEarnings: earnings
    });
  } catch (error) {
    return next(error);
  }
}