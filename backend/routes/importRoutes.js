import { Router } from "express";
import multer from "multer";
import { importCsv } from "../controllers/importController.js";
import { appError } from "../lib/errors.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    const ok = file.mimetype.includes("csv") || file.originalname.toLowerCase().endsWith(".csv");
    if (!ok) {
      callback(appError(400, "Only CSV files are supported", "IMPORT_INVALID_FILE_TYPE"));
      return;
    }
    callback(null, true);
  }
});

router.use(authRequired);
router.post("/csv", (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      next(appError(400, "CSV file too large", "IMPORT_FILE_TOO_LARGE"));
      return;
    }

    next(error);
  });
}, importCsv);

export default router;