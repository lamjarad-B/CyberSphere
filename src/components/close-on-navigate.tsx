"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Referme le <details> parent (menu mobile) à chaque changement de page :
 * le header vit dans le layout et n'est pas remonté lors d'une navigation
 * client, le menu resterait sinon ouvert sur la nouvelle page.
 */
export function CloseOnNavigate() {
  const pathname = usePathname();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    ref.current?.closest("details")?.removeAttribute("open");
  }, [pathname]);

  return <span ref={ref} hidden />;
}
