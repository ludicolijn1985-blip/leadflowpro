import { Router } from "express";
import { createCheckoutSession, listBillingHistory } from "../controllers/billingController.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();

router.post("/checkout-session", authRequired, createCheckoutSession);
router.get("/history", authRequired, listBillingHistory);

export default router;