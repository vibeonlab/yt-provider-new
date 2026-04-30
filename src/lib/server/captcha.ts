import crypto from "crypto";

const CAPTCHA_CODE_LENGTH = 4;
const CAPTCHA_TTL_MS = 2 * 60 * 1000; // 2 minutes

export type CaptchaPayload = {
  code: string;
  hash: string;
  expiresAt: number; // epoch ms
};

function getCaptchaSecret() {
  // Fallback for local UI development so captcha can render
  // even before env is configured.
  return process.env.CAPTCHA_SECRET || "dev-captcha-secret";
}

export function generateCaptcha(): CaptchaPayload {
  const code = Array.from({ length: CAPTCHA_CODE_LENGTH })
    .map(() => crypto.randomInt(0, 10).toString())
    .join("");

  const expiresAt = Date.now() + CAPTCHA_TTL_MS;
  const secret = getCaptchaSecret();

  // HMAC: prevent client-side tampering of the expected value.
  const hash = crypto
    .createHmac("sha256", secret)
    .update(`${code}:${expiresAt}`)
    .digest("hex");

  return { code, hash, expiresAt };
}

export function verifyCaptcha({
  inputCode,
  expectedHash,
  expiresAt,
}: {
  inputCode: string;
  expectedHash: string;
  expiresAt: number;
}) {
  if (!/^\d{4}$/.test(inputCode)) return false;
  if (Date.now() > expiresAt) return false;

  const secret = getCaptchaSecret();
  const inputHash = crypto
    .createHmac("sha256", secret)
    .update(`${inputCode}:${expiresAt}`)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(inputHash, "hex"),
    Buffer.from(expectedHash, "hex"),
  );
}

export function captchaSvg(code: string) {
  // Simple SVG captcha: server renders an image; client only displays.
  const bg = "#f8fafc";
  const fg = "#0f172a";

  // Light noise lines
  const lines = Array.from({ length: 6 }).map((_, i) => {
    const x1 = crypto.randomInt(0, 220);
    const y1 = crypto.randomInt(0, 70);
    const x2 = x1 + crypto.randomInt(20, 80);
    const y2 = y1 + crypto.randomInt(-20, 20);
    const opacity = 0.15 + i * 0.03;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${fg}" stroke-opacity="${opacity}" stroke-width="2" />`;
  });

  // Render code with slight offsets
  const digits = code.split("");
  const digitEls = digits
    .map((d, idx) => {
      const x = 30 + idx * 40 + crypto.randomInt(-3, 3);
      const y = 52 + crypto.randomInt(-2, 2);
      const rot = crypto.randomInt(-10, 10);
      return `<text x="${x}" y="${y}" font-size="34" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" fill="${fg}" transform="rotate(${rot} ${x} ${y})" text-anchor="middle" dominant-baseline="middle">${d}</text>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80">
  <rect x="0" y="0" width="240" height="80" rx="10" fill="${bg}" />
  <rect x="5" y="5" width="230" height="70" rx="8" fill="none" stroke="${fg}" stroke-opacity="0.15" stroke-width="2"/>
  ${lines.join("\n")}
  ${digitEls}
</svg>`;
}

