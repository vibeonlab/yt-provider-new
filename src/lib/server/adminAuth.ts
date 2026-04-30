import crypto from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

const DEFAULT_ACCOUNT = "ytadmin";
const DEFAULT_PASSWORD = "lhcyqopco";

type AdminAuthConfig = {
  account: string;
  passwordHash: string;
};

function scryptHash(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, encodedHash: string) {
  const parts = encodedHash.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    // Backward compatibility: allow legacy plain-text stored value.
    const expected = Buffer.from(encodedHash, "utf-8");
    const actual = Buffer.from(password, "utf-8");
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  }
  const salt = parts[1];
  const expectedHex = parts[2];
  const actualHex = crypto.scryptSync(password, salt, 64).toString("hex");
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

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
      passwordHash: scryptHash(DEFAULT_PASSWORD),
    };
    await writeFile(filePath, JSON.stringify(initial, null, 2), "utf-8");
  }
}

async function getAdminAuthConfigFromLocal(): Promise<AdminAuthConfig> {
  await ensureConfigFile();
  const filePath = authConfigPath();
  const raw = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<AdminAuthConfig>;
  const maybeLegacyPassword = (parsed as { password?: string }).password;
  return {
    account: parsed.account || DEFAULT_ACCOUNT,
    passwordHash:
      parsed.passwordHash ||
      (maybeLegacyPassword ? scryptHash(maybeLegacyPassword) : scryptHash(DEFAULT_PASSWORD)),
  };
}

async function getAdminAuthConfigFromSupabase(): Promise<AdminAuthConfig | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from("admin_auth")
    .select("account,password_hash")
    .eq("account", DEFAULT_ACCOUNT)
    .limit(1);

  if (error) {
    throw new Error(`读取 Supabase 管理员账号失败: ${error.message}`);
  }
  if (data && data.length > 0) {
    return {
      account: (data[0].account as string) || DEFAULT_ACCOUNT,
      passwordHash: (data[0].password_hash as string) || scryptHash(DEFAULT_PASSWORD),
    };
  }

  const initialHash = scryptHash(DEFAULT_PASSWORD);
  const { error: insertError } = await admin.from("admin_auth").insert({
    account: DEFAULT_ACCOUNT,
    password_hash: initialHash,
  });
  if (insertError) {
    throw new Error(`初始化 Supabase 管理员账号失败: ${insertError.message}`);
  }
  return { account: DEFAULT_ACCOUNT, passwordHash: initialHash };
}

export async function getAdminAuthConfig(): Promise<AdminAuthConfig> {
  const supabaseConfig = await getAdminAuthConfigFromSupabase();
  if (supabaseConfig) return supabaseConfig;
  return getAdminAuthConfigFromLocal();
}

export async function verifyAdminLogin(input: {
  account: string;
  password: string;
}) {
  const cfg = await getAdminAuthConfig();
  return input.account === cfg.account && verifyPassword(input.password, cfg.passwordHash);
}

export async function updateAdminPassword(input: {
  currentPassword: string;
  newPassword: string;
}) {
  const cfg = await getAdminAuthConfig();
  if (!verifyPassword(input.currentPassword, cfg.passwordHash)) {
    return { ok: false as const, error: "当前密码不正确" };
  }
  if (!input.newPassword || input.newPassword.length < 6) {
    return { ok: false as const, error: "新密码至少 6 位" };
  }

  const nextHash = scryptHash(input.newPassword);
  const admin = getSupabaseAdmin();
  if (admin) {
    const { error } = await admin.from("admin_auth").upsert(
      {
        account: DEFAULT_ACCOUNT,
        password_hash: nextHash,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account" },
    );
    if (!error) return { ok: true as const };
    return { ok: false as const, error: `更新 Supabase 密码失败: ${error.message}` };
  }

  const next: AdminAuthConfig = { account: DEFAULT_ACCOUNT, passwordHash: nextHash };
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

export function verifyAdminSessionToken(token: string | undefined) {
  if (!token) return false;
  const parts = token.split(":");
  if (parts.length !== 3) return false;
  const [account, timestamp, providedSig] = parts;
  if (!account || !timestamp || !providedSig) return false;
  if (!/^\d+$/.test(timestamp)) return false;

  const payload = `${account}:${timestamp}`;
  const expectedSig = crypto
    .createHmac("sha256", adminAuthSecret())
    .update(payload)
    .digest("hex");

  const provided = Buffer.from(providedSig, "hex");
  const expected = Buffer.from(expectedSig, "hex");
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

