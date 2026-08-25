"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { needsBackupReminder } from "@/lib/backup";

export function BackupReminder() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(needsBackupReminder(7));
  }, []);

  if (!show) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      Пора сделать бэкап (раз в неделю).{" "}
      <Link href="/settings" className="font-semibold underline">
        Настройки → полный JSON
      </Link>
    </div>
  );
}
