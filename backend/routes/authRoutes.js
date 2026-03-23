import { Router } from "express";
import { getMe, login, register } from "../controllers/authController.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", authRequired, getMe);

export default router;