import nodemailer, { type Transporter } from "nodemailer";
import { decrypt } from "./crypto";

export type SmtpConfig = {
  provider: string;
  host: string;
  port: number;
  username: string;
  passwordEnc: string;
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
  const password = decrypt(smtp.passwordEnc);
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.username, pass: password },
  });
}

export async function sendEmail(
  smtp: SmtpConfig,
  input: SendEmailInput,
): Promise<SendEmailResult> {
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
