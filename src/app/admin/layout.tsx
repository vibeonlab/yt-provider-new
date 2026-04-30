import { AdminShell } from "@/components/admin/admin-shell";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminSessionToken } from "@/lib/server/adminAuth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("admin_session")?.value;
  if (!verifyAdminSessionToken(sessionToken)) {
    redirect("/login");
  }

  return <AdminShell>{children}</AdminShell>;
}

