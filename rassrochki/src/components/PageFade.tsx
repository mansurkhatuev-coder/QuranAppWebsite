"use client";

import { usePathname } from "next/navigation";

/** Лёгкое появление контента при смене страницы. */
export function PageFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
