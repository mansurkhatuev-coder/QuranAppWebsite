import { NextResponse } from "next/server";
import { organizationHasAccess } from "@/lib/access";
import { buildOfflineReceiptPath, validateOfflineReceipt } from "@/lib/offline/receipt";
import { createClient, getSessionProfile } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
  });
}

export async function POST(request: Request) {
  const { user, organization } = await getSessionProfile();
  if (!user || !organization) return json({ error: "Not authenticated" }, 401);
  if (!organizationHasAccess(organization)) return json({ error: "Access denied" }, 403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Receipt upload is invalid" }, 400);
  }
  const operationId = String(form.get("operationId") || "");
  const loanId = String(form.get("loanId") || "");
  const entry = form.get("receipt");
  if (!(entry instanceof File)) return json({ error: "Receipt file is required" }, 400);

  let path: string;
  try {
    validateOfflineReceipt({ mimeType: entry.type, size: entry.size });
    path = buildOfflineReceiptPath({
      organizationId: organization.id,
      loanId,
      operationId,
      mimeType: entry.type,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Receipt is invalid" }, 400);
  }

  const supabase = await createClient();
  const { data: loan, error: loanError } = await supabase
    .from("loans")
    .select("id")
    .eq("id", loanId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (loanError || !loan) return json({ error: "Loan is unavailable" }, 404);

  const { error: uploadError } = await supabase.storage
    .from("payment-receipts")
    .upload(path, entry, { upsert: true, contentType: entry.type });
  if (uploadError) return json({ error: "Could not upload receipt" }, 503);
  return json({ path });
}
