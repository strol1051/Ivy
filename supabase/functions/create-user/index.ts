// Edge Function : create-user
// Permet à un compte Direction de créer un nouveau compte (Enseignant ou
// Secrétaire) pour SON école, sans jamais exposer la clé service_role au
// navigateur. Tourne côté serveur, sur l'infrastructure de Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Non authentifié.");

    // Client "en tant qu'utilisateur appelant" — sert à vérifier qui fait la demande
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) throw new Error("Session invalide.");

    // Vérifie que l'appelant est bien Direction, et récupère son école
    const { data: callerProfile, error: profileError } = await callerClient
      .from("profiles")
      .select("role, school_id")
      .eq("id", user.id)
      .single();
    if (profileError || !callerProfile) throw new Error("Profil introuvable.");
    if (callerProfile.role !== "direction") throw new Error("Seule la Direction peut créer un compte.");

    const { email, password, name, role, classes } = await req.json();
    if (!email || !password || !name || !role) throw new Error("Champs manquants.");
    if (!["enseignant", "secretaire", "direction"].includes(role)) throw new Error("Rôle invalide.");

    // Client "admin" — utilise la clé service_role, UNIQUEMENT disponible ici,
    // côté serveur. Ne jamais transmettre cette clé au navigateur.
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (createError) throw createError;

    const { error: insertError } = await adminClient.from("profiles").insert({
      id: created.user.id,
      school_id: callerProfile.school_id,
      name,
      role,
      classes: role === "enseignant" ? (classes || []) : [],
    });
    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, id: created.user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
