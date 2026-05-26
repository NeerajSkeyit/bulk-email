import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import MongoStore from "connect-mongo";
import cors from "cors";
import express from "express";
import session from "express-session";
import multer from "multer";
import { config } from "./config.js";
import {
  createMailJob,
  createTemplate,
  deleteTemplate,
  getMailJob,
  getMailJobSnapshot,
  getMailLog,
  getTemplateById,
  getPendingLogsForJob,
  listMailLogs,
  listMailJobs,
  listTemplates,
  markMailLogFailed,
  markMailLogSending,
  markMailLogSent,
  queueMailLogForResend,
  recoverActiveMailJobs,
  serializeTemplate,
  updateMailJobStatus,
  updateTemplate,
} from "./db.js";
import { extractEmailsFromWorkbook } from "./emailExtractor.js";
import { sendTemplateMailToRecipient } from "./mailer.js";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve frontend
const distPath = path.join(__dirname, "../dist");

app.use(express.static(distPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const uploadDir = path.resolve(process.cwd(), "server/uploads");
const templateAttachmentDir = path.resolve(
  process.cwd(),
  "server/template-attachments"
);

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(templateAttachmentDir, { recursive: true });

const recipientUpload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    const allowedMimeTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    const allowedExtensions = [".xlsx", ".xls", ".csv"];
    const extension = path.extname(file.originalname).toLowerCase();

    if (
      allowedMimeTypes.includes(file.mimetype) ||
      allowedExtensions.includes(extension)
    ) {
      callback(null, true);
      return;
    }

    callback(new Error("Only .xlsx, .xls, or .csv files are allowed."));
  },
});

const templateAttachmentUpload = multer({
  storage: multer.diskStorage({
    destination: templateAttachmentDir,
    filename: (_req, file, callback) => {
      callback(
        null,
        `${crypto.randomUUID()}${path.extname(file.originalname)}`
      );
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const sessionOptions = {
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60 * 8,
  },
};

if (config.mongoUri) {
  sessionOptions.store = MongoStore.create({ mongoUrl: config.mongoUri });
}

app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
  })
);
app.use(express.json());
app.use(session(sessionOptions));

function requireAdmin(req, res, next) {
  if (!req.session?.admin) {
    res.status(401).json({ message: "Please login as admin." });
    return;
  }

  next();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  res.json({
    authenticated: Boolean(req.session?.admin),
    admin: req.session?.admin || null,
  });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const emailMatches =
    String(email || "")
      .trim()
      .toLowerCase() === config.adminEmail.toLowerCase();
  const passwordMatches =
    config.adminPassword.startsWith("$2a$") ||
    config.adminPassword.startsWith("$2b$")
      ? await bcrypt.compare(String(password || ""), config.adminPassword)
      : String(password || "") === config.adminPassword;

  if (!emailMatches || !passwordMatches) {
    res.status(401).json({ message: "Invalid admin credentials." });
    return;
  }

  req.session.admin = { email: config.adminEmail };
  res.json({ admin: req.session.admin });
});

