import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';

/** SMTP_HOST ausente — sem isto, o transporte real não existe; quem chamou decide o fallback. */
export class MailerNotConfiguredError extends Error {}

export interface SendEmailInput {
    to: string;
    subject: string;
    /** Corpo em texto simples — os rascunhos gerados pela IA já vêm como texto, sem HTML. */
    text: string;
}

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter {
    if (!env.SMTP_HOST) {
        throw new MailerNotConfiguredError('Envio de e-mail não configurado (SMTP_HOST ausente).');
    }
    if (cachedTransporter) return cachedTransporter;

    cachedTransporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    return cachedTransporter;
}

/** Envia um e-mail de verdade via SMTP. Lança `MailerNotConfiguredError` quando SMTP_HOST não está definido. */
export async function sendEmail(input: SendEmailInput): Promise<void> {
    const transporter = getTransporter();
    await transporter.sendMail({
        from: env.SMTP_FROM || env.SMTP_USER,
        to: input.to,
        subject: input.subject,
        text: input.text,
    });
}
