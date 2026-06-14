import nodemailer, { type Transporter } from "nodemailer";

export type SmtpConfig = {
  provider: string;
  host: string;
  port: number;
  username: string;
  password: string;
  maxPerDay?: number;
  maxPerSecond?: number;
  maxConcurrent?: number;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  fromEmail: string;
  fromName: string;
  headers?: Record<string, string>;
};

export type SendEmailResult = {
  messageId: string;
  accepted: string[];
  rejected: string[];
};

export function createTransporter(smtp: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.username, pass: smtp.password },
  });
}

export async function sendEmail(
  smtp: SmtpConfig,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  // Public demo: never deliver real mail. Log + return a simulated success so
  // broadcasts / automations / invites still "complete" in the UI. This is the
  // single outbound chokepoint, so it covers every send path at once.
  if (process.env.DEMO_MODE === "true") {
    console.log(`[demo] Suppressed email to ${input.to} — "${input.subject}"`);
    return { messageId: `demo-${Date.now()}`, accepted: [input.to], rejected: [] };
  }

  const transporter = createTransporter(smtp);

  const result = await transporter.sendMail({
    from: `"${input.fromName}" <${input.fromEmail}>`,
    to: input.to,
    subject: input.subject,
    html: input.html,
    headers: input.headers,
  });

  return {
    messageId: result.messageId ?? "",
    accepted: (result.accepted as string[]) ?? [],
    rejected: (result.rejected as string[]) ?? [],
  };
}
