"use client";

import { useCallback } from "react";
import { fetchWithAuth } from "@/lib/api";

/**
 * Hook to send telemetry data to the backend.
 * Helps track which sections users visit and what they interact with.
 */
// Cache to prevent duplicate logs in a short window (e.g. React StrictMode or double clicks)
const logCache = new Map<string, number>();
const DEDUPE_MS = 1000;

export function useAnalytics() {
  const logAction = useCallback(async (
    section: string,
    action: string,
    details: Record<string, any> = {}
  ) => {
    // Deduplication logic
    const cacheKey = `${section}:${action}:${JSON.stringify(details)}`;
    const now = Date.now();
    const lastLogTime = logCache.get(cacheKey) || 0;

    if (now - lastLogTime < DEDUPE_MS) {
      return;
    }
    logCache.set(cacheKey, now);

    const token = typeof window !== "undefined" ? localStorage.getItem("copa_token") : null;
    if (!token) return;

    try {
      // We use the analytics endpoint configured in the backend
      await fetchWithAuth("/copa/copa-api/api/analytics/log", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          seccion: section,
          accion: action,
          detalle: {
            ...details,
            url: window.location.href,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
          }
        })
      });
    } catch (err) {
      // Fail silently for analytics to avoid interrupting user experience
      console.warn("Failed to send analytics:", err);
    }
  }, []);

  return { logAction };
}
