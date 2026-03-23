import { prisma } from "../lib/prisma.js";
import { appError } from "../lib/errors.js";
import { isCuidLike, safeDate, sanitizeText } from "../lib/validation.js";
import { writeActivity, writeAuditLog } from "../lib/audit.js";

export async function listTasks(req, res, next) {
  try {
    const tasks = await prisma.task.findMany({
      where: { userId: req.user.id },
      include: { lead: true, creator: { select: { id: true, email: true } } },
      orderBy: { createdAt: "desc" }
    });
    return res.json(tasks);
  } catch (error) {
    return next(error);
  }
}

export async function createTask(req, res, next) {
  try {
    const title = sanitizeText(req.body.title, 140);
    const description = sanitizeText(req.body.description, 2000);
    const leadId = sanitizeText(req.body.leadId, 40) || null;
    const assigneeId = sanitizeText(req.body.userId, 40) || req.user.id;
    const dueDate = safeDate(req.body.dueDate);
    const reminderAt = safeDate(req.body.reminderAt);

    if (!title) {
      return next(appError(400, "Task title is required", "TASK_VALIDATION_ERROR"));
    }

    if (!isCuidLike(assigneeId)) {
      return next(appError(400, "Invalid assignee id", "TASK_INVALID_ASSIGNEE"));
    }

    const assignee = await prisma.user.findUnique({ where: { id: assigneeId } });
    if (!assignee) {
      return next(appError(404, "Assignee not found", "TASK_ASSIGNEE_NOT_FOUND"));
    }

    if (leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead || lead.userId !== req.user.id) {
        return next(appError(400, "Invalid lead for task", "TASK_INVALID_LEAD"));
      }
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        dueDate,
        reminderAt,
        leadId,
        userId: assignee.id,
        createdBy: req.user.id
      }
    });

    await writeActivity({ userId: req.user.id, type: "task.created", message: `Task ${title} created`, leadId });
    await writeAuditLog({ userId: req.user.id, action: "task.create", resource: task.id, metadata: { assigneeId } });
    return res.status(201).json(task);
  } catch (error) {
    return next(error);
  }
}

export async function updateTask(req, res, next) {
  try {
    const id = req.params.id;
    if (!isCuidLike(id)) {
      return next(appError(400, "Invalid task id", "TASK_INVALID_ID"));
    }

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task || task.createdBy !== req.user.id) {
      return next(appError(404, "Task not found", "TASK_NOT_FOUND"));
    }

    const nextTitle = req.body.title === undefined ? task.title : sanitizeText(req.body.title, 140);
    const nextDescription = req.body.description === undefined ? task.description : sanitizeText(req.body.description, 2000);
    const nextStatus = req.body.status === undefined ? task.status : sanitizeText(req.body.status, 20).toUpperCase();

    if (!nextTitle || !["OPEN", "DONE", "CANCELED"].includes(nextStatus)) {
      return next(appError(400, "Invalid task payload", "TASK_VALIDATION_ERROR"));
    }

    const updated = await prisma.task.update({
      where: { id },
      data: {
        title: nextTitle,
        description: nextDescription,
        status: nextStatus
      }
    });

    return res.json(updated);
  } catch (error) {
    return next(error);
  }
}

export async function deleteTask(req, res, next) {
  try {
    const id = req.params.id;
    if (!isCuidLike(id)) {
      return next(appError(400, "Invalid task id", "TASK_INVALID_ID"));
    }

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task || task.createdBy !== req.user.id) {
      return next(appError(404, "Task not found", "TASK_NOT_FOUND"));
    }

    await prisma.task.delete({ where: { id } });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}
