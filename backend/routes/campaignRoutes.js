import { Router } from "express";
import { createCampaign, launchQuickCampaign, listCampaigns, listTemplates, sendCampaign } from "../controllers/campaignsController.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();

router.use(authRequired);
router.get("/", listCampaigns);
router.get("/templates", listTemplates);
router.post("/launch", launchQuickCampaign);
router.post("/", createCampaign);
router.post("/:id/send", sendCampaign);

export default router;