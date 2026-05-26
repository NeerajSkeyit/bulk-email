import nodemailer from "nodemailer";
import { config } from "./config.js";

export function createTransporter() {
  if (!config.smtp.user || !config.smtp.pass) {
    throw new Error("SMTP_USER and SMTP_PASS are required.");
  }

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function sendTemplateMailToRecipient(email, template, transporter = createTransporter()) {
  const attachments = template.attachment
    ? [
        {
          filename: template.attachment.originalName,
          path: template.attachment.path,
          contentType: template.attachment.mimetype,
        },
      ]
    : [];

  const info = await transporter.sendMail({
    from: config.mail.from,
    to: email,
    subject: template.subject,
    text: stripHtml(template.content),
    html: template.content,
    attachments,
  });

  return {
    email,
    status: "sent",
    messageId: info.messageId,
  };
}

export async function sendTemplateMailToRecipients(recipients, template, options = {}) {
  const transporter = createTransporter();
  const results = [];
  const delayMs = Number(options.delaySeconds || 0) * 1000;

  for (const email of recipients) {
    try {
      results.push(await sendTemplateMailToRecipient(email, template, transporter));
    } catch (error) {
      results.push({
        email,
        status: "failed",
        error: error.message,
      });
    }

    if (delayMs > 0 && results.length < recipients.length) {
      await wait(delayMs);
    }
  }

  return results;
}
