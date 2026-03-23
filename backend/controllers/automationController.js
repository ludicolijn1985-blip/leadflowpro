import { prisma } from "../lib/prisma.js";
import { appError } from "../lib/errors.js";
import { isCuidLike, isValidUrl, sanitizeJsonObject, sanitizeText } from "../lib/validation.js";

export async function listWorkflows(req, res, next) {
  try {
    const workflows = await prisma.workflow.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" }
    });
    return res.json(workflows);
  } catch (error) {
    return next(error);
  }
}

export async function createWorkflow(req, res, next) {
  try {
    const name = sanitizeText(req.body.name, 100);
    const trigger = sanitizeText(req.body.trigger, 100);
    const action = sanitizeText(req.body.action, 100);
    const config = sanitizeJsonObject(req.body.config);

    if (!name || !trigger || !action) {
      return next(appError(400, "Workflow name, trigger, and action are required", "WORKFLOW_VALIDATION_ERROR"));
    }

    const workflow = await prisma.workflow.create({
      data: {
        userId: req.user.id,
        name,
        trigger,
        action,
        config
      }
    });

    return res.status(201).json(workflow);
  } catch (error) {
    return next(error);
  }
}

export async function listDrips(req, res, next) {
  try {
    const sequences = await prisma.dripSequence.findMany({
      where: { userId: req.user.id },
      include: { steps: { orderBy: { stepOrder: "asc" } } },
      orderBy: { createdAt: "desc" }
    });
    return res.json(sequences);
  } catch (error) {
    return next(error);
  }
}

export async function createDrip(req, res, next) {
  try {
    const name = sanitizeText(req.body.name, 100);
    if (!name) {
      return next(appError(400, "Drip sequence name is required", "DRIP_VALIDATION_ERROR"));
    }

    const sequence = await prisma.dripSequence.create({
      data: {
        userId: req.user.id,
        name,
        status: "DRAFT"
      }
    });

    return res.status(201).json(sequence);
  } catch (error) {
    return next(error);
  }
}

export async function addDripStep(req, res, next) {
  try {
    const sequenceId = req.params.id;
    const stepOrder = Number(req.body.stepOrder);
    const delayDays = Number(req.body.delayDays || 0);
    const emailBody = sanitizeText(req.body.emailBody, 10000);
    const campaignId = sanitizeText(req.body.campaignId, 40) || null;

    if (!isCuidLike(sequenceId) || !Number.isInteger(stepOrder) || stepOrder < 1) {
      return next(appError(400, "Invalid drip step payload", "DRIP_STEP_VALIDATION_ERROR"));
    }

    const sequence = await prisma.dripSequence.findUnique({ where: { id: sequenceId } });
    if (!sequence || sequence.userId !== req.user.id) {
      return next(appError(404, "Drip sequence not found", "DRIP_NOT_FOUND"));
    }

    if (campaignId) {
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
      if (!campaign || campaign.userId !== req.user.id) {
        return next(appError(400, "Invalid campaign for drip step", "DRIP_STEP_INVALID_CAMPAIGN"));
      }
    }

    const step = await prisma.dripStep.create({
      data: {
        sequenceId,
        stepOrder,
        delayDays: Number.isFinite(delayDays) ? delayDays : 0,
        emailBody: emailBody || null,
        campaignId
      }
    });

    return res.status(201).json(step);
  } catch (error) {
    return next(error);
  }
}

export async function listWebhooks(req, res, next) {
  try {
    const hooks = await prisma.outgoingWebhook.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" }
    });
    return res.json(hooks);
  } catch (error) {
    return next(error);
  }
}

export async function createWebhook(req, res, next) {
  try {
    const name = sanitizeText(req.body.name, 100);
    const endpoint = sanitizeText(req.body.endpoint, 400);
    const secret = sanitizeText(req.body.secret, 200);
    const events = Array.isArray(req.body.events) ? req.body.events.map((event) => sanitizeText(event, 80)).filter(Boolean) : [];

    if (!name || !endpoint || !isValidUrl(endpoint)) {
      return next(appError(400, "Valid webhook name and endpoint are required", "WEBHOOK_VALIDATION_ERROR"));
    }

    const hook = await prisma.outgoingWebhook.create({
      data: {
        userId: req.user.id,
        name,
        endpoint,
        secret: secret || null,
        events
      }
    });

    return res.status(201).json(hook);
  } catch (error) {
    return next(error);
  }
}
