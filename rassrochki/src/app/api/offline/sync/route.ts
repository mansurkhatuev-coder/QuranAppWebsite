import { NextResponse } from "next/server";
import { organizationHasAccess } from "@/lib/access";
import { orderOperationsForSync, parseSyncBatch } from "@/lib/offline/sync";
import type { OfflineOperation } from "@/lib/offline/types";
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

  let commands;
  try {
    commands = parseSyncBatch(await request.json(), user.id, organization.id);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Invalid sync batch" }, 400);
  }

  const operations: OfflineOperation[] = commands.map((command) => ({
    ...command,
    createdAt: command.createdAt ?? new Date(0).toISOString(),
    state: "pending",
    attempts: 0,
    lastError: null,
  }));
  let ordered: OfflineOperation[];
  try {
    ordered = orderOperationsForSync(operations);
  } catch {
    return json({ error: "Offline operation dependencies are invalid" }, 400);
  }

  const supabase = await createClient();
  const results: Array<Record<string, unknown>> = [];
  const statusById = new Map<string, string>();

  for (const operation of ordered) {
    const blockedBy = (operation.dependsOn ?? []).find((dependencyId) => {
      const status = statusById.get(dependencyId);
      return status && status !== "synced";
    });
    if (blockedBy) {
      const result = {
        operationId: operation.id,
        status: "conflict",
        message: "Предыдущая операция не выполнена; сначала разрешите её конфликт",
      };
      results.push(result);
      statusById.set(operation.id, "conflict");
      continue;
    }

    const { data, error } = await supabase.rpc("apply_offline_operation", {
      p_operation_id: operation.id,
      p_command_type: operation.command.type,
      p_payload: operation.command.payload,
    });

    if (error) {
      const result = {
        operationId: operation.id,
        status: "failed",
        message: "Сервер временно не принял операцию. Она останется на устройстве для повтора.",
      };
      results.push(result);
      statusById.set(operation.id, "failed");
      continue;
    }

    const rpcResult = data && typeof data === "object" ? data as Record<string, unknown> : {};
    let status = rpcResult.status === "synced" || rpcResult.status === "conflict"
      ? rpcResult.status
      : "failed";
    let message = typeof rpcResult.message === "string" ? rpcResult.message : undefined;
    if (status === "synced" && operation.command.type === "client.create") {
      const client = operation.command.payload.client as { id?: string; address?: string | null } | undefined;
      if (client?.id) {
        const { error: addressError } = await supabase
          .from("clients")
          .update({ address: client.address?.trim() || null })
          .eq("id", client.id)
          .eq("organization_id", organization.id);
        if (addressError) {
          status = "failed";
          message = "Клиент сохранён, но адрес ещё не синхронизирован. Повторите синхронизацию.";
        }
      }
    }
    if (status === "synced" && ["loan.create", "loan.edit"].includes(operation.command.type)) {
      const payload = operation.command.payload;
      const loan = payload.loan as { id?: string } | undefined;
      const loanId = typeof payload.loanId === "string" ? payload.loanId : loan?.id;
      const guarantors = Array.isArray(payload.guarantors) ? payload.guarantors : [];
      if (loanId) {
        const { error: guarantorError } = await supabase.rpc("replace_loan_guarantors", {
          p_loan_id: loanId,
          p_organization_id: organization.id,
          p_guarantors: guarantors,
        });
        if (guarantorError) {
          status = "failed";
          message = "Рассрочка сохранена, но адреса поручителей ещё не синхронизированы. Повторите синхронизацию.";
        }
      }
    }
    if (status === "synced" && operation.command.type === "loan.delete") {
      const paths = Array.isArray(rpcResult.receipt_paths)
        ? rpcResult.receipt_paths.filter((path): path is string => typeof path === "string" && path.length > 0)
        : [];
      if (paths.length > 0) {
        const { error: cleanupError } = await supabase.storage.from("payment-receipts").remove(paths);
        if (cleanupError) {
          status = "failed";
          message = "Рассрочка удалена, но чеки ещё не очищены. Очистка будет повторена при следующей синхронизации.";
        }
      }
    }
    const result = {
      ...rpcResult,
      operationId: operation.id,
      status,
      ...(message ? { message } : {}),
      ...(status === "failed" && !message ? { message: "Сервер вернул неизвестный результат. Операция сохранена для повтора." } : {}),
    };
    results.push(result);
    statusById.set(operation.id, status);
  }

  return json({ results });
}