app.post("/api/auth/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

function templatePayloadFromRequest(req) {
  return {
    name: String(req.body.name || "").trim(),
    subject: String(req.body.subject || "").trim(),
    content: String(req.body.content || "").trim(),
  };
}

function validateTemplatePayload(payload) {
  if (!payload.name) {
    throw new Error("Template name is required.");
  }

  if (!payload.subject) {
    throw new Error("Template subject is required.");
  }

  if (!payload.content) {
    throw new Error("Template content is required.");
  }
}

function attachmentFromFile(file) {
  if (!file) {
    return null;
  }

  return {
    filename: file.filename,
    originalName: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    path: file.path,
  };
}

async function removeAttachmentFile(attachment) {
  if (attachment?.path) {
    await fs.promises.unlink(attachment.path).catch(() => {});
  }
}

const allowedQueueIntervals = new Set([2, 5, 10, 30, 60]);

function getSendOptions(req) {
  const mode = req.body.sendMode === "queued" ? "queued" : "immediate";

  if (mode === "immediate") {
    return { mode, delaySeconds: 0 };
  }

  const delaySeconds = Number(req.body.queueIntervalSeconds);

  if (!allowedQueueIntervals.has(delaySeconds)) {
    throw new Error("Please select a valid queue interval.");
  }

  return { mode, delaySeconds };
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function sendMailLog(log) {
  const template = await getTemplateById(log.templateId.toString());

  if (!template) {
    throw new Error("Template used for this mail no longer exists.");
  }

  await markMailLogSending(log._id.toString());
  const result = await sendTemplateMailToRecipient(log.email, template);
  await markMailLogSent(log._id.toString(), result.messageId);
}

async function processMailJob(jobId) {
  const job = await getMailJob(jobId);

  if (!job) {
    return;
  }

  await updateMailJobStatus(jobId, "running", {
    startedAt: job.startedAt || new Date(),
  });

  try {
    const logs = await getPendingLogsForJob(jobId);
    const delayMs = Number(job.queueIntervalSeconds || 0) * 1000;

    for (const [index, log] of logs.entries()) {
      try {
        await sendMailLog(log);
      } catch (error) {
        await markMailLogFailed(log._id.toString(), error.message);
      }

      if (delayMs > 0 && index < logs.length - 1) {
        await wait(delayMs);
      }
    }

    await updateMailJobStatus(jobId, "completed", { completedAt: new Date() });
  } catch (error) {
    await updateMailJobStatus(jobId, "failed", {
      completedAt: new Date(),
      error: error.message,
    });
  }
}

async function processSingleMailLog(logId) {
  const log = await getMailLog(logId);

  if (!log) {
    return;
  }

  await updateMailJobStatus(log.jobId.toString(), "running", {
    startedAt: new Date(),
  });

  try {
    await sendMailLog(log);
  } catch (error) {
    await markMailLogFailed(log._id.toString(), error.message);
  }

  const snapshot = await getMailJobSnapshot(log.jobId.toString());
  const remaining = snapshot.logs.some((item) =>
    ["pending", "sending"].includes(item.status)
  );

  if (!remaining) {
    await updateMailJobStatus(log.jobId.toString(), "completed", {
      completedAt: new Date(),
    });
  }
}

function runInBackground(task) {
  task().catch((error) => {
    console.error(error);
  });
}

app.get("/api/templates", requireAdmin, async (_req, res) => {
  try {
    res.json({ templates: await listTemplates() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/templates/:id", requireAdmin, async (req, res) => {
  try {
    const template = await getTemplateById(req.params.id);

    if (!template) {
      res.status(404).json({ message: "Template not found." });
      return;
    }

    res.json({ template: serializeTemplate(template) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post(
  "/api/templates",
  requireAdmin,
  templateAttachmentUpload.single("attachment"),
  async (req, res) => {
    try {
      const payload = templatePayloadFromRequest(req);
      validateTemplatePayload(payload);

      const template = await createTemplate({
        ...payload,
        attachment: attachmentFromFile(req.file),
      });

      res.status(201).json({ template });
    } catch (error) {
      await removeAttachmentFile(attachmentFromFile(req.file));
      res.status(400).json({ message: error.message });
    }
  }
);

app.put(
  "/api/templates/:id",
  requireAdmin,
  templateAttachmentUpload.single("attachment"),
  async (req, res) => {
    try {
      const existing = await getTemplateById(req.params.id);

      if (!existing) {
        await removeAttachmentFile(attachmentFromFile(req.file));
        res.status(404).json({ message: "Template not found." });
        return;
      }

      const payload = templatePayloadFromRequest(req);
      validateTemplatePayload(payload);

      const updates = { ...payload };
      const removeAttachment =
        String(req.body.removeAttachment || "") === "true";

      if (req.file) {
        updates.attachment = attachmentFromFile(req.file);
        await removeAttachmentFile(existing.attachment);
      } else if (removeAttachment) {
        updates.attachment = null;
        await removeAttachmentFile(existing.attachment);
      }

      const template = await updateTemplate(req.params.id, updates);
      res.json({ template });
    } catch (error) {
      await removeAttachmentFile(attachmentFromFile(req.file));
      res.status(400).json({ message: error.message });
    }
  }
);

app.delete("/api/templates/:id", requireAdmin, async (req, res) => {
  try {
    const template = await deleteTemplate(req.params.id);

    if (!template) {
      res.status(404).json({ message: "Template not found." });
      return;
    }

    await removeAttachmentFile(template.attachment);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post(
  "/api/mail/bulk-send",
  requireAdmin,
  recipientUpload.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: "Please upload an Excel file." });
      return;
    }

    try {
      if (!req.body.templateId) {
        res.status(400).json({ message: "Please select a template." });
        return;
      }

      const sendOptions = getSendOptions(req);
      const template = await getTemplateById(req.body.templateId);

      if (!template) {
        res.status(400).json({ message: "Please select a valid template." });
        return;
      }

      const emails = extractEmailsFromWorkbook(req.file.path);

      if (emails.length === 0) {
        res
          .status(400)
          .json({ message: "No email IDs found in the uploaded file." });
        return;
      }

      const job = await createMailJob({
        template,
        emails,
        sendOptions,
      });

      res.status(202).json({
        message: "Queue has started. Mails will be sent in the background.",
        job,
        template: serializeTemplate(template),
      });

      runInBackground(() => processMailJob(job.id));
    } catch (error) {
      res.status(500).json({ message: error.message });
    } finally {
      fs.promises.unlink(req.file.path).catch(() => {});
    }
  }
);

app.get("/api/mail/jobs", requireAdmin, async (_req, res) => {
  try {
    res.json({ jobs: await listMailJobs() });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/mail/jobs/:id", requireAdmin, async (req, res) => {
  try {
    const snapshot = await getMailJobSnapshot(req.params.id);

    if (!snapshot.job) {
      res.status(404).json({ message: "Mail job not found." });
      return;
    }

    res.json(snapshot);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/mail/logs", requireAdmin, async (req, res) => {
  try {
    res.json(
      await listMailLogs({
        search: req.query.search,
        templateId: req.query.templateId,
        status: req.query.status,
        from: req.query.from,
        to: req.query.to,
        page: req.query.page,
        limit: req.query.limit,
      })
    );
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post("/api/mail/logs/:id/resend", requireAdmin, async (req, res) => {
  try {
    const log = await queueMailLogForResend(req.params.id);

    if (!log) {
      res.status(400).json({ message: "Only failed mails can be resent." });
      return;
    }

    res
      .status(202)
      .json({ message: "Resend started.", logId: log._id.toString() });
    runInBackground(() => processSingleMailLog(log._id.toString()));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.use((error, _req, res, _next) => {
  res.status(400).json({ message: error.message || "Something went wrong." });
});

app.listen(config.port, config.host, () => {
  console.log(`Server running on http://${config.host}:${config.port}`);
  runInBackground(async () => {
    const jobIds = await recoverActiveMailJobs();
    for (const jobId of jobIds) {
      runInBackground(() => processMailJob(jobId));
    }
  });
});
