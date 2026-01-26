"use strict";

const { Resend } = require("resend");
const nodemailer = require("nodemailer");

let logger;
try {
  logger = require("./logger");
} catch {
  logger = console;
}

let monitoringService;
try {
  monitoringService = require("./monitoringService");
} catch {
  monitoringService = {
    recordExternalSuccess() {},
    recordExternalError() {},
  };
}

let resendClient = null;
let smtpTransporter = null;

function str(v) {
  return (v ?? "").toString().trim();
}

function isProd() {
  return str(process.env.NODE_ENV).toLowerCase() === "production";
}

function providerMode() {
  const mode = str(process.env.MAIL_PROVIDER).toLowerCase();
  if (mode === "api" || mode === "smtp" || mode === "auto") return mode;
  return isProd() ? "api" : "smtp";
}

function redactEnvSnapshot() {
  return {
    NODE_ENV: str(process.env.NODE_ENV),
    MAIL_PROVIDER: providerMode(),
    MAIL_FROM: str(process.env.MAIL_FROM),
    SMTP_HOST: str(process.env.SMTP_HOST),
    SMTP_PORT: str(process.env.SMTP_PORT),
    SMTP_USER: str(process.env.SMTP_USER),
    SMTP_SECURE: str(process.env.SMTP_SECURE),
    RESEND_API_KEY: process.env.RESEND_API_KEY ? "***set***" : "",
  };
}

function validateEnvFor(provider) {
  const missing = [];

  if (provider === "api") {
    if (!str(process.env.RESEND_API_KEY)) missing.push("RESEND_API_KEY");
    if (!str(process.env.MAIL_FROM)) missing.push("MAIL_FROM");
  }

  if (provider === "smtp") {
    if (!str(process.env.SMTP_HOST)) missing.push("SMTP_HOST");
    if (!str(process.env.SMTP_PORT)) missing.push("SMTP_PORT");
    if (!str(process.env.SMTP_USER)) missing.push("SMTP_USER");
    if (!str(process.env.SMTP_PASS)) missing.push("SMTP_PASS");
  }

  if (missing.length) {
    throw new Error(
      `Missing required env vars for mail provider '${provider}': ${missing.join(", ")}`
    );
  }
}

