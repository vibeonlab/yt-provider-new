import { headers } from "next/headers";

/**
 * 在 Nginx HTTPS 反代时，Node 侧 NODE_ENV 可能未设为 production；
 * 此时仍应对 Cookie 使用 Secure，否则部分浏览器/策略下登录会异常。
 */
export async function shouldUseSecureCookies(): Promise<boolean> {
  if (process.env.NODE_ENV === "production") return true;
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return proto === "https";
}
