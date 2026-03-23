import { Router } from "express";
import { createLead, createLeadsFromFeed, deleteLead, getLeadFeed, listLeads, updateLead } from "../controllers/leadsController.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();

router.use(authRequired);
router.get("/", listLeads);
router.get("/feed", getLeadFeed);
router.post("/feed/import", createLeadsFromFeed);
router.post("/", createLead);
router.put("/:id", updateLead);
router.delete("/:id", deleteLead);

export default router;