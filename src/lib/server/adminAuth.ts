import crypto from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const DEFAULT_ACCOUNT = "ytadmin";
const DEFAULT_PASSWORD = "lhcyqopco";

type AdminAuthConfig = {
  account: string;
  password: string;
};

function authConfigPath() {
  return path.join(process.cwd(), "data", "admin-auth.json");
}

async function ensureConfigFile() {
  const filePath = authConfigPath();
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });

  try {
    await readFile(filePath, "utf-8");
  } catch {
    const initial: AdminAuthConfig = {
      account: DEFAULT_ACCOUNT,
      password: DEFAULT_PASSWORD,
    };
    await writeFile(filePath, JSON.stringify(initial, null, 2), "utf-8");
  }
}

export async function getAdminAuthConfig(): Promise<AdminAuthConfig> {
  await ensureConfigFile();
  const filePath = authConfigPath();
  const raw = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<AdminAuthConfig>;
  return {
    account: parsed.account || DEFAULT_ACCOUNT,
    password: parsed.password || DEFAULT_PASSWORD,
  };
}

export async function verifyAdminLogin(input: {
  account: string;
  password: string;
}) {
  const cfg = await getAdminAuthConfig();
  return input.account === cfg.account && input.password === cfg.password;
}

export async function updateAdminPassword(input: {
  currentPassword: string;
  newPassword: string;
}) {
  const cfg = await getAdminAuthConfig();
  if (input.currentPassword !== cfg.password) {
    return { ok: false as const, error: "当前密码不正确" };
  }
  if (!input.newPassword || input.newPassword.length < 6) {
    return { ok: false as const, error: "新密码至少 6 位" };
  }

  const next: AdminAuthConfig = {
    account: DEFAULT_ACCOUNT,
    password: input.newPassword,
  };
  await writeFile(authConfigPath(), JSON.stringify(next, null, 2), "utf-8");
  return { ok: true as const };
}

function adminAuthSecret() {
  return process.env.CAPTCHA_SECRET || "dev-captcha-secret";
}

export function signAdminSession(account: string) {
  const timestamp = Date.now().toString();
  const payload = `${account}:${timestamp}`;
  const sig = crypto
    .createHmac("sha256", adminAuthSecret())
    .update(payload)
    .digest("hex");
  return `${payload}:${sig}`;
}

