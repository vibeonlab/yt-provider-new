import { headers } from "next/headers";

function readConfiguredInternalToken() {
  return (
    process.env.INTERNAL_API_TOKEN ||
    process.env.AUTO_ONLINE_INTERNAL_TOKEN ||
    ""
  ).trim();
}

export async function verifyInternalTokenFromRequest() {
  const configured = readConfiguredInternalToken();
  if (!configured) {
    return { ok: false as const, error: "服务端未配置 INTERNAL_API_TOKEN" };
  }

  const h = await headers();
  const direct = (h.get("x-internal-token") || "").trim();
  const auth = (h.get("authorization") || "").trim();
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice("bearer ".length).trim()
    : "";

  const candidate = direct || bearer;
  if (!candidate) {
    return { ok: false as const, error: "缺少内部鉴权令牌" };
  }

  if (candidate !== configured) {
    return { ok: false as const, error: "内部鉴权令牌无效" };
  }

  return { ok: true as const };
}