function ensureProvidersInit() {
  const mode = providerMode();

  if (mode === "api") {
    if (!resendClient) {
      validateEnvFor("api");
      resendClient = new Resend(str(process.env.RESEND_API_KEY));
      logger.info?.("Mailer: Resend initialized");
    }
    return;
  }

  if (mode === "smtp") {
    if (!smtpTransporter) {
      validateEnvFor("smtp");
      smtpTransporter = nodemailer.createTransport({
        host: str(process.env.SMTP_HOST),
        port: Number(str(process.env.SMTP_PORT)),
        secure:
          str(process.env.SMTP_SECURE).toLowerCase() === "true" ||
          Number(str(process.env.SMTP_PORT)) === 465,
        auth: {
          user: str(process.env.SMTP_USER),
          pass: str(process.env.SMTP_PASS),
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
        tls: {
          rejectUnauthorized: true,
        },
      });
      logger.info?.("Mailer: SMTP initialized");
    }
    return;
  }

  if (mode === "auto") {
    const apiOk = str(process.env.RESEND_API_KEY) && str(process.env.MAIL_FROM);
    const smtpOk =
      str(process.env.SMTP_HOST) &&
      str(process.env.SMTP_PORT) &&
      str(process.env.SMTP_USER) &&
      str(process.env.SMTP_PASS);

    if (!apiOk && !smtpOk) {
      throw new Error(
        "MAIL_PROVIDER=auto but neither API nor SMTP is fully configured"
      );
    }

    if (apiOk && !resendClient) {
      resendClient = new Resend(str(process.env.RESEND_API_KEY));
      logger.info?.("Mailer: Resend initialized (auto)");
    }

    if (smtpOk && !smtpTransporter) {
      smtpTransporter = nodemailer.createTransport({
        host: str(process.env.SMTP_HOST),
        port: Number(str(process.env.SMTP_PORT)),
        secure:
          str(process.env.SMTP_SECURE).toLowerCase() === "true" ||
          Number(str(process.env.SMTP_PORT)) === 465,
        auth: {
          user: str(process.env.SMTP_USER),
          pass: str(process.env.SMTP_PASS),
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
        tls: {
          rejectUnauthorized: true,
        },
      });
      logger.info?.("Mailer: SMTP initialized (auto)");
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function retry(fn, opts) {
  const attempts = Math.max(1, Number(opts?.attempts ?? 3));
  let delay = Math.max(100, Number(opts?.baseDelayMs ?? 500));
  let lastErr;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn(i);
    } catch (e) {
      lastErr = e;
      const code = e?.code || e?.name;
      logger.error?.(`Mailer send failed (attempt ${i}/${attempts})`, {
        message: e?.message,
        code,
        provider: opts?.provider,
      });
      monitoringService.recordExternalError("mailer");
      if (i < attempts) {
        await sleep(delay);
        delay *= 2;
      }
    }
  }

  throw lastErr || new Error("Mailer send failed");
}

function fromAddress() {
  const mailFrom = str(process.env.MAIL_FROM);
  if (mailFrom) return mailFrom;

  const smtpUser = str(process.env.SMTP_USER);
  if (smtpUser) return `DoroShop <${smtpUser}>`;

  return "DoroShop <no-reply@localhost>";
}

async function sendViaResend({ to, subject, text, html }) {
  if (!resendClient) throw new Error("Resend client not initialized");

  const { data, error } = await resendClient.emails.send({
    from: fromAddress(),
    to,
    subject,
    text,
    html,
  });

  if (error) {
    const err = new Error(error.message || "Resend send failed");
    err.code = error.name || "RESEND_ERROR";
    throw err;
  }

  return data;
}

async function sendViaSmtp({ to, subject, text, html }) {
  if (!smtpTransporter) throw new Error("SMTP transporter not initialized");

  return smtpTransporter.sendMail({
    from: fromAddress(),
    to,
    subject,
    text,
    html,
  });
}

function providerChain() {
  const mode = providerMode();

  if (mode === "api") return ["api"];
  if (mode === "smtp") return ["smtp"];

  const apiOk = !!(str(process.env.RESEND_API_KEY) && str(process.env.MAIL_FROM));
  const smtpOk = !!(
    str(process.env.SMTP_HOST) &&
    str(process.env.SMTP_PORT) &&
    str(process.env.SMTP_USER) &&
    str(process.env.SMTP_PASS)
  );

  const chain = [];
  if (apiOk) chain.push("api");
  if (smtpOk) chain.push("smtp");
  return chain.length ? chain : ["api"];
}

async function sendEmail(to, subject, text, html = null) {
  ensureProvidersInit();

  const payload = {
    to,
    subject,
    text,
    html,
  };

  const chain = providerChain();
  let lastErr;

  for (const p of chain) {
    try {
      const res =
        p === "api"
          ? await retry(() => sendViaResend(payload), { provider: "api", attempts: 3, baseDelayMs: 500 })
          : await retry(() => sendViaSmtp(payload), { provider: "smtp", attempts: 2, baseDelayMs: 500 });

      monitoringService.recordExternalSuccess("mailer");
      logger.info?.("Mailer sent", { provider: p, to });
      return res;
    } catch (e) {
      lastErr = e;
      logger.error?.("Mailer provider failed", {
        provider: p,
        message: e?.message,
        code: e?.code || e?.name,
      });
    }
  }

  throw lastErr || new Error("Mailer failed (all providers)");
}

function otpHtml(otp) {
  const safeOtp = String(otp ?? "").replace(/[^\dA-Za-z]/g, "");
  return `
  <div style="font-family:Arial,sans-serif;line-height:1.5">
    <h2 style="margin:0 0 10px">Your DoroShop OTP</h2>
    <p style="margin:0 0 12px">Use this code to continue:</p>
    <div style="font-size:24px;font-weight:700;letter-spacing:4px;padding:12px 16px;border:1px solid #ddd;display:inline-block;border-radius:10px">
      ${safeOtp}
    </div>
    <p style="margin:12px 0 0;color:#666">This code expires in 10 minutes.</p>
  </div>
  `;
}

async function sendVerificationEmail(to, otp) {
  const subject = "Your One-Time Password (OTP) for DoroShop";
  const text = `Your OTP is: ${otp}\n\nThis code will expire in 10 minutes.`;
  const html = otpHtml(otp);
  return sendEmail(to, subject, text, html);
}

async function sendSellerWelcomeEmail(to, shopName, userName) {
  const subject = "🎉 Welcome to DoroShop Sellers - Application Approved!";
  const text = `Welcome ${userName}!\n\nYour seller application for "${shopName}" has been approved.\n\nLogin: ${str(process.env.FRONTEND_URL) || "https://doroshop.ph"}/vendor/dashboard`;
  return sendEmail(to, subject, text, null);
}

async function verifyMailer() {
  ensureProvidersInit();
  const mode = providerMode();

  if (mode === "api") {
    validateEnvFor("api");
    return true;
  }

  if (mode === "smtp") {
    validateEnvFor("smtp");
    await smtpTransporter.verify();
    return true;
  }

  const chain = providerChain();
  if (chain.includes("smtp") && smtpTransporter) {
    try {
      await smtpTransporter.verify();
      return true;
    } catch (e) {
      logger.warn?.("SMTP verify failed (auto)", { message: e?.message });
      return chain.includes("api");
    }
  }

  return chain.includes("api");
}

function warmupMailer() {
  Promise.resolve()
    .then(() => verifyMailer())
    .then(() => logger.info?.("Mailer warmup ok", { env: redactEnvSnapshot() }))
    .catch((e) =>
      logger.warn?.("Mailer warmup failed (non-blocking)", {
        message: e?.message,
        env: redactEnvSnapshot(),
      })
    );
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendSellerWelcomeEmail,
  verifyMailer,
  warmupMailer,
};
