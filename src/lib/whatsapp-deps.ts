import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIso } from "@/lib/domain/dates";
import { appUrl } from "@/lib/env";
import { sendTemplate, whatsappConfigured } from "@/lib/whatsapp";
import type { DispatchDeps } from "@/lib/whatsapp-dispatch";
import { supabaseStore } from "@/lib/whatsapp-store";

/** Dépendances réelles du répartiteur : base Supabase (clé service), API Meta, date de Douala. */
export function whatsappDeps(db: SupabaseClient): DispatchDeps {
  return {
    store: supabaseStore(db),
    send: (to, call) => sendTemplate(to, call),
    today: todayIso(),
    appUrl: appUrl(),
    configured: whatsappConfigured(),
  };
}
