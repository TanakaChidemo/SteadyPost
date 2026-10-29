const express = require("express");
const multer = require("multer");
const contentController = require("../controllers/content.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
      return cb(null, true);
    }
    cb(new Error("Only image or video files are allowed"));
  },
});

router.use(requireAuth);

router.get("/", contentController.list);
router.get("/drafts", contentController.list);
router.post("/", contentController.create);
router.post("/media", upload.array("files", 4), contentController.uploadMedia);
router.get("/:id", contentController.getById);
router.put("/:id", contentController.update);
router.delete("/:id", contentController.remove);
router.get("/:id/versions", contentController.listVersions);

module.exports = router;
