import { and, eq, gt, isNull } from 'drizzle-orm';
import { Resend } from 'resend';
import { db } from '../db/client.js';
import { magicLinks } from '../db/schema.js';
import { env } from '../env.js';
import { generateToken, hashToken } from '../lib/tokens.js';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function createMagicLink(email: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken(24);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + env.MAGIC_LINK_TTL_MINUTES * 60 * 1000);

  await db.insert(magicLinks).values({
    email: email.toLowerCase(),
    tokenHash,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function consumeMagicLink(
  token: string,
): Promise<{ email: string } | null> {
  const tokenHash = hashToken(token);
  const now = new Date();

  const rows = await db
    .select()
    .from(magicLinks)
    .where(
      and(eq(magicLinks.tokenHash, tokenHash), gt(magicLinks.expiresAt, now), isNull(magicLinks.consumedAt)),
    )
    .limit(1);

  const link = rows[0];
  if (!link) return null;

  await db.update(magicLinks).set({ consumedAt: now }).where(eq(magicLinks.id, link.id));

  return { email: link.email };
}

export async function sendMagicLinkEmail(opts: {
  email: string;
  token: string;
}): Promise<void> {
  const url = `${env.API_URL}/auth/callback?token=${encodeURIComponent(opts.token)}`;

  if (!resend) {
    console.log('\n========== MAGIC LINK (dev mode, no RESEND_API_KEY) ==========');
    console.log(`To:      ${opts.email}`);
    console.log(`Link:    ${url}`);
    console.log(`Expires: in ${env.MAGIC_LINK_TTL_MINUTES} minutes`);
    console.log('==============================================================\n');
    return;
  }

  const { error } = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: opts.email,
    subject: 'Je inloglink voor Vroom',
    html: renderEmail(url),
    text: `Klik deze link om in te loggen bij Vroom:\n\n${url}\n\nDeze link verloopt over ${env.MAGIC_LINK_TTL_MINUTES} minuten. Heb je deze e-mail niet aangevraagd? Negeer 'm gewoon.`,
  });

  if (error) {
    console.error('[resend] Failed to send magic link', error);
    throw new Error('Kon e-mail niet verzenden');
  }
}

function renderEmail(url: string): string {
  return `<!doctype html>
<html lang="nl">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f6f7f9; margin: 0; padding: 32px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
      <tr><td>
        <h1 style="margin: 0 0 16px; font-size: 22px; color: #1a1a1a;">Inloggen bij Vroom</h1>
        <p style="margin: 0 0 24px; color: #4a4a4a; line-height: 1.5;">Klik op de knop hieronder om in te loggen. De link is ${env.MAGIC_LINK_TTL_MINUTES} minuten geldig.</p>
        <p style="margin: 0 0 24px;">
          <a href="${url}" style="display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Log in</a>
        </p>
        <p style="margin: 0; color: #8a8a8a; font-size: 13px; line-height: 1.5;">Werkt de knop niet? Plak deze link in je browser:<br><span style="color: #4a4a4a; word-break: break-all;">${url}</span></p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">
        <p style="margin: 0; color: #8a8a8a; font-size: 12px; line-height: 1.5;">Heb je deze e-mail niet aangevraagd? Negeer 'm dan gewoon.</p>
      </td></tr>
    </table>
  </body>
</html>`;
}
