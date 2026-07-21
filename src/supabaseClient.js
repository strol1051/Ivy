import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    "Variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes. Copie .env.example vers .env et remplis-les."
  );
}

// La session utilise sessionStorage (pas localStorage) : elle est
// automatiquement effacée à la fermeture de l'onglet/du navigateur.
// Important sur un ordinateur partagé entre plusieurs personnes de l'école —
// la personne suivante ne retombe jamais sur le compte encore connecté.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});
