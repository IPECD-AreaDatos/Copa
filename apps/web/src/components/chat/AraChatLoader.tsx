"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

declare global {
  interface Window {
    AraWidgetAuthTokenProvider?: () => string | null;
  }
}

const SCRIPT_ID = "ara-web-widget-script";
const WIDGET_ID = "ara-web-widget-root";
const CHAT_TITLE = "Ara Hacienda";

type Props = {
  apiBaseUrl: string;
  araId?: string;
  jwtEnabled: boolean;
};

function isLoginPath(pathname: string): boolean {
  return pathname === "/login" || pathname.endsWith("/login");
}

export default function AraChatLoader({ apiBaseUrl, araId, jwtEnabled }: Props) {
  const pathname = usePathname();
  const enabledForRoute = !isLoginPath(pathname);

  useEffect(() => {
    if (!enabledForRoute || !window.localStorage.getItem("copa_token")) return;

    if (jwtEnabled) {
      window.AraWidgetAuthTokenProvider = () => window.localStorage.getItem("copa_token");
    }

    const oldScript = document.getElementById(SCRIPT_ID);
    const oldWidget = document.getElementById(WIDGET_ID);
    oldScript?.remove();
    oldWidget?.remove();

    const script = document.createElement("script");
    let active = true;

    script.id = SCRIPT_ID;
    script.src = `${apiBaseUrl}/ara-widget.js`;
    script.dataset.apiBaseUrl = apiBaseUrl;
    script.dataset.title = CHAT_TITLE;
    script.dataset.position = "bottom-right";
    script.dataset.theme = "auto";
    if (araId) script.dataset.araId = araId;
    script.async = true;

    script.addEventListener("load", () => {
      if (!active) document.getElementById(WIDGET_ID)?.remove();
    });

    document.body.appendChild(script);

    return () => {
      active = false;
      script.remove();
      document.getElementById(WIDGET_ID)?.remove();
      if (jwtEnabled) delete window.AraWidgetAuthTokenProvider;
    };
  }, [apiBaseUrl, araId, enabledForRoute, jwtEnabled]);

  return null;
}
