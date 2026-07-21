import { useState, useEffect, useCallback, Fragment } from "react";
import { Users, ClipboardList, FileText, Settings, Plus, Trash2, Printer, X, School, UserCog, LogOut, Wallet } from "lucide-react";
import { supabase } from "./supabaseClient";

const CLASSES = [
  "Kind 1", "Kind 2", "Kind 3",
  "1ère AF", "2ème AF", "3ème AF", "4ème AF", "5ème AF", "6ème AF",
  "7ème AF", "8ème AF", "9ème AF",
  "Secondaire I", "Secondaire II", "Secondaire III", "Secondaire IV",
];
const KIND_CLASSES = ["Kind 1", "Kind 2", "Kind 3"];
const MOYENNE_SUR_10_CLASSES = ["1ère AF", "2ème AF", "3ème AF", "4ème AF", "5ème AF", "6ème AF"];
const MENTIONS = ["Excellent", "Très bien", "Bien", "Absent", "Souvent", "Rarement", "Parfois", "Jamais", "Insuffisant"];
const LOCALITES = ["Thomassique (Centre-Ville)", "1ère Section (Lociane)", "2ème Section (Matelgate)"];
const LIBELLES_PAIEMENT = ["Frais d'inscription", "1er Trimestre", "2ème Trimestre", "3ème Trimestre"];
const PAPER_FORMATS = { A4: { width: "210mm", height: "297mm" }, Lettre: { width: "215.9mm", height: "279.4mm" } };
const THEME_PRESETS = [
  { name: "Bleu Marine", color: "#1B2A4A" },
  { name: "Vert Forêt", color: "#1F3D2B" },
  { name: "Bordeaux", color: "#6B1F2A" },
  { name: "Bleu Océan", color: "#0F3D5C" },
  { name: "Prune", color: "#3B1F3D" },
  { name: "Terracotta", color: "#8B4A2B" },
];
const PERIODS = ["1er Trimestre", "2e Trimestre", "3e Trimestre"];
const DEFAULT_SUBJECTS = [
  "Français", "Mathématiques", "Sciences Sociales", "Sciences Expérimentales",
  "Anglais", "Espagnol", "Créole", "Éducation Physique", "Arts Plastiques", "Conduite/Civisme",
];
const EMPTY_ADDRESS = { localite: "", rue: "" };
const EMPTY_RESPONSABLE = { nom: "", prenom: "", numeroId: "", lienParente: "", adresse: { ...EMPTY_ADDRESS }, telephone: "" };
const EMPTY_STUDENT_FORM = {
  nom: "", prenom: "", classe: "", photo: "", sexe: "", nisu: "",
  dateNaissance: "", lieuNaissance: "", adresse: { ...EMPTY_ADDRESS },
  responsable: { ...EMPTY_RESPONSABLE },
};

function darkenHex(hex, amount = 0.25) {
  const c = (hex || "#1B2A4A").replace("#", "");
  const num = parseInt(c, 16);
  if (Number.isNaN(num)) return "#28395E";
  let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  r = Math.round(r * (1 - amount)); g = Math.round(g * (1 - amount)); b = Math.round(b * (1 - amount));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function ThemeVars({ color, style }) {
  const headingFont = style === "moderne" ? "'Segoe UI', system-ui, sans-serif" : "Georgia, serif";
  return (
    <style>{`:root { --primary: ${color || "#1B2A4A"}; --primary-dark: ${darkenHex(color)}; --heading-font: ${headingFont}; }`}</style>
  );
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function appreciation(score) {
  if (score === null || score === undefined || Number.isNaN(score)) return { label: "—", color: "#8B8578" };
  if (score >= 80) return { label: "Excellent", color: "#3D6B4F" };
  if (score >= 70) return { label: "Très Bien", color: "#3D6B4F" };
  if (score >= 60) return { label: "Bien", color: "#1E4D8C" };
  if (score >= 50) return { label: "Assez Bien", color: "#A3272E" };
  return { label: "Insuffisant", color: "#A3272E" };
}

function coeffFor(coefficients, classe, subject) {
  const v = coefficients?.[classe]?.[subject];
  return typeof v === "number" && v > 0 ? v : 100;
}

function weightedAverage(studentId, classe, period, subjects, grades, coefficients) {
  let totalScore = 0, totalMax = 0;
  subjects.forEach((subj) => {
    const score = grades[`${studentId}|${subj}|${period}`];
    if (typeof score === "number") {
      const max = coeffFor(coefficients, classe, subj);
      totalScore += score;
      totalMax += max;
    }
  });
  return totalMax > 0 ? (totalScore / totalMax) * 100 : null;
}

function classRanking(students, classe, period, subjects, grades, coefficients) {
  const scored = students
    .filter((s) => s.classe === classe)
    .map((s) => ({ id: s.id, avg: weightedAverage(s.id, classe, period, subjects, grades, coefficients) }))
    .filter((s) => s.avg !== null)
    .sort((a, b) => b.avg - a.avg);
  const ranks = {};
  let place = 0, lastAvg = null;
  scored.forEach((s, i) => {
    if (s.avg !== lastAvg) { place = i + 1; lastAvg = s.avg; }
    ranks[s.id] = place;
  });
  return { ranks, total: scored.length };
}

function roleLabel(role) {
  if (role === "direction") return "Direction";
  if (role === "secretaire") return "Secrétaire";
  return "Enseignant";
}

function formatMatricule(nom, prenom, num) {
  if (!num) return "—";
  const clean = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, "").toUpperCase();
  const n3 = (clean(nom) + "XXX").slice(0, 3);
  const p2 = (clean(prenom) + "XX").slice(0, 2);
  return `${n3}${p2}${String(num).padStart(6, "0")}`;
}

function formatMoney(amount, currency) {
  const n = typeof amount === "number" ? amount : 0;
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency || "HTG"}`;
}

function resizePhoto(file, maxSize = 160, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture impossible"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image invalide"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function PasswordGate({ password, children }) {
  const [unlocked, setUnlocked] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  if (!password || unlocked) return children;

  const tryUnlock = () => {
    if (input === password) { setUnlocked(true); setError(""); }
    else setError("Mot de passe incorrect.");
  };

  return (
    <div>
      <SectionTitle sub="Cet onglet est protégé par un mot de passe défini par la Direction">Paramètres</SectionTitle>
      <div style={{ background: "white", border: "1px solid #E5E1D6", borderRadius: 10, padding: 22, maxWidth: 360 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase" }}>Mot de passe</label>
          <input
            type="password" style={inputStyle} value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
            autoFocus
          />
        </div>
        {error && <div style={{ fontSize: 12.5, color: "#A3272E", marginBottom: 10 }}>{error}</div>}
        <button onClick={tryUnlock} style={btnPrimary}>Déverrouiller</button>
      </div>
    </div>
  );
}

// Bouton avec confirmation intégrée (Enregistrer / Supprimer / Modifier).
// N'utilise pas window.confirm : ces popups natives sont bloquées dans l'aperçu Claude.
// Si requirePassword est fourni (non vide), la validation exige le mot de passe Direction.
function ConfirmButton({ onConfirm, message, style, children, disabled, requirePassword }) {
  const [confirming, setConfirming] = useState(false);
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState("");

  const cancel = () => { setConfirming(false); setPwd(""); setError(""); };
  const validate = () => {
    if (requirePassword) {
      if (pwd !== requirePassword) { setError("Mot de passe Direction incorrect."); return; }
    }
    cancel();
    onConfirm();
  };

  if (confirming) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {requirePassword ? (
          <>
            <span style={{ fontSize: 12.5, color: "#8B8578" }}>Mot de passe Direction :</span>
            <input
              type="password" autoFocus value={pwd}
              onChange={(e) => { setPwd(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && validate()}
              style={{ ...inputStyle, width: 140, padding: "5px 10px", fontSize: 12.5 }}
            />
          </>
        ) : (
          <span style={{ fontSize: 12.5, color: "#8B8578" }}>{message || "Confirmer ?"}</span>
        )}
        <button type="button" onClick={validate} style={{ ...btnPrimary, padding: "6px 12px", fontSize: 12.5 }}>
          {requirePassword ? "Valider" : "Oui"}
        </button>
        <button type="button" onClick={cancel} style={{ ...btnSecondary, padding: "6px 12px", fontSize: 12.5 }}>Annuler</button>
        {error && <span style={{ fontSize: 11.5, color: "#A3272E", width: "100%" }}>{error}</span>}
      </span>
    );
  }

  return (
    <button type="button" onClick={() => setConfirming(true)} style={style} disabled={disabled}>
      {children}
    </button>
  );
}


function Avatar({ photo, name, size = 36 }) {
  if (photo) return <img src={photo} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />;
  const initials = (name || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#E5E1D6", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700 }}>
      {initials}
    </div>
  );
}

function ClassCheckboxes({ selected, onChange }) {
  const toggle = (c) => onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {CLASSES.map((c) => {
        const active = selected.includes(c);
        return (
          <button key={c} type="button" onClick={() => toggle(c)} style={{
            padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
            border: active ? "1px solid var(--primary)" : "1px solid #D8D2C2",
            background: active ? "var(--primary)" : "white", color: active ? "white" : "var(--primary)",
          }}>{c}</button>
        );
      })}
    </div>
  );
}

function Sidebar({ tab, setTab, schoolName, schoolLogo, currentUser, onLogout, items, className }) {
  return (
    <aside className={className} style={{ width: 240, background: "var(--primary)", color: "#F7F5F0", padding: "32px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 30, paddingLeft: 4 }}>
        {schoolLogo ? (
          <img src={schoolLogo} alt="Logo" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />
        ) : (
          <School size={22} color="#D4A24C" />
        )}
        <div style={{ fontFamily: "var(--heading-font)", fontSize: 17, lineHeight: 1.2 }}>{schoolName}</div>
      </div>

      <div style={{ background: "var(--primary-dark)", borderRadius: 8, padding: "10px 14px", marginBottom: 22 }}>
        <div style={{ fontSize: 13.5 }}>{currentUser.name}</div>
        <div style={{ fontSize: 11, color: "#D4A24C", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginTop: 2 }}>
          {currentUser.role === "direction"
            ? "Direction"
            : currentUser.role === "secretaire"
              ? "Secrétaire"
              : `Enseignant · ${(currentUser.classes || []).join(", ") || "aucune classe"}`}
        </div>
      </div>

      {items.map((it) => {
        const Icon = it.icon, active = tab === it.id;
        return (
          <button key={it.id} onClick={() => setTab(it.id)} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
            background: active ? "var(--primary-dark)" : "transparent", border: "none", borderRadius: 8,
            color: active ? "#fff" : "#C7CEDD", fontSize: 14.5, cursor: "pointer", textAlign: "left",
            borderLeft: active ? "3px solid #D4A24C" : "3px solid transparent",
          }}>
            <Icon size={17} />{it.label}
          </button>
        );
      })}

      <button onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", marginTop: 18, background: "transparent", border: "none", borderRadius: 8, color: "#8492AD", fontSize: 13.5, cursor: "pointer", textAlign: "left" }}>
        <LogOut size={16} /> Changer de compte
      </button>

      <div style={{ marginTop: "auto", fontSize: 11.5, color: "#8492AD", paddingLeft: 4, lineHeight: 1.5 }}>
        Prototype de gestion scolaire — données partagées entre les utilisateurs de cette appli.
      </div>
    </aside>
  );
}

function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h1 style={{ fontFamily: "var(--heading-font)", fontSize: 26, fontWeight: 400, margin: 0, color: "var(--primary)" }}>{children}</h1>
      {sub && <div style={{ fontSize: 13.5, color: "#8B8578", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function AddressFields({ value, onChange }) {
  const v = value || EMPTY_ADDRESS;
  return (
    <>
      <Field label="Localité">
        <select style={inputStyle} value={v.localite} onChange={(e) => onChange({ ...v, localite: e.target.value })}>
          <option value="">Sélectionner…</option>
          {LOCALITES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </Field>
      <Field label="Nom de la rue">
        <input style={inputStyle} value={v.rue} onChange={(e) => onChange({ ...v, rue: e.target.value })} />
      </Field>
    </>
  );
}

function formatAddress(addr) {
  if (!addr) return "—";
  const parts = [addr.rue, addr.localite].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

function ElevesView({ students, onAdd, onUpdate, onRemove, isDirection, isSecretaire, myClasses, schoolName, schoolLogo, schoolCode, paperFormat, paramsPassword }) {
  const canManage = isDirection || isSecretaire;
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_STUDENT_FORM);
  const [filter, setFilter] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [photoError, setPhotoError] = useState("");

  const openAdd = () => { setEditingId(null); setForm(EMPTY_STUDENT_FORM); setShowForm(true); };
  const openEdit = (s) => {
    setEditingId(s.id);
    setForm({
      nom: s.nom || "", prenom: s.prenom || "", classe: s.classe || "", photo: s.photo || "",
      sexe: s.sexe || "", nisu: s.nisu || "",
      dateNaissance: s.dateNaissance || "", lieuNaissance: s.lieuNaissance || "",
      adresse: { ...EMPTY_ADDRESS, ...(s.adresse || {}) },
      responsable: { ...EMPTY_RESPONSABLE, ...(s.responsable || {}), adresse: { ...EMPTY_ADDRESS, ...((s.responsable || {}).adresse || {}) } },
    });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(EMPTY_STUDENT_FORM); };

  const submit = () => {
    if (!form.nom.trim() || !form.classe.trim()) return;
    if (editingId) onUpdate(editingId, form);
    else onAdd(form);
    closeForm();
  };

  const handlePhoto = async (file) => {
    if (!file) return;
    try {
      setPhotoError("");
      const dataUrl = await resizePhoto(file);
      setForm((f) => ({ ...f, photo: dataUrl }));
    } catch {
      setPhotoError("Impossible de lire cette photo, réessayez avec une autre image.");
    }
  };

  const visible = canManage ? students : students.filter((s) => (myClasses || []).includes(s.classe));
  const filtered = visible.filter((s) => `${s.nom} ${s.prenom} ${s.classe} ${formatMatricule(s.nom, s.prenom, s.matriculeNum)}`.toLowerCase().includes(filter.toLowerCase()));
  const detailStudent = students.find((s) => s.id === detailId) || null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <SectionTitle sub={`${visible.length} élève${visible.length !== 1 ? "s" : ""}${!canManage ? " dans vos classes" : " enregistrés"}`}>Élèves</SectionTitle>
        {canManage && <button onClick={openAdd} style={btnPrimary}><Plus size={16} /> Ajouter un élève</button>}
      </div>

      <input placeholder="Rechercher un nom, une classe ou un matricule…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ ...inputStyle, maxWidth: 320, marginBottom: 20 }} />

      {showForm && canManage && (
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{editingId ? "Modifier l'élève" : "Nouvel élève"}</div>
            <button onClick={closeForm} style={iconBtn}><X size={16} /></button>
          </div>
          <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 18 }}>
            <Avatar photo={form.photo} name={form.nom} size={56} />
            <div>
              <label style={{ ...linkBtn, cursor: "pointer" }}>
                Choisir une photo
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handlePhoto(e.target.files?.[0])} />
              </label>
              {form.photo && <button onClick={() => setForm({ ...form, photo: "" })} style={{ ...linkBtn, marginLeft: 12, color: "#A3272E" }}>Retirer</button>}
              {photoError && <div style={{ fontSize: 12, color: "#A3272E", marginTop: 4 }}>{photoError}</div>}
            </div>
          </div>

          <div style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>Élève</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <Field label="Nom *"><input style={{ ...inputStyle, textTransform: "uppercase" }} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value.toUpperCase() })} /></Field>
            <Field label="Prénom"><input style={inputStyle} value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} /></Field>
            <Field label="Classe *">
              <select style={inputStyle} value={form.classe} onChange={(e) => setForm({ ...form, classe: e.target.value })}>
                <option value="">Sélectionner…</option>
                {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="NISU"><input style={inputStyle} value={form.nisu} onChange={(e) => setForm({ ...form, nisu: e.target.value })} /></Field>
            <Field label="Date de naissance"><input type="date" style={inputStyle} value={form.dateNaissance} onChange={(e) => setForm({ ...form, dateNaissance: e.target.value })} /></Field>
            <Field label="Lieu de naissance"><input style={inputStyle} value={form.lieuNaissance} onChange={(e) => setForm({ ...form, lieuNaissance: e.target.value })} /></Field>
          </div>

          <Field label="Sexe">
            <div style={{ display: "flex", gap: 18, marginTop: 4 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                <input type="radio" name="sexe" checked={form.sexe === "Masculin"} onChange={() => setForm({ ...form, sexe: "Masculin" })} /> Masculin
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                <input type="radio" name="sexe" checked={form.sexe === "Féminin"} onChange={() => setForm({ ...form, sexe: "Féminin" })} /> Féminin
              </label>
            </div>
          </Field>

          <div style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase", margin: "18px 0 10px" }}>Adresse de l'élève</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
            <AddressFields value={form.adresse} onChange={(v) => setForm({ ...form, adresse: v })} />
          </div>

          <div style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>Personne responsable</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <Field label="Nom"><input style={{ ...inputStyle, textTransform: "uppercase" }} value={form.responsable.nom} onChange={(e) => setForm({ ...form, responsable: { ...form.responsable, nom: e.target.value.toUpperCase() } })} /></Field>
            <Field label="Prénom"><input style={inputStyle} value={form.responsable.prenom} onChange={(e) => setForm({ ...form, responsable: { ...form.responsable, prenom: e.target.value } })} /></Field>
            <Field label="Numéro d'identité"><input style={inputStyle} value={form.responsable.numeroId} onChange={(e) => setForm({ ...form, responsable: { ...form.responsable, numeroId: e.target.value } })} /></Field>
            <Field label="Lien de parenté"><input style={inputStyle} placeholder="ex: Mère, Père, Tuteur" value={form.responsable.lienParente} onChange={(e) => setForm({ ...form, responsable: { ...form.responsable, lienParente: e.target.value } })} /></Field>
            <Field label="Téléphone"><input style={inputStyle} value={form.responsable.telephone} onChange={(e) => setForm({ ...form, responsable: { ...form.responsable, telephone: e.target.value } })} /></Field>
          </div>
          <div style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>Adresse du responsable</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <AddressFields value={form.responsable.adresse} onChange={(v) => setForm({ ...form, responsable: { ...form.responsable, adresse: v } })} />
          </div>

          <ConfirmButton
            onConfirm={submit}
            message={editingId ? "Confirmer l'enregistrement des modifications de cet élève ?" : "Confirmer l'enregistrement de ce nouvel élève ?"}
            requirePassword={editingId && !isDirection ? paramsPassword : undefined}
            style={{ ...btnPrimary, marginTop: 20 }}
          >
            {editingId ? "Enregistrer les modifications" : "Enregistrer l'élève"}
          </ConfirmButton>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState text={visible.length === 0 ? "Aucun élève à afficher pour l'instant." : "Aucun résultat pour cette recherche."} />
      ) : (
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E5E1D6", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#F1EEE5", textAlign: "left" }}>
                <th style={th}></th><th style={th}>Matricule</th><th style={th}>Nom</th><th style={th}>Classe</th><th style={th}>Responsable</th><th style={th}>Téléphone</th>
                <th style={{ ...th, width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const resp = s.responsable || {};
                return (
                  <tr key={s.id} style={{ borderTop: "1px solid #EEE" }}>
                    <td style={{ ...td, width: 52 }}><Avatar photo={s.photo} name={`${s.nom} ${s.prenom}`} /></td>
                    <td style={{ ...td, color: "#8B8578" }}>{formatMatricule(s.nom, s.prenom, s.matriculeNum)}</td>
                    <td style={td}>{s.nom} {s.prenom}</td>
                    <td style={td}>{s.classe}</td>
                    <td style={td}>{[resp.prenom, resp.nom].filter(Boolean).join(" ") || "—"}</td>
                    <td style={td}>{resp.telephone || "—"}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setDetailId(s.id)} style={iconBtn}><FileText size={15} color="#1E4D8C" /></button>
                        {isDirection && <button onClick={() => openEdit(s)} style={iconBtn}><UserCog size={15} color="#1E4D8C" /></button>}
                        {isDirection && (
                          <ConfirmButton
                            onConfirm={() => onRemove(s.id)}
                            message={`Confirmer la suppression de ${s.nom} ${s.prenom || ""} ?`}
                            style={iconBtn}
                          >
                            <Trash2 size={15} color="#A3272E" />
                          </ConfirmButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detailStudent && <StudentDetailModal student={detailStudent} onClose={() => setDetailId(null)} schoolName={schoolName} schoolLogo={schoolLogo} schoolCode={schoolCode} paperFormat={paperFormat} />}
    </div>
  );
}

function StudentDetailModal({ student, onClose, schoolName, schoolLogo, schoolCode, paperFormat }) {
  const resp = student.responsable || {};
  const paper = PAPER_FORMATS[paperFormat] || PAPER_FORMATS.A4;
  return (
    <div className="fiche-modal-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(27,42,74,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .fiche-print-area, .fiche-print-area * { visibility: visible; }
          .fiche-print-area { position: absolute; top: 0; left: 0; width: ${paper.width} !important; min-height: ${paper.height}; box-shadow: none !important; border: none !important; padding: 18mm !important; }
          .fiche-modal-overlay { position: static !important; background: none !important; padding: 0 !important; }
          .fiche-no-print { display: none !important; }
        }
      `}</style>
      <div className="fiche-print-area" onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 12, padding: 28, width: 460, maxWidth: "100%" }}>
        <div className="fiche-no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
          <button onClick={() => window.print()} style={iconBtn}><Printer size={17} color="#1E4D8C" /></button>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "2px solid var(--primary)", paddingBottom: 14, marginBottom: 18 }}>
          {schoolLogo ? <img src={schoolLogo} alt="Logo" style={{ width: 30, height: 30, borderRadius: 6, objectFit: "cover" }} /> : <School size={20} color="#A3272E" />}
          <div>
            <div style={{ fontFamily: "var(--heading-font)", fontSize: 16, color: "var(--primary)" }}>{schoolName}</div>
            <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#A3272E", fontWeight: 600 }}>Fiche technique de l'élève</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 18 }}>
          <Avatar photo={student.photo} name={`${student.nom} ${student.prenom}`} size={54} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{student.nom} {student.prenom}</div>
            <div style={{ fontSize: 13, color: "#8B8578" }}>{student.classe}{student.sexe ? ` · ${student.sexe}` : ""}</div>
            <div style={{ fontSize: 12.5, color: "#1E4D8C", fontWeight: 600, marginTop: 2 }}>Matricule : {formatMatricule(student.nom, student.prenom, student.matriculeNum)}</div>
          </div>
        </div>

        <div style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>Élève</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: 14, marginBottom: 20 }}>
          <div><strong>Sexe :</strong> {student.sexe || "—"}</div>
          <div><strong>NISU :</strong> {student.nisu || "—"}</div>
          <div><strong>Date de naissance :</strong> {student.dateNaissance || "—"}</div>
          <div><strong>Lieu de naissance :</strong> {student.lieuNaissance || "—"}</div>
          <div style={{ gridColumn: "1 / -1" }}><strong>Adresse :</strong> {formatAddress(student.adresse)}</div>
        </div>
        <div style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>Personne responsable</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: 14 }}>
          <div><strong>Nom :</strong> {resp.nom || "—"}</div>
          <div><strong>Prénom :</strong> {resp.prenom || "—"}</div>
          <div><strong>N° d'identité :</strong> {resp.numeroId || "—"}</div>
          <div><strong>Lien de parenté :</strong> {resp.lienParente || "—"}</div>
          <div><strong>Téléphone :</strong> {resp.telephone || "—"}</div>
          <div style={{ gridColumn: "1 / -1" }}><strong>Adresse :</strong> {formatAddress(resp.adresse)}</div>
        </div>
      </div>
    </div>
  );
}

function NotesView({ students, subjects, classSubjects, grades, mentions, coefficients, isDirection, isSecretaire, myClasses, onSetScore, onSetMention, paramsPassword }) {
  const fullAccess = isDirection || isSecretaire;
  const allClasses = [...new Set(students.map((s) => s.classe))].filter(Boolean);
  const classes = fullAccess ? allClasses : allClasses.filter((c) => (myClasses || []).includes(c));
  const [classe, setClasse] = useState(classes[0] || "");
  const [studentId, setStudentId] = useState("");
  const [period, setPeriod] = useState(PERIODS[0]);
  const [draft, setDraft] = useState({});
  const [mentionDraft, setMentionDraft] = useState({});
  const [savedMsg, setSavedMsg] = useState(false);

  const isKind = KIND_CLASSES.includes(classe);
  const effectiveSubjects = (classSubjects?.[classe]?.length ? classSubjects[classe] : subjects);

  useEffect(() => { if (!classe && classes.length) setClasse(classes[0]); }, [classes, classe]);
  const classStudents = students.filter((s) => s.classe === classe);
  useEffect(() => {
    if (classStudents.length && !classStudents.find((s) => s.id === studentId)) setStudentId(classStudents[0].id);
    if (!classStudents.length) setStudentId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classe, students]);

  useEffect(() => {
    const nextDraft = {}; const nextMentions = {};
    effectiveSubjects.forEach((subj) => {
      const v = grades[`${studentId}|${subj}|${period}`];
      nextDraft[subj] = v === undefined ? "" : String(v);
      nextMentions[subj] = mentions?.[`${studentId}|${subj}|${period}`] || "";
    });
    setDraft(nextDraft); setMentionDraft(nextMentions);
    setSavedMsg(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, period, classe]);

  const student = students.find((s) => s.id === studentId);

  // Une note déjà enregistrée qui serait changée = une modification (demande le mot de passe Direction
  // si l'utilisateur n'est pas Direction). Une case encore vide qui reçoit sa première valeur = une simple saisie.
  const hasModification = effectiveSubjects.some((subj) => {
    if (isKind) {
      const current = mentions?.[`${studentId}|${subj}|${period}`] || "";
      const next = mentionDraft[subj] || "";
      return current !== "" && next !== current;
    }
    const current = grades[`${studentId}|${subj}|${period}`];
    const currentStr = current === undefined ? "" : String(current);
    const next = draft[subj] ?? "";
    return currentStr !== "" && next !== currentStr;
  });

  const saveAll = () => {
    effectiveSubjects.forEach((subj) => {
      if (isKind) {
        const val = mentionDraft[subj] || "";
        const current = mentions?.[`${studentId}|${subj}|${period}`] || "";
        if (val !== current) onSetMention(studentId, subj, period, val);
      } else {
        const raw = draft[subj];
        const current = grades[`${studentId}|${subj}|${period}`];
        const currentStr = current === undefined ? "" : String(current);
        if (raw === currentStr) return;
        const maxNote = coeffFor(coefficients, classe, subj);
        const value = raw === "" ? "" : Math.max(0, Math.min(maxNote, Number(raw)));
        onSetScore(studentId, subj, period, value);
      }
    });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
  };

  if (classes.length === 0) {
    return <div><SectionTitle>Notes</SectionTitle><EmptyState text={fullAccess ? "Ajoutez d'abord des élèves avant de saisir des notes." : "Aucune classe ne vous est assignée pour l'instant."} /></div>;
  }

  return (
    <div>
      <SectionTitle sub={isKind ? "Choisissez une mention pour chaque matière, puis cliquez sur Enregistrer" : "Saisissez les notes sur 100 pour chaque matière, puis cliquez sur Enregistrer"}>Notes</SectionTitle>
      <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
        <Field label="Classe"><select style={inputStyle} value={classe} onChange={(e) => setClasse(e.target.value)}>{classes.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
        <Field label="Élève"><select style={inputStyle} value={studentId} onChange={(e) => setStudentId(e.target.value)}>{classStudents.map((s) => <option key={s.id} value={s.id}>{s.nom} {s.prenom}</option>)}</select></Field>
        <Field label="Période"><select style={inputStyle} value={period} onChange={(e) => setPeriod(e.target.value)}>{PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
      </div>

      {student && (
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E5E1D6", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#F1EEE5", textAlign: "left" }}>
                <th style={th}>Matière</th>
                {isKind ? <th style={th}>Mention</th> : <><th style={{ ...th, width: 120 }}>Notes</th><th style={{ ...th, width: 110 }}>Coefficients</th><th style={th}>Appréciation</th></>}
              </tr>
            </thead>
            <tbody>
              {effectiveSubjects.map((subj) => {
                if (isKind) {
                  return (
                    <tr key={subj} style={{ borderTop: "1px solid #EEE" }}>
                      <td style={td}>{subj}</td>
                      <td style={td}>
                        <select style={inputStyle} value={mentionDraft[subj] || ""} onChange={(e) => setMentionDraft({ ...mentionDraft, [subj]: e.target.value })}>
                          <option value="">—</option>
                          {MENTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                }
                const value = draft[subj] ?? "";
                const maxNote = coeffFor(coefficients, classe, subj);
                const numValue = value === "" ? null : Number(value);
                const app = appreciation(numValue === null ? NaN : (numValue / maxNote) * 100);
                return (
                  <tr key={subj} style={{ borderTop: "1px solid #EEE" }}>
                    <td style={td}>{subj}</td>
                    <td style={td}>
                      <input
                        type="number" min="0" max={maxNote} placeholder="—"
                        value={value}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const clamped = raw === "" ? "" : String(Math.max(0, Math.min(maxNote, Number(raw))));
                          setDraft({ ...draft, [subj]: clamped });
                        }}
                        style={{ ...inputStyle, width: 90, padding: "6px 10px" }}
                      />
                      <span style={{ fontSize: 11.5, color: "#8B8578", marginLeft: 6 }}>/ {maxNote}</span>
                    </td>
                    <td style={{ ...td, color: "#8B8578" }}>{maxNote}</td>
                    <td style={{ ...td, color: app.color, fontWeight: 600 }}>{app.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px" }}>
            <ConfirmButton onConfirm={saveAll} message="Confirmer l'enregistrement de ces notes ?" requirePassword={(!isDirection && hasModification) ? paramsPassword : undefined} style={btnPrimary}>Enregistrer</ConfirmButton>
            {savedMsg && <span style={{ fontSize: 13, color: "#3D6B4F", fontWeight: 600 }}>Notes enregistrées ✓</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function BulletinsView({ students, subjects, classSubjects, grades, mentions, schoolName, schoolLogo, schoolCode, isDirection, isSecretaire, myClasses, academicYear, coefficients, remarks, onSetRemark, paperFormat }) {
  const fullAccess = isDirection || isSecretaire;
  const visibleStudents = fullAccess ? students : students.filter((s) => (myClasses || []).includes(s.classe));
  const [studentId, setStudentId] = useState(visibleStudents[0]?.id || "");
  const [period, setPeriod] = useState(PERIODS[0]);
  const student = visibleStudents.find((s) => s.id === studentId);
  const isKind = student ? KIND_CLASSES.includes(student.classe) : false;
  const effectiveSubjects = student ? (classSubjects?.[student.classe]?.length ? classSubjects[student.classe] : subjects) : subjects;
  const paper = PAPER_FORMATS[paperFormat] || PAPER_FORMATS.A4;
  const remarkKey = `${studentId}|${period}`;
  const [remarkDraft, setRemarkDraft] = useState(remarks?.[remarkKey] || "");
  const [remarkSaved, setRemarkSaved] = useState(false);

  useEffect(() => {
    setRemarkDraft(remarks?.[remarkKey] || "");
    setRemarkSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remarkKey]);

  useEffect(() => {
    if (visibleStudents.length && !visibleStudents.find((s) => s.id === studentId)) setStudentId(visibleStudents[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleStudents.length]);

  if (visibleStudents.length === 0) return <div><SectionTitle>Bulletins</SectionTitle><EmptyState text="Aucun élève à afficher pour l'instant." /></div>;

  const rows = student ? effectiveSubjects.map((subj) => {
    const score = grades[`${studentId}|${subj}|${period}`];
    const coeff = coeffFor(coefficients, student.classe, subj);
    const note = typeof score === "number" ? score : null;
    const mention = mentions?.[`${studentId}|${subj}|${period}`] || "";
    return { subj, note, coeff, mention };
  }) : [];

  const totalCoeff = rows.filter((r) => r.note !== null).reduce((a, r) => a + r.coeff, 0);
  const totalNotes = rows.filter((r) => r.note !== null).reduce((a, r) => a + r.note, 0);
  const moyenneSur100 = totalCoeff > 0 ? (totalNotes / totalCoeff) * 100 : null;
  const moyenneSur10 = moyenneSur100 !== null ? moyenneSur100 / 10 : null;
  const sur10 = student ? MOYENNE_SUR_10_CLASSES.includes(student.classe) : true;
  const moyenneAffichee = sur10 ? moyenneSur10 : moyenneSur100;
  const overall = appreciation(moyenneSur100);
  const { ranks, total } = student && !isKind ? classRanking(students, student.classe, period, effectiveSubjects, grades, coefficients) : { ranks: {}, total: 0 };
  const place = student ? ranks[student.id] : null;

  return (
    <div>
      <SectionTitle sub="Un bulletin par trimestre, avec coefficients et place dans la classe">Bulletins</SectionTitle>
      <div className="no-print" style={{ display: "flex", gap: 14, marginBottom: 28, flexWrap: "wrap" }}>
        <Field label="Élève"><select style={inputStyle} value={studentId} onChange={(e) => setStudentId(e.target.value)}>{visibleStudents.map((s) => <option key={s.id} value={s.id}>{s.nom} {s.prenom} — {s.classe}</option>)}</select></Field>
        <Field label="Trimestre"><select style={inputStyle} value={period} onChange={(e) => setPeriod(e.target.value)}>{PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
        <button onClick={() => window.print()} style={{ ...btnPrimary, alignSelf: "flex-end" }}><Printer size={16} /> Imprimer / PDF</button>
      </div>

      {student && (
        <>
        <style>{`
          @media print {
            .bulletin-print-area { width: ${paper.width} !important; min-height: ${paper.height}; padding: 18mm !important; margin: 0 auto !important; box-shadow: none !important; border: none !important; }
          }
        `}</style>
        <div className="print-area bulletin-print-area" style={{ background: "white", border: "1px solid #E5E1D6", borderRadius: 10, padding: "44px 52px", maxWidth: 720, boxShadow: "0 1px 3px rgba(27,42,74,0.06)" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, borderBottom: "2px solid var(--primary)", paddingBottom: 18, marginBottom: 24 }}>
            {schoolLogo && <img src={schoolLogo} alt="Logo" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }} />}
            <div style={{ fontFamily: "var(--heading-font)", fontSize: 22, color: "var(--primary)" }}>{schoolName}</div>
            <div style={{ fontSize: 12.5, letterSpacing: 1.5, textTransform: "uppercase", color: "#A3272E", fontWeight: 600 }}>Bulletin Scolaire</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px", fontSize: 14, marginBottom: 10 }}>
            <div><strong>Matricule :</strong> {formatMatricule(student.nom, student.prenom, student.matriculeNum)}</div>
            <div><strong>Classe :</strong> {student.classe}</div>
            <div><strong>Nom :</strong> {student.nom}</div>
            <div><strong>Prénom :</strong> {student.prenom || "—"}</div>
            <div><strong>Sexe :</strong> {student.sexe || "—"}</div>
          </div>
          <div style={{ display: "flex", gap: 24, fontSize: 14, marginBottom: 28, flexWrap: "wrap", borderTop: "1px dashed #E5E1D6", paddingTop: 10 }}>
            <div><strong>Année académique :</strong> {academicYear || "—"}</div>
            <div><strong>Trimestre :</strong> {period}</div>
          </div>

          {isKind ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, marginBottom: 24 }}>
              <thead><tr style={{ borderBottom: "1.5px solid var(--primary)" }}><th style={{ ...thBulletin, textAlign: "left" }}>Matière</th><th style={thBulletin}>Mention</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.subj} style={{ borderBottom: "1px solid #EEE" }}>
                    <td style={tdBulletin}>{r.subj}</td>
                    <td style={{ ...tdBulletin, textAlign: "center", fontWeight: 600 }}>{r.mention || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, marginBottom: 24 }}>
              <thead><tr style={{ borderBottom: "1.5px solid var(--primary)" }}><th style={{ ...thBulletin, textAlign: "left" }}>Matière</th><th style={thBulletin}>Note</th><th style={thBulletin}>Coefficient</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  return (
                    <tr key={r.subj} style={{ borderBottom: "1px solid #EEE" }}>
                      <td style={tdBulletin}>{r.subj}</td>
                      <td style={{ ...tdBulletin, textAlign: "center" }}>{r.note !== null ? r.note : "—"}</td>
                      <td style={{ ...tdBulletin, textAlign: "center" }}>{r.coeff}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {!isKind && (
            <>
            <div style={{ fontSize: 14, marginBottom: 12 }}><strong>Total des notes :</strong> {totalNotes.toFixed(1)}</div>
            <div style={{ display: "flex", gap: 12, marginBottom: 40 }}>
              <div style={{ flex: 1, background: "#F1EEE5", borderRadius: 8, padding: "14px 20px" }}>
                <div style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase" }}>Moyenne</div>
                <div style={{ fontSize: 20, fontFamily: "var(--heading-font)", color: "var(--primary)", marginTop: 4 }}>
                  {moyenneAffichee !== null ? moyenneAffichee.toFixed(1) : "—"} / {sur10 ? 10 : 100}
                  <span style={{ fontSize: 12.5, color: overall.color, marginLeft: 8, fontWeight: 600 }}>{overall.label}</span>
                </div>
              </div>
              <div style={{ flex: 1, background: "#F1EEE5", borderRadius: 8, padding: "14px 20px" }}>
                <div style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase" }}>Place</div>
                <div style={{ fontSize: 20, fontFamily: "var(--heading-font)", color: "var(--primary)", marginTop: 4 }}>
                  {place !== null && place !== undefined ? `${place}${place === 1 ? (student.sexe === "Masculin" ? "er" : "ère") : "ème"}` : "—"}
                  {total > 0 && <span style={{ fontSize: 12.5, color: "#8B8578", marginLeft: 8 }}>sur {total}</span>}
                </div>
              </div>
            </div>
            </>
          )}

          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>Remarque</div>
            <div style={{ border: "1px solid #CFC9B8", borderRadius: 8, padding: "12px 16px", minHeight: 54 }}>
              {isDirection ? (
                <div className="no-print">
                  <textarea
                    rows={2} maxLength={140}
                    value={remarkDraft}
                    onChange={(e) => { setRemarkDraft(e.target.value); setRemarkSaved(false); }}
                    placeholder="Commentaire de la direction (2 lignes maximum)…"
                    style={{ width: "100%", border: "none", outline: "none", resize: "none", fontSize: 13.5, fontFamily: "inherit", background: "transparent" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: "#8B8578" }}>{remarkDraft.length}/140</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {remarkSaved && <span style={{ fontSize: 11.5, color: "#3D6B4F" }}>Enregistré ✓</span>}
                      <ConfirmButton onConfirm={() => { onSetRemark({ ...remarks, [remarkKey]: remarkDraft }); setRemarkSaved(true); }} message="Confirmer l'enregistrement de cette remarque ?" style={linkBtn}>Enregistrer</ConfirmButton>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap" }}>{remarks?.[remarkKey] || "—"}</div>
              )}
              <div className="remark-print-only" style={{ display: "none", fontSize: 13.5, whiteSpace: "pre-wrap" }}>{remarkDraft || "—"}</div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={{ borderTop: "1px solid #CFC9B8", paddingTop: 8, fontSize: 12.5, color: "#8B8578", width: 220, textAlign: "center" }}>Signature de la direction</div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

function StatistiquesView({ students, isDirection, myClasses }) {
  const visible = isDirection ? students : students.filter((s) => (myClasses || []).includes(s.classe));
  const parClasse = CLASSES.map((c) => ({ classe: c, count: visible.filter((s) => s.classe === c).length })).filter((r) => r.count > 0);
  const parSexe = { Masculin: visible.filter((s) => s.sexe === "Masculin").length, Féminin: visible.filter((s) => s.sexe === "Féminin").length };

  return (
    <div>
      <SectionTitle sub="Nombre d'élèves inscrits, au total et par classe">Statistiques</SectionTitle>

      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px", background: "white", border: "1px solid #E5E1D6", borderRadius: 10, padding: "18px 22px" }}>
          <div style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase" }}>Total des élèves</div>
          <div style={{ fontSize: 28, fontFamily: "var(--heading-font)", color: "var(--primary)", marginTop: 6 }}>{visible.length}</div>
        </div>
        <div style={{ flex: "1 1 200px", background: "white", border: "1px solid #E5E1D6", borderRadius: 10, padding: "18px 22px" }}>
          <div style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase" }}>Masculin</div>
          <div style={{ fontSize: 28, fontFamily: "var(--heading-font)", color: "var(--primary)", marginTop: 6 }}>{parSexe.Masculin}</div>
        </div>
        <div style={{ flex: "1 1 200px", background: "white", border: "1px solid #E5E1D6", borderRadius: 10, padding: "18px 22px" }}>
          <div style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase" }}>Féminin</div>
          <div style={{ fontSize: 28, fontFamily: "var(--heading-font)", color: "var(--primary)", marginTop: 6 }}>{parSexe.Féminin}</div>
        </div>
      </div>

      <div style={{ fontSize: 13, color: "#8B8578", fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>Élèves par classe</div>
      {parClasse.length === 0 ? (
        <EmptyState text="Aucun élève enregistré pour l'instant." />
      ) : (
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E5E1D6", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ background: "#F1EEE5", textAlign: "left" }}><th style={th}>Classe</th><th style={th}>Nombre d'élèves</th></tr></thead>
            <tbody>
              {parClasse.map((r) => (
                <tr key={r.classe} style={{ borderTop: "1px solid #EEE" }}>
                  <td style={td}>{r.classe}</td>
                  <td style={td}>{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DecisionFinAnneeView({ students, subjects, classSubjects, grades, coefficients, schoolName, schoolLogo, schoolCode, academicYear, paperFormat }) {
  const [mode, setMode] = useState("classe"); // classe | ecole
  const [classe, setClasse] = useState(CLASSES[0]);
  const paper = PAPER_FORMATS[paperFormat] || PAPER_FORMATS.A4;

  const computeRow = (s) => {
    if (KIND_CLASSES.includes(s.classe)) return { s, moyenne: null, mention: "—" };
    const effectiveSubjects = classSubjects?.[s.classe]?.length ? classSubjects[s.classe] : subjects;
    const avgs = PERIODS
      .map((p) => weightedAverage(s.id, s.classe, p, effectiveSubjects, grades, coefficients))
      .filter((v) => v !== null);
    const moyenne = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
    const mention = moyenne === null ? "—" : (moyenne >= 50 ? "Réussi(e)" : "Échoué(e)");
    return { s, moyenne, mention };
  };

  const list = mode === "classe" ? students.filter((s) => s.classe === classe) : students;
  const rows = list.map(computeRow).sort((a, b) => a.s.nom.localeCompare(b.s.nom));

  return (
    <div>
      <SectionTitle sub="Moyenne des trois trimestres et décision de fin d'année, par classe ou pour toute l'école">Décision de fin d'année</SectionTitle>

      <div className="no-print" style={{ display: "flex", gap: 14, marginBottom: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setMode("classe")} style={mode === "classe" ? btnPrimary : btnSecondary}>Par classe</button>
          <button onClick={() => setMode("ecole")} style={mode === "ecole" ? btnPrimary : btnSecondary}>Toute l'école</button>
        </div>
        {mode === "classe" && (
          <Field label="Classe">
            <select style={inputStyle} value={classe} onChange={(e) => setClasse(e.target.value)}>
              {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        )}
        <button onClick={() => window.print()} style={btnPrimary}><Printer size={16} /> Imprimer</button>
      </div>

      <style>{`@media print { .decision-print { width: ${paper.width} !important; min-height: ${paper.height}; padding: 18mm !important; margin: 0 auto !important; box-shadow: none !important; border: none !important; } }`}</style>
      <div className="print-area decision-print" style={{ background: "white", border: "1px solid #E5E1D6", borderRadius: 10, padding: "32px 36px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "2px solid var(--primary)", paddingBottom: 14, marginBottom: 20 }}>
          {schoolLogo ? <img src={schoolLogo} alt="Logo" style={{ width: 30, height: 30, borderRadius: 6, objectFit: "cover" }} /> : <School size={20} color="#A3272E" />}
          <div>
            <div style={{ fontFamily: "var(--heading-font)", fontSize: 16, color: "var(--primary)" }}>{schoolName}</div>
            <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#A3272E", fontWeight: 600 }}>
              Décision de fin d'année — {mode === "classe" ? classe : "Toute l'école"}{academicYear ? ` · ${academicYear}` : ""}
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ fontSize: 13.5, color: "#8B8578" }}>Aucun élève à afficher.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ borderBottom: "1.5px solid var(--primary)" }}>
                <th style={{ ...thBulletin, textAlign: "left" }}>Matricule</th>
                <th style={{ ...thBulletin, textAlign: "left" }}>Nom et Prénom</th>
                {mode === "ecole" && <th style={{ ...thBulletin, textAlign: "left" }}>Classe</th>}
                <th style={thBulletin}>Sexe</th>
                <th style={thBulletin}>Moyenne (3 trim.)</th>
                <th style={thBulletin}>Mention</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, moyenne, mention }) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #EEE" }}>
                  <td style={tdBulletin}>{formatMatricule(s.nom, s.prenom, s.matriculeNum)}</td>
                  <td style={tdBulletin}>{s.nom} {s.prenom}</td>
                  {mode === "ecole" && <td style={tdBulletin}>{s.classe}</td>}
                  <td style={{ ...tdBulletin, textAlign: "center" }}>{s.sexe || "—"}</td>
                  <td style={{ ...tdBulletin, textAlign: "center" }}>{moyenne !== null ? moyenne.toFixed(1) : "—"}</td>
                  <td style={{ ...tdBulletin, textAlign: "center", fontWeight: 600, color: mention === "Réussi(e)" ? "#3D6B4F" : mention === "Échoué(e)" ? "#A3272E" : "#8B8578" }}>{mention}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function PaiementsView({ students, payments, tuitionFees, currency, onAddPayment, onRemovePayment, schoolName, schoolLogo, schoolCode, paperFormat, isDirection, paramsPassword }) {
  const [mode, setMode] = useState("eleve"); // eleve | classe
  const [filter, setFilter] = useState("");
  const [studentId, setStudentId] = useState(students[0]?.id || "");
  const [form, setForm] = useState({ amount: "", date: new Date().toISOString().slice(0, 10), label: LIBELLES_PAIEMENT[0], note: "" });
  const [classeReport, setClasseReport] = useState(CLASSES[0]);
  const paper = PAPER_FORMATS[paperFormat] || PAPER_FORMATS.A4;

  const filtered = students.filter((s) =>
    `${s.nom} ${s.prenom} ${s.classe} ${formatMatricule(s.nom, s.prenom, s.matriculeNum)}`.toLowerCase().includes(filter.toLowerCase())
  );
  const student = students.find((s) => s.id === studentId);
  const studentPayments = payments.filter((p) => p.studentId === studentId);
  const inscriptionFee = student ? (tuitionFees[student.classe]?.inscription || 0) : 0;
  const scolariteFee = student ? (tuitionFees[student.classe]?.scolarite || 0) : 0;
  const inscriptionPaid = studentPayments.filter((p) => p.label === "Frais d'inscription").reduce((a, p) => a + p.amount, 0);
  const scolaritePaid = studentPayments.filter((p) => p.label !== "Frais d'inscription").reduce((a, p) => a + p.amount, 0);
  const totalFee = inscriptionFee + scolariteFee;
  const totalPaid = inscriptionPaid + scolaritePaid;
  const totalBalance = totalFee - totalPaid;

  const submit = () => {
    const amount = Number(form.amount);
    if (!studentId || !amount || amount <= 0) return;
    onAddPayment(studentId, form);
    setForm({ amount: "", date: new Date().toISOString().slice(0, 10), label: LIBELLES_PAIEMENT[0], note: "" });
  };

  if (students.length === 0) {
    return <div><SectionTitle>Paiements</SectionTitle><EmptyState text="Ajoutez d'abord des élèves pour enregistrer des paiements." /></div>;
  }

  return (
    <div>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <SectionTitle sub="Suivi des frais d'inscription et de scolarité, par élève ou par classe">Paiements</SectionTitle>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setMode("eleve")} style={mode === "eleve" ? btnPrimary : btnSecondary}>Par élève</button>
          <button onClick={() => setMode("classe")} style={mode === "classe" ? btnPrimary : btnSecondary}>Par classe</button>
        </div>
      </div>

      {mode === "eleve" && (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 24, alignItems: "flex-start" }}>
          <div className="no-print">
            <input placeholder="Nom, classe ou matricule…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ ...inputStyle, width: "100%", marginBottom: 12 }} />
            <div style={{ background: "white", borderRadius: 10, border: "1px solid #E5E1D6", maxHeight: 480, overflowY: "auto" }}>
              {filtered.map((s) => {
                const sPaid = payments.filter((p) => p.studentId === s.id).reduce((a, p) => a + p.amount, 0);
                const sFee = (tuitionFees[s.classe]?.inscription || 0) + (tuitionFees[s.classe]?.scolarite || 0);
                const due = sFee - sPaid;
                const active = s.id === studentId;
                return (
                  <button key={s.id} onClick={() => setStudentId(s.id)} style={{
                    display: "block", width: "100%", textAlign: "left", padding: "12px 14px",
                    background: active ? "#F1EEE5" : "white", border: "none", borderBottom: "1px solid #EEE", cursor: "pointer",
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--primary)" }}>{s.nom} {s.prenom}</div>
                    <div style={{ fontSize: 11.5, color: "#8B8578" }}>{formatMatricule(s.nom, s.prenom, s.matriculeNum)} · {s.classe}</div>
                    <div style={{ fontSize: 12, color: due > 0 ? "#A3272E" : "#3D6B4F", fontWeight: 600, marginTop: 2 }}>
                      {due > 0 ? `Reste ${formatMoney(due, currency)}` : "Soldé"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {student && (
            <div>
              <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                <button onClick={() => window.print()} style={btnPrimary}><Printer size={16} /> Imprimer l'état de paiement</button>
              </div>

              <style>{`@media print { .payment-state { width: ${paper.width} !important; min-height: ${paper.height}; padding: 18mm !important; margin: 0 auto !important; box-shadow: none !important; border: none !important; } }`}</style>
              <div className="print-area payment-state" style={{ background: "white", border: "1px solid #E5E1D6", borderRadius: 10, padding: "32px 36px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "2px solid var(--primary)", paddingBottom: 14, marginBottom: 20 }}>
                  {schoolLogo ? <img src={schoolLogo} alt="Logo" style={{ width: 30, height: 30, borderRadius: 6, objectFit: "cover" }} /> : <School size={20} color="#A3272E" />}
                  <div>
                    <div style={{ fontFamily: "var(--heading-font)", fontSize: 16, color: "var(--primary)" }}>{schoolName}</div>
                    <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#A3272E", fontWeight: 600 }}>État de paiement</div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px", fontSize: 14, marginBottom: 20 }}>
                  <div><strong>Matricule :</strong> {formatMatricule(student.nom, student.prenom, student.matriculeNum)}</div>
                  <div><strong>Classe :</strong> {student.classe}</div>
                  <div style={{ gridColumn: "1 / -1" }}><strong>Élève :</strong> {student.nom} {student.prenom}</div>
                </div>

                <div style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>Frais d'inscription</div>
                <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
                  <FeeBox label="Frais" value={formatMoney(inscriptionFee, currency)} />
                  <FeeBox label="Payé" value={formatMoney(inscriptionPaid, currency)} color="#3D6B4F" />
                  <FeeBox label="Solde" value={formatMoney(Math.max(0, inscriptionFee - inscriptionPaid), currency)} color={inscriptionFee - inscriptionPaid > 0 ? "#A3272E" : "#3D6B4F"} />
                </div>

                <div style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>Frais de scolarité</div>
                <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
                  <FeeBox label="Frais" value={formatMoney(scolariteFee, currency)} />
                  <FeeBox label="Payé" value={formatMoney(scolaritePaid, currency)} color="#3D6B4F" />
                  <FeeBox label="Solde" value={formatMoney(Math.max(0, scolariteFee - scolaritePaid), currency)} color={scolariteFee - scolaritePaid > 0 ? "#A3272E" : "#3D6B4F"} />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#F1EEE5", borderRadius: 8, padding: "12px 16px", marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Total général</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: totalBalance > 0 ? "#A3272E" : "#3D6B4F" }}>
                    {formatMoney(totalPaid, currency)} payé — solde {formatMoney(Math.max(0, totalBalance), currency)}
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>Historique des paiements</div>
                {studentPayments.length === 0 ? (
                  <div style={{ fontSize: 13.5, color: "#8B8578" }}>Aucun paiement enregistré.</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                    <thead><tr style={{ borderBottom: "1.5px solid var(--primary)" }}><th style={{ ...thBulletin, textAlign: "left" }}>Date</th><th style={{ ...thBulletin, textAlign: "left" }}>Libellé</th><th style={thBulletin}>Montant</th></tr></thead>
                    <tbody>
                      {studentPayments.map((p) => (
                        <tr key={p.id} style={{ borderBottom: "1px solid #EEE" }}>
                          <td style={tdBulletin}>{p.date}</td>
                          <td style={tdBulletin}>{p.label || "—"}</td>
                          <td style={{ ...tdBulletin, textAlign: "center", fontWeight: 600 }}>{formatMoney(p.amount, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="no-print" style={{ marginTop: 24 }}>
                <div style={cardStyle}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Enregistrer un paiement</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <Field label="Montant"><input type="number" min="0" style={inputStyle} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
                    <Field label="Date"><input type="date" style={inputStyle} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
                    <Field label="Libellé">
                      <select style={inputStyle} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}>
                        {LIBELLES_PAIEMENT.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </Field>
                    <Field label="Note"><input style={inputStyle} placeholder="optionnel" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
                  </div>
                  <ConfirmButton onConfirm={submit} message="Confirmer l'enregistrement de ce paiement ?" style={btnPrimary}>Enregistrer le paiement</ConfirmButton>
                </div>

                <div style={{ fontSize: 13, color: "#8B8578", fontWeight: 600, textTransform: "uppercase", margin: "20px 0 10px" }}>Modifier l'historique</div>
                {studentPayments.length === 0 ? (
                  <EmptyState text="Aucun paiement enregistré pour cet élève." />
                ) : (
                  <div style={{ background: "white", borderRadius: 10, border: "1px solid #E5E1D6", overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead><tr style={{ background: "#F1EEE5", textAlign: "left" }}><th style={th}>Date</th><th style={th}>Libellé</th><th style={th}>Montant</th><th style={th}>Note</th><th style={{ ...th, width: 40 }}></th></tr></thead>
                      <tbody>
                        {studentPayments.map((p) => (
                          <tr key={p.id} style={{ borderTop: "1px solid #EEE" }}>
                            <td style={td}>{p.date}</td>
                            <td style={td}>{p.label || "—"}</td>
                            <td style={{ ...td, fontWeight: 600 }}>{formatMoney(p.amount, currency)}</td>
                            <td style={td}>{p.note || "—"}</td>
                            <td style={td}>
                              {isDirection && (
                                <ConfirmButton
                                  onConfirm={() => onRemovePayment(p.id)}
                                  message="Confirmer la suppression de ce paiement ?"
                                  style={iconBtn}
                                >
                                  <Trash2 size={15} color="#A3272E" />
                                </ConfirmButton>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "classe" && (
        <ClassePaymentReport
          students={students} payments={payments} tuitionFees={tuitionFees} currency={currency}
          schoolName={schoolName} schoolLogo={schoolLogo} schoolCode={schoolCode} paperFormat={paperFormat}
          classe={classeReport} setClasse={setClasseReport}
        />
      )}
    </div>
  );
}

function FeeBox({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: "#F1EEE5", borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ fontSize: 10.5, color: "#8B8578", fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 14, fontFamily: "var(--heading-font)", color: color || "var(--primary)", marginTop: 3 }}>{value}</div>
    </div>
  );
}

function ClassePaymentReport({ students, payments, tuitionFees, currency, schoolName, schoolLogo, schoolCode, paperFormat, classe, setClasse }) {
  const classStudents = students.filter((s) => s.classe === classe).sort((a, b) => a.nom.localeCompare(b.nom));
  const fee = (tuitionFees[classe]?.inscription || 0) + (tuitionFees[classe]?.scolarite || 0);
  const paper = PAPER_FORMATS[paperFormat] || PAPER_FORMATS.A4;
  const rows = classStudents.map((s) => {
    const paid = payments.filter((p) => p.studentId === s.id).reduce((a, p) => a + p.amount, 0);
    const balance = fee - paid;
    let statut = "Soldé";
    if (balance > 0 && paid > 0) statut = "Partiel";
    else if (balance > 0 && paid === 0) statut = "Impayé";
    return { s, paid, balance, statut };
  });
  const totalPaid = rows.reduce((a, r) => a + r.paid, 0);
  const totalDue = rows.reduce((a, r) => a + Math.max(0, r.balance), 0);
  const statutColor = { "Soldé": "#3D6B4F", "Partiel": "#A3272E", "Impayé": "#A3272E" };

  return (
    <div>
      <div className="no-print" style={{ display: "flex", gap: 14, marginBottom: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Field label="Classe"><select style={inputStyle} value={classe} onChange={(e) => setClasse(e.target.value)}>{CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
        <button onClick={() => window.print()} style={btnPrimary}><Printer size={16} /> Imprimer l'état de la classe</button>
      </div>

      <style>{`@media print { .classe-payment-print { width: ${paper.width} !important; min-height: ${paper.height}; padding: 18mm !important; margin: 0 auto !important; box-shadow: none !important; border: none !important; } }`}</style>
      <div className="print-area classe-payment-print" style={{ background: "white", border: "1px solid #E5E1D6", borderRadius: 10, padding: "32px 36px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "2px solid var(--primary)", paddingBottom: 14, marginBottom: 20 }}>
          {schoolLogo ? <img src={schoolLogo} alt="Logo" style={{ width: 30, height: 30, borderRadius: 6, objectFit: "cover" }} /> : <School size={20} color="#A3272E" />}
          <div>
            <div style={{ fontFamily: "var(--heading-font)", fontSize: 16, color: "var(--primary)" }}>{schoolName}</div>
            <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#A3272E", fontWeight: 600 }}>État de paiement — {classe}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, background: "#F1EEE5", borderRadius: 8, padding: "12px 16px" }}>
            <div style={{ fontSize: 11, color: "#8B8578", fontWeight: 600, textTransform: "uppercase" }}>Frais par élève (total)</div>
            <div style={{ fontSize: 16, fontFamily: "var(--heading-font)", color: "var(--primary)", marginTop: 4 }}>{formatMoney(fee, currency)}</div>
          </div>
          <div style={{ flex: 1, background: "#F1EEE5", borderRadius: 8, padding: "12px 16px" }}>
            <div style={{ fontSize: 11, color: "#8B8578", fontWeight: 600, textTransform: "uppercase" }}>Total encaissé</div>
            <div style={{ fontSize: 16, fontFamily: "var(--heading-font)", color: "#3D6B4F", marginTop: 4 }}>{formatMoney(totalPaid, currency)}</div>
          </div>
          <div style={{ flex: 1, background: "#F1EEE5", borderRadius: 8, padding: "12px 16px" }}>
            <div style={{ fontSize: 11, color: "#8B8578", fontWeight: 600, textTransform: "uppercase" }}>Total restant dû</div>
            <div style={{ fontSize: 16, fontFamily: "var(--heading-font)", color: totalDue > 0 ? "#A3272E" : "#3D6B4F", marginTop: 4 }}>{formatMoney(totalDue, currency)}</div>
          </div>
        </div>

        {classStudents.length === 0 ? (
          <div style={{ fontSize: 13.5, color: "#8B8578" }}>Aucun élève dans cette classe.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ borderBottom: "1.5px solid var(--primary)" }}>
                <th style={{ ...thBulletin, textAlign: "left" }}>Matricule</th>
                <th style={{ ...thBulletin, textAlign: "left" }}>Nom</th>
                <th style={thBulletin}>Payé</th>
                <th style={thBulletin}>Solde</th>
                <th style={thBulletin}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, paid, balance, statut }) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #EEE" }}>
                  <td style={tdBulletin}>{formatMatricule(s.nom, s.prenom, s.matriculeNum)}</td>
                  <td style={tdBulletin}>{s.nom} {s.prenom}</td>
                  <td style={{ ...tdBulletin, textAlign: "center" }}>{formatMoney(paid, currency)}</td>
                  <td style={{ ...tdBulletin, textAlign: "center" }}>{formatMoney(Math.max(0, balance), currency)}</td>
                  <td style={{ ...tdBulletin, textAlign: "center", fontWeight: 600, color: statutColor[statut] }}>{statut}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================
// App racine — session Supabase, puis Connexion ou Application
// ============================================================
export default function App() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async (userId) => {
    setLoadingProfile(true);
    setProfileError("");
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error || !data) {
      setProfileError("Ce compte n'est pas encore configuré pour une école. Contactez la Direction de votre établissement.");
      setProfile(null);
    } else {
      setProfile(data);
    }
    setLoadingProfile(false);
  }, []);

  useEffect(() => {
    if (session) loadProfile(session.user.id);
    else { setProfile(null); setProfileError(""); }
  }, [session, loadProfile]);

  if (session === undefined || loadingProfile) return <Centered>Chargement…</Centered>;
  if (!session) return <AuthScreen />;
  if (profileError) {
    return (
      <Centered>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <div style={{ marginBottom: 18, fontSize: 14 }}>{profileError}</div>
          <button onClick={() => supabase.auth.signOut()} style={btnPrimary}>Se déconnecter</button>
        </div>
      </Centered>
    );
  }
  if (!profile) return <Centered>Chargement du profil…</Centered>;
  return <MainApp profile={profile} />;
}

function Centered({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F5F0", fontFamily: "Georgia, serif", color: "#1B2A4A" }}>
      {children}
    </div>
  );
}

// ============================================================
// Écran de connexion — email + mot de passe uniquement.
// Aucune création de compte ici : seule la Direction crée des
// comptes (onglet Utilisateurs) ; la toute première Direction de
// chaque école est provisionnée par l'éditeur de l'application.
// ============================================================
function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(""); setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError("Email ou mot de passe incorrect.");
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#1B2A4A", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ background: "#F7F5F0", borderRadius: 14, padding: 40, width: 400, boxShadow: "0 10px 40px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <School size={22} color="#D4A24C" />
          <div style={{ fontFamily: "Georgia, serif", fontSize: 19, color: "#1B2A4A" }}>Gestion Scolaire</div>
        </div>
        <Field label="Email">
          <input type="email" autoComplete="off" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <div style={{ height: 12 }} />
        <Field label="Mot de passe">
          <input type="password" autoComplete="off" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </Field>
        {error && <div style={{ fontSize: 12.5, color: "#A3272E", marginTop: 12 }}>{error}</div>}
        <button disabled={busy} onClick={submit} style={{ ...btnPrimary, marginTop: 20, width: "100%", justifyContent: "center", background: "#1B2A4A" }}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
        <div style={{ fontSize: 11.5, color: "#8B8578", marginTop: 20, lineHeight: 1.5 }}>
          Vous n'avez pas de compte ? Seule la Direction de votre école peut vous en créer un.
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Application principale (une fois connecté avec un profil)
// ============================================================
function MainApp({ profile }) {
  const schoolId = profile.school_id;
  const [tab, setTab] = useState("eleves");
  const [loaded, setLoaded] = useState(false);
  const [schoolName, setSchoolNameState] = useState("Mon École");
  const [schoolCode, setSchoolCodeState] = useState("");
  const [schoolLogo, setSchoolLogoState] = useState("");
  const [academicYear, setAcademicYearState] = useState("");
  const [currency, setCurrencyState] = useState("HTG");
  const [themeColor, setThemeColorState] = useState("#1B2A4A");
  const [themeStyle, setThemeStyleState] = useState("classique");
  const [paperFormat, setPaperFormatState] = useState("A4");
  const [paramsPassword, setParamsPasswordState] = useState("");
  const [subjects, setSubjectsState] = useState([]);
  const [classSubjects, setClassSubjectsState] = useState({});
  const [students, setStudents] = useState([]);
  const [grades, setGrades] = useState({});
  const [mentions, setMentions] = useState({});
  const [coefficients, setCoefficientsState] = useState({});
  const [tuitionFees, setTuitionFeesState] = useState({});
  const [payments, setPayments] = useState([]);
  const [remarks, setRemarks] = useState({});
  const [users, setUsers] = useState([]);

  const loadAll = useCallback(async () => {
    const [schoolRes, subjectsRes, classSubjRes, studentsRes, gradesRes, mentionsRes, coeffRes, feesRes, paymentsRes, remarksRes, profilesRes] = await Promise.all([
      supabase.from("schools").select("*").eq("id", schoolId).single(),
      supabase.from("subjects").select("*").eq("school_id", schoolId).order("name"),
      supabase.from("class_subjects").select("*").eq("school_id", schoolId),
      supabase.from("students").select("*").eq("school_id", schoolId).order("nom"),
      supabase.from("grades").select("*").eq("school_id", schoolId),
      supabase.from("mentions").select("*").eq("school_id", schoolId),
      supabase.from("coefficients").select("*").eq("school_id", schoolId),
      supabase.from("tuition_fees").select("*").eq("school_id", schoolId),
      supabase.from("payments").select("*").eq("school_id", schoolId).order("payment_date", { ascending: false }),
      supabase.from("remarks").select("*").eq("school_id", schoolId),
      supabase.from("profiles").select("*").eq("school_id", schoolId).order("name"),
    ]);

    const s = schoolRes.data || {};
    setSchoolNameState(s.name || "Mon École");
    setSchoolCodeState(s.code || "");
    setSchoolLogoState(s.logo || "");
    setAcademicYearState(s.academic_year || "");
    setCurrencyState(s.currency || "HTG");
    setThemeColorState(s.theme_color || "#1B2A4A");
    setThemeStyleState(s.theme_style || "classique");
    setPaperFormatState(s.paper_format || "A4");
    setParamsPasswordState(s.params_password || "");

    setSubjectsState((subjectsRes.data || []).map((r) => r.name));
    const csMap = {};
    (classSubjRes.data || []).forEach((r) => { csMap[r.classe] = [...(csMap[r.classe] || []), r.subject]; });
    setClassSubjectsState(csMap);

    setStudents((studentsRes.data || []).map((r) => ({
      id: r.id, nom: r.nom, prenom: r.prenom, classe: r.classe, photo: r.photo,
      sexe: r.sexe, nisu: r.nisu, dateNaissance: r.date_naissance, lieuNaissance: r.lieu_naissance,
      adresse: r.adresse || {}, responsable: r.responsable || {}, matriculeNum: r.matricule_num,
    })));

    const gMap = {};
    (gradesRes.data || []).forEach((r) => { gMap[`${r.student_id}|${r.subject}|${r.period}`] = Number(r.score); });
    setGrades(gMap);

    const mMap = {};
    (mentionsRes.data || []).forEach((r) => { mMap[`${r.student_id}|${r.subject}|${r.period}`] = r.mention; });
    setMentions(mMap);

    const cMap = {};
    (coeffRes.data || []).forEach((r) => { cMap[r.classe] = { ...(cMap[r.classe] || {}), [r.subject]: Number(r.coeff) }; });
    setCoefficientsState(cMap);

    const fMap = {};
    (feesRes.data || []).forEach((r) => { fMap[r.classe] = { inscription: Number(r.inscription), scolarite: Number(r.scolarite) }; });
    setTuitionFeesState(fMap);

    setPayments((paymentsRes.data || []).map((r) => ({
      id: r.id, studentId: r.student_id, matricule: r.matricule, amount: Number(r.amount),
      date: r.payment_date, label: r.label, note: r.note,
    })));

    const rMap = {};
    (remarksRes.data || []).forEach((r) => { rMap[`${r.student_id}|${r.period}`] = r.text; });
    setRemarks(rMap);

    setUsers((profilesRes.data || []).map((r) => ({ id: r.id, name: r.name, role: r.role, classes: r.classes || [] })));
    setLoaded(true);
  }, [schoolId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ---- Réglages de l'école (table "schools") ----
  const updateSchool = async (fields) => { await supabase.from("schools").update(fields).eq("id", schoolId); loadAll(); };
  const setSchoolName = (v) => updateSchool({ name: v });
  const setSchoolCode = (v) => updateSchool({ code: v });
  const setSchoolLogo = (v) => updateSchool({ logo: v });
  const setAcademicYear = (v) => updateSchool({ academic_year: v });
  const setCurrency = (v) => updateSchool({ currency: v });
  const setThemeColor = (v) => updateSchool({ theme_color: v });
  const setThemeStyle = (v) => updateSchool({ theme_style: v });
  const setPaperFormat = (v) => updateSchool({ paper_format: v });
  const setParamsPassword = (v) => updateSchool({ params_password: v });

  // ---- Matières (générales + par classe indépendante) ----
  const setSubjects = async (nextArr) => {
    const added = nextArr.find((s) => !subjects.includes(s));
    const removed = subjects.find((s) => !nextArr.includes(s));
    if (added) await supabase.from("subjects").insert({ school_id: schoolId, name: added });
    else if (removed) await supabase.from("subjects").delete().eq("school_id", schoolId).eq("name", removed);
    loadAll();
  };
  const setClassSubjects = async (nextMap) => {
    const classe = Object.keys({ ...classSubjects, ...nextMap }).find(
      (c) => JSON.stringify(nextMap[c] || null) !== JSON.stringify(classSubjects[c] || null)
    );
    if (!classe) return;
    await supabase.from("class_subjects").delete().eq("school_id", schoolId).eq("classe", classe);
    const list = nextMap[classe] || [];
    if (list.length) {
      await supabase.from("class_subjects").insert(list.map((subject) => ({ school_id: schoolId, classe, subject })));
    }
    loadAll();
  };

  // ---- Coefficients (= note maximale par matière et par classe) ----
  const setCoefficients = async (nextMap) => {
    const classe = Object.keys(nextMap).find((c) => JSON.stringify(nextMap[c]) !== JSON.stringify(coefficients[c]));
    if (!classe) return;
    const changedSubjects = Object.keys(nextMap[classe] || {}).filter(
      (s) => nextMap[classe][s] !== (coefficients[classe] || {})[s]
    );
    for (const subj of changedSubjects) {
      // eslint-disable-next-line no-await-in-loop
      await supabase.from("coefficients").upsert(
        { school_id: schoolId, classe, subject: subj, coeff: Number(nextMap[classe][subj]) || 0 },
        { onConflict: "school_id,classe,subject" }
      );
    }
    loadAll();
  };

  // ---- Frais d'inscription / scolarité ----
  const setTuitionFee = async (classe, field, value) => {
    const current = tuitionFees[classe] || { inscription: 0, scolarite: 0 };
    const next = { ...current, [field]: value };
    await supabase.from("tuition_fees").upsert(
      { school_id: schoolId, classe, inscription: next.inscription, scolarite: next.scolarite },
      { onConflict: "school_id,classe" }
    );
    loadAll();
  };

  // ---- Élèves ----
  const addStudent = async (form) => {
    await supabase.from("students").insert({
      school_id: schoolId, nom: form.nom, prenom: form.prenom, classe: form.classe, photo: form.photo || null,
      sexe: form.sexe || null, nisu: form.nisu || null,
      date_naissance: form.dateNaissance || null, lieu_naissance: form.lieuNaissance || null,
      adresse: form.adresse || {}, responsable: form.responsable || {},
    });
    loadAll();
  };
  const updateStudent = async (id, form) => {
    await supabase.from("students").update({
      nom: form.nom, prenom: form.prenom, classe: form.classe, photo: form.photo || null,
      sexe: form.sexe || null, nisu: form.nisu || null,
      date_naissance: form.dateNaissance || null, lieu_naissance: form.lieuNaissance || null,
      adresse: form.adresse || {}, responsable: form.responsable || {},
    }).eq("id", id);
    loadAll();
  };
  const removeStudent = async (id) => { await supabase.from("students").delete().eq("id", id); loadAll(); };

  // ---- Notes et mentions (une note va de 0 au coefficient/max de la matière) ----
  const setScore = async (studentId, subject, period, value) => {
    if (value === "" || value === null) {
      await supabase.from("grades").delete().match({ student_id: studentId, subject, period });
    } else {
      await supabase.from("grades").upsert(
        { school_id: schoolId, student_id: studentId, subject, period, score: value },
        { onConflict: "student_id,subject,period" }
      );
    }
    loadAll();
  };
  const setMention = async (studentId, subject, period, value) => {
    if (!value) {
      await supabase.from("mentions").delete().match({ student_id: studentId, subject, period });
    } else {
      await supabase.from("mentions").upsert(
        { school_id: schoolId, student_id: studentId, subject, period, mention: value },
        { onConflict: "student_id,subject,period" }
      );
    }
    loadAll();
  };

  // ---- Paiements ----
  const addPayment = async (studentId, form) => {
    const s = students.find((st) => st.id === studentId);
    await supabase.from("payments").insert({
      school_id: schoolId, student_id: studentId, matricule: formatMatricule(s?.nom, s?.prenom, s?.matriculeNum),
      amount: Number(form.amount), payment_date: form.date, label: form.label || null, note: form.note || null,
    });
    loadAll();
  };
  const removePayment = async (id) => { await supabase.from("payments").delete().eq("id", id); loadAll(); };

  // ---- Remarques de bulletin ----
  const setRemark = async (nextMap) => {
    const key = Object.keys(nextMap).find((k) => nextMap[k] !== remarks[k]);
    if (!key) return;
    const [studentId, period] = key.split("|");
    await supabase.from("remarks").upsert(
      { school_id: schoolId, student_id: studentId, period, text: nextMap[key] },
      { onConflict: "student_id,period" }
    );
    loadAll();
  };

  // ---- Utilisateurs (via Edge Function — voir supabase/functions/create-user) ----
  const addUser = async ({ email, password, name, role, classes }) => {
    const { data, error } = await supabase.functions.invoke("create-user", {
      body: { email, password, name, role, classes },
    });
    if (error) throw new Error(data?.error || error.message || "Erreur lors de la création du compte.");
    loadAll();
  };
  const updateUserRole = async (id, role, classes) => { await supabase.from("profiles").update({ role, classes }).eq("id", id); loadAll(); };
  const removeUser = async (id) => { await supabase.from("profiles").delete().eq("id", id); loadAll(); };

  const logout = async () => { await supabase.auth.signOut(); };

  if (!loaded) {
    return (<><ThemeVars color={themeColor} style={themeStyle} /><Centered>Chargement des données…</Centered></>);
  }

  const isDirection = profile.role === "direction";
  const isSecretaire = profile.role === "secretaire";
  const isEnseignant = profile.role === "enseignant";
  const myClasses = isEnseignant ? (profile.classes || []) : null;
  const effectiveTab = isEnseignant ? "notes" : tab;

  const tabsAvailable = [
    ...(isEnseignant ? [] : [{ id: "eleves", label: "Élèves", icon: Users }]),
    { id: "notes", label: "Notes", icon: ClipboardList },
    ...(isEnseignant ? [] : [{ id: "bulletins", label: "Bulletins", icon: FileText }]),
    ...(isEnseignant ? [] : [{ id: "statistiques", label: "Statistiques", icon: ClipboardList }]),
    ...((isDirection || isSecretaire) ? [{ id: "paiements", label: "Paiements", icon: Wallet }] : []),
    ...(isDirection ? [{ id: "decision", label: "Décision fin d'année", icon: FileText }] : []),
    ...(isDirection ? [{ id: "utilisateurs", label: "Utilisateurs", icon: UserCog }] : []),
    ...(isDirection ? [{ id: "parametres", label: "Paramètres", icon: Settings }] : []),
  ];

  return (
    <>
    <ThemeVars color={themeColor} style={themeStyle} />
    <div style={{ minHeight: "100vh", background: "#F7F5F0", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "var(--primary)", display: "flex" }}>
      <style>{`
        @page { size: ${paperFormat === "Lettre" ? "letter" : "A4"}; margin: 0; }
        @media print { .no-print { display: none !important; } .print-area { box-shadow: none !important; margin: 0 !important; } body { background: white !important; } .remark-print-only { display: block !important; } }
        input, select, textarea { font-family: inherit; }
      `}</style>

      <Sidebar tab={effectiveTab} setTab={setTab} schoolName={schoolName} schoolLogo={schoolLogo} currentUser={profile} onLogout={logout} items={tabsAvailable} className="no-print" />

      <main style={{ flex: 1, padding: "40px 48px", maxWidth: 1100 }}>
        {effectiveTab === "eleves" && !isEnseignant && (
          <ElevesView students={students} onAdd={addStudent} onUpdate={updateStudent} onRemove={removeStudent} isDirection={isDirection} isSecretaire={isSecretaire} myClasses={myClasses} schoolName={schoolName} schoolLogo={schoolLogo} schoolCode={schoolCode} paperFormat={paperFormat} paramsPassword={paramsPassword} />
        )}
        {effectiveTab === "notes" && (
          <NotesView students={students} subjects={subjects} classSubjects={classSubjects} grades={grades} mentions={mentions} coefficients={coefficients} isDirection={isDirection} isSecretaire={isSecretaire} myClasses={myClasses} onSetScore={setScore} onSetMention={setMention} paramsPassword={paramsPassword} />
        )}
        {effectiveTab === "bulletins" && !isEnseignant && (
          <BulletinsView students={students} subjects={subjects} classSubjects={classSubjects} grades={grades} mentions={mentions} schoolName={schoolName} schoolLogo={schoolLogo} schoolCode={schoolCode} isDirection={isDirection} isSecretaire={isSecretaire} myClasses={myClasses} academicYear={academicYear} coefficients={coefficients} remarks={remarks} onSetRemark={setRemark} paperFormat={paperFormat} />
        )}
        {effectiveTab === "statistiques" && !isEnseignant && (
          <StatistiquesView students={students} isDirection={isDirection || isSecretaire} myClasses={myClasses} />
        )}
        {effectiveTab === "paiements" && (isDirection || isSecretaire) && (
          <PaiementsView students={students} payments={payments} tuitionFees={tuitionFees} currency={currency} onAddPayment={addPayment} onRemovePayment={removePayment} schoolName={schoolName} schoolLogo={schoolLogo} schoolCode={schoolCode} paperFormat={paperFormat} isDirection={isDirection} paramsPassword={paramsPassword} />
        )}
        {effectiveTab === "decision" && isDirection && (
          <DecisionFinAnneeView students={students} subjects={subjects} classSubjects={classSubjects} grades={grades} coefficients={coefficients} schoolName={schoolName} schoolLogo={schoolLogo} schoolCode={schoolCode} academicYear={academicYear} paperFormat={paperFormat} />
        )}
        {effectiveTab === "utilisateurs" && isDirection && (
          <UtilisateursView users={users} currentUserId={profile.id} onAdd={addUser} onUpdateRole={updateUserRole} onRemove={removeUser} />
        )}
        {effectiveTab === "parametres" && isDirection && (
          <PasswordGate password={paramsPassword}>
            <ParametresView
              schoolName={schoolName} setSchoolName={setSchoolName}
              schoolCode={schoolCode} setSchoolCode={setSchoolCode}
              schoolLogo={schoolLogo} setSchoolLogo={setSchoolLogo}
              academicYear={academicYear} setAcademicYear={setAcademicYear}
              currency={currency} setCurrency={setCurrency}
              subjects={subjects} setSubjects={setSubjects}
              classSubjects={classSubjects} setClassSubjects={setClassSubjects}
              coefficients={coefficients} setCoefficients={setCoefficients}
              tuitionFees={tuitionFees} setTuitionFee={setTuitionFee}
              themeColor={themeColor} setThemeColor={setThemeColor}
              themeStyle={themeStyle} setThemeStyle={setThemeStyle}
              paperFormat={paperFormat} setPaperFormat={setPaperFormat}
              paramsPassword={paramsPassword} setParamsPassword={setParamsPassword}
            />
          </PasswordGate>
        )}
      </main>
    </div>
    </>
  );
}

function UtilisateursView({ users, currentUserId, onAdd, onUpdateRole, onRemove }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("enseignant");
  const [classesSel, setClassesSel] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const addUser = async () => {
    setError("");
    if (!name.trim() || !email.trim() || !password.trim()) { setError("Nom, email et mot de passe sont requis."); return; }
    setBusy(true);
    try {
      await onAdd({ email: email.trim(), password: password.trim(), name: name.trim(), role, classes: role === "enseignant" ? classesSel : [] });
      setName(""); setEmail(""); setPassword(""); setClassesSel([]);
    } catch (e) {
      setError(e.message || "Erreur lors de la création du compte.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionTitle sub="Comptes ayant accès à l'application de votre école">Utilisateurs</SectionTitle>
      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Ajouter un compte</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <Field label="Nom"><input style={{ ...inputStyle, textTransform: "uppercase" }} value={name} onChange={(e) => setName(e.target.value.toUpperCase())} /></Field>
          <Field label="Rôle">
            <select style={inputStyle} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="enseignant">Enseignant</option>
              <option value="secretaire">Secrétaire</option>
              <option value="direction">Direction</option>
            </select>
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <Field label="Email de connexion"><input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Mot de passe"><input type="password" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        </div>
        {role === "enseignant" && (
          <Field label="Classe(s)">
            <ClassCheckboxes selected={classesSel} onChange={setClassesSel} />
          </Field>
        )}
        {error && <div style={{ fontSize: 12.5, color: "#A3272E", marginTop: 10 }}>{error}</div>}
        <button onClick={addUser} disabled={busy} style={{ ...btnPrimary, marginTop: 16 }}><Plus size={16} /> {busy ? "Création…" : "Ajouter"}</button>
      </div>
      <div style={{ background: "white", borderRadius: 10, border: "1px solid #E5E1D6", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead><tr style={{ background: "#F1EEE5", textAlign: "left" }}><th style={th}>Nom</th><th style={th}>Rôle</th><th style={th}>Classes</th><th style={{ ...th, width: 90 }}></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <UserRow key={u.id} user={u} isSelf={u.id === currentUserId} onUpdateRole={onUpdateRole} onRemove={onRemove} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRow({ user, isSelf, onUpdateRole, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(user.role);
  const [classesSel, setClassesSel] = useState(user.classes || []);

  const save = () => { onUpdateRole(user.id, role, role === "enseignant" ? classesSel : []); setEditing(false); };

  return (
    <tr style={{ borderTop: "1px solid #EEE", verticalAlign: "top" }}>
      <td style={td}>{user.name}{isSelf ? " (vous)" : ""}</td>
      <td style={td}>
        {editing ? (
          <select style={inputStyle} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="enseignant">Enseignant</option>
            <option value="secretaire">Secrétaire</option>
            <option value="direction">Direction</option>
          </select>
        ) : roleLabel(user.role)}
      </td>
      <td style={{ ...td, maxWidth: 320 }}>
        {editing ? (role === "enseignant" ? <ClassCheckboxes selected={classesSel} onChange={setClassesSel} /> : "—") : ((user.classes || []).join(", ") || "—")}
      </td>
      <td style={td}>
        <div style={{ display: "flex", gap: 8 }}>
          {editing ? (
            <button onClick={save} style={linkBtn}>Enregistrer</button>
          ) : (
            <button onClick={() => setEditing(true)} style={iconBtn}><UserCog size={15} color="#1E4D8C" /></button>
          )}
          {!isSelf && (
            <ConfirmButton onConfirm={() => onRemove(user.id)} message={`Confirmer la suppression du compte de ${user.name} ?`} style={iconBtn}>
              <Trash2 size={15} color="#A3272E" />
            </ConfirmButton>
          )}
        </div>
      </td>
    </tr>
  );
}

function ParametresView({
  schoolName, setSchoolName, schoolCode, setSchoolCode, schoolLogo, setSchoolLogo,
  academicYear, setAcademicYear, currency, setCurrency,
  subjects, setSubjects, classSubjects, setClassSubjects,
  coefficients, setCoefficients, tuitionFees, setTuitionFee,
  themeColor, setThemeColor, themeStyle, setThemeStyle,
  paperFormat, setPaperFormat, paramsPassword, setParamsPassword,
}) {
  const [name, setName] = useState(schoolName);
  const [code, setCode] = useState(schoolCode);
  const [year, setYear] = useState(academicYear);
  const [curr, setCurr] = useState(currency);
  const [newSubject, setNewSubject] = useState("");
  const [coeffClasse, setCoeffClasse] = useState(CLASSES[0]);
  const [feeClasse, setFeeClasse] = useState(CLASSES[0]);
  const [subjClasse, setSubjClasse] = useState(CLASSES[0]);
  const [logoError, setLogoError] = useState("");
  const [pwd, setPwd] = useState(paramsPassword || "");
  const [pwdSaved, setPwdSaved] = useState(false);
  const [coeffDraft, setCoeffDraft] = useState({});
  const [coeffSaved, setCoeffSaved] = useState(false);

  useEffect(() => { setCoeffDraft({}); setCoeffSaved(false); }, [coeffClasse]);

  const addSubject = () => {
    if (!newSubject.trim() || subjects.includes(newSubject.trim())) return;
    setSubjects([...subjects, newSubject.trim()]);
    setNewSubject("");
  };
  const removeSubject = (subj) => setSubjects(subjects.filter((s) => s !== subj));
  const saveCoefficients = () => {
    const updated = { ...(coefficients[coeffClasse] || {}) };
    Object.entries(coeffDraft).forEach(([subj, value]) => {
      updated[subj] = value === "" ? "" : Math.max(0, Number(value));
    });
    setCoefficients({ ...coefficients, [coeffClasse]: updated });
    setCoeffDraft({});
    setCoeffSaved(true);
    setTimeout(() => setCoeffSaved(false), 2000);
  };
  const handleLogo = async (file) => {
    if (!file) return;
    try { setLogoError(""); setSchoolLogo(await resizePhoto(file, 240, 0.85)); }
    catch { setLogoError("Impossible de lire cette image, réessayez avec une autre."); }
  };

  const [newClassSubject, setNewClassSubject] = useState("");

  const classSubjSelected = classSubjects?.[subjClasse] || [];
  const addClassSubject = (subj) => {
    if (!subj || classSubjSelected.includes(subj)) return;
    setClassSubjects({ ...classSubjects, [subjClasse]: [...classSubjSelected, subj] });
    setNewClassSubject("");
  };
  const removeClassSubject = (subj) => {
    setClassSubjects({ ...classSubjects, [subjClasse]: classSubjSelected.filter((s) => s !== subj) });
  };

  return (
    <div>
      <SectionTitle sub="Configuration de l'école">Paramètres</SectionTitle>

      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Logo de l'établissement</div>
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          {schoolLogo ? (
            <img src={schoolLogo} alt="Logo" style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", border: "1px solid #E5E1D6" }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: 10, background: "#F1EEE5", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <School size={26} color="#8B8578" />
            </div>
          )}
          <div>
            <label style={{ ...linkBtn, cursor: "pointer" }}>
              {schoolLogo ? "Changer le logo" : "Ajouter un logo"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleLogo(e.target.files?.[0])} />
            </label>
            {schoolLogo && <button onClick={() => setSchoolLogo("")} style={{ ...linkBtn, marginLeft: 12, color: "#A3272E" }}>Retirer</button>}
            {logoError && <div style={{ fontSize: 12, color: "#A3272E", marginTop: 4 }}>{logoError}</div>}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Nom de l'école</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
          <button style={btnPrimary} onClick={() => setSchoolName(name)}>Enregistrer</button>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Code établissement (matricule)</div>
        <div style={{ fontSize: 12.5, color: "#8B8578", marginBottom: 14 }}>Identifiant interne de l'école (n'affecte plus le format du matricule, désormais basé sur le nom et le prénom de chaque élève).</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input style={{ ...inputStyle, maxWidth: 160 }} placeholder="ex: SJB" value={code} onChange={(e) => setCode(e.target.value)} />
          <button style={btnPrimary} onClick={() => setSchoolCode(code)}>Enregistrer</button>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Année académique</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input style={inputStyle} placeholder="ex: 2025-2026" value={year} onChange={(e) => setYear(e.target.value)} />
          <button style={btnPrimary} onClick={() => setAcademicYear(year)}>Enregistrer</button>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Mot de passe des Paramètres</div>
        <div style={{ fontSize: 12.5, color: "#8B8578", marginBottom: 14 }}>
          {paramsPassword ? "Un mot de passe est actuellement requis pour accéder à cet onglet." : "Aucun mot de passe défini — l'onglet Paramètres est ouvert à tous les comptes Direction."}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input type="password" style={inputStyle} placeholder="Nouveau mot de passe" value={pwd} onChange={(e) => setPwd(e.target.value)} />
          <button style={btnPrimary} onClick={() => { setParamsPassword(pwd); setPwdSaved(true); setTimeout(() => setPwdSaved(false), 2000); }}>Enregistrer</button>
        </div>
        {pwdSaved && <div style={{ fontSize: 12.5, color: "#3D6B4F", marginTop: 8 }}>Mot de passe mis à jour.</div>}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Matières enseignées (liste générale de l'école)</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <input style={inputStyle} placeholder="Ajouter une matière…" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSubject()} />
          <button style={btnPrimary} onClick={addSubject}><Plus size={16} /></button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {subjects.map((s) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F1EEE5", borderRadius: 20, padding: "6px 12px", fontSize: 13 }}>
              {s}
              <button onClick={() => removeSubject(s)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}><X size={13} color="#A3272E" /></button>
            </div>
          ))}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Matières par classe</div>
        <div style={{ fontSize: 12.5, color: "#8B8578", marginBottom: 16 }}>Chaque classe a sa propre liste de matières, construite indépendamment des autres classes — même si un même nom (ex: Mathématiques) est ajouté dans plusieurs classes, ce sont des choix séparés. Une classe sans aucune matière ajoutée ici utilise la liste générale de l'école par défaut.</div>
        <div style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>1. Choisis la classe</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {CLASSES.map((c) => (
            <button
              key={c} onClick={() => { setSubjClasse(c); setNewClassSubject(""); }}
              style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                border: subjClasse === c ? "1px solid var(--primary)" : "1px solid #D8D2C2",
                background: subjClasse === c ? "var(--primary)" : "white", color: subjClasse === c ? "white" : "var(--primary)",
                fontWeight: subjClasse === c ? 600 : 400,
              }}
            >{c}</button>
          ))}
        </div>

        <div style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>2. Ajoute les matières de {subjClasse}</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <select style={inputStyle} value={newClassSubject} onChange={(e) => setNewClassSubject(e.target.value)}>
            <option value="">Choisir une matière à ajouter…</option>
            {subjects.filter((s) => !classSubjSelected.includes(s)).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button style={btnPrimary} onClick={() => addClassSubject(newClassSubject)}><Plus size={16} /> Ajouter</button>
        </div>

        {classSubjSelected.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "#8B8578", fontStyle: "italic" }}>Aucune matière propre à cette classe — la liste générale de l'école s'applique pour l'instant.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {classSubjSelected.map((subj) => (
              <div key={subj} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F1EEE5", borderRadius: 20, padding: "6px 12px", fontSize: 13 }}>
                {subj}
                <button onClick={() => removeClassSubject(subj)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}><X size={13} color="#A3272E" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Coefficients par classe</div>
        <div style={{ fontSize: 12.5, color: "#8B8578", marginBottom: 16 }}>Le coefficient définit la note maximale pour cette matière dans cette classe (ex: 300 = les notes se saisissent entre 0 et 300). Par défaut, le maximum est 100. Ne s'applique pas aux classes Kind (mentions).</div>
        <Field label="Classe">
          <select style={{ ...inputStyle, maxWidth: 260 }} value={coeffClasse} onChange={(e) => setCoeffClasse(e.target.value)}>
            {CLASSES.filter((c) => !KIND_CLASSES.includes(c)).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 100px", rowGap: 10, columnGap: 12, alignItems: "center", maxWidth: 400 }}>
          {(classSubjects?.[coeffClasse]?.length ? classSubjects[coeffClasse] : subjects).map((subj) => (
            <Fragment key={subj}>
              <div style={{ fontSize: 14 }}>{subj}</div>
              <input
                type="text" inputMode="decimal" style={inputStyle}
                value={coeffDraft[subj] ?? (coefficients[coeffClasse]?.[subj] ?? 100)}
                onChange={(e) => setCoeffDraft({ ...coeffDraft, [subj]: e.target.value })}
              />
            </Fragment>
          ))}
        </div>
        <button style={{ ...btnPrimary, marginTop: 16 }} onClick={saveCoefficients}>Enregistrer</button>
        {coeffSaved && <span style={{ fontSize: 12.5, color: "#3D6B4F", marginLeft: 12 }}>Coefficients enregistrés ✓</span>}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Devise</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input style={{ ...inputStyle, maxWidth: 160 }} placeholder="ex: HTG, USD" value={curr} onChange={(e) => setCurr(e.target.value)} />
          <button style={btnPrimary} onClick={() => setCurrency(curr)}>Enregistrer</button>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Frais d'inscription et de scolarité par classe</div>
        <div style={{ fontSize: 12.5, color: "#8B8578", marginBottom: 16 }}>Montants attendus pour chaque classe — servent de référence dans l'onglet Paiements.</div>
        <Field label="Classe">
          <select style={{ ...inputStyle, maxWidth: 260 }} value={feeClasse} onChange={(e) => setFeeClasse(e.target.value)}>
            {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16, maxWidth: 420 }}>
          <Field label="Frais d'inscription">
            <input
              type="number" min="0" style={inputStyle}
              value={tuitionFees[feeClasse]?.inscription ?? 0}
              onChange={(e) => setTuitionFee(feeClasse, "inscription", Math.max(0, Number(e.target.value) || 0))}
            />
          </Field>
          <Field label="Frais de scolarité">
            <input
              type="number" min="0" style={inputStyle}
              value={tuitionFees[feeClasse]?.scolarite ?? 0}
              onChange={(e) => setTuitionFee(feeClasse, "scolarite", Math.max(0, Number(e.target.value) || 0))}
            />
          </Field>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Format d'impression</div>
        <div style={{ fontSize: 12.5, color: "#8B8578", marginBottom: 16 }}>S'applique aux bulletins, fiches élèves et états de paiement imprimés.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setPaperFormat("A4")} style={paperFormat === "A4" ? btnPrimary : btnSecondary}>A4</button>
          <button onClick={() => setPaperFormat("Lettre")} style={paperFormat === "Lettre" ? btnPrimary : btnSecondary}>Lettre</button>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Apparence de l'interface</div>
        <div style={{ fontSize: 12.5, color: "#8B8578", marginBottom: 16 }}>Personnalise la couleur principale et le style visuel pour chaque établissement.</div>

        <div style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>Couleur principale</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
          {THEME_PRESETS.map((p) => (
            <button
              key={p.color} onClick={() => setThemeColor(p.color)} title={p.name}
              style={{
                width: 32, height: 32, borderRadius: "50%", background: p.color, cursor: "pointer",
                border: themeColor === p.color ? "3px solid #D4A24C" : "2px solid white",
                boxShadow: "0 0 0 1px #E5E1D6",
              }}
            />
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#8B8578", marginLeft: 8 }}>
            Personnalisée
            <input type="color" value={themeColor} onChange={(e) => setThemeColor(e.target.value)} style={{ width: 32, height: 32, padding: 0, border: "none", cursor: "pointer", background: "none" }} />
          </label>
        </div>

        <div style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>Style</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setThemeStyle("classique")} style={themeStyle === "classique" ? btnPrimary : btnSecondary}>Classique (Georgia)</button>
          <button onClick={() => setThemeStyle("moderne")} style={themeStyle === "moderne" ? btnPrimary : btnSecondary}>Moderne (Sans-serif)</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</label>
      {children}
    </div>
  );
}

function EmptyState({ text }) {
  return <div style={{ border: "1.5px dashed #D8D2C2", borderRadius: 10, padding: "48px 24px", textAlign: "center", color: "#8B8578", fontSize: 14 }}>{text}</div>;
}

const inputStyle = { padding: "9px 12px", borderRadius: 7, border: "1px solid #D8D2C2", fontSize: 14, color: "var(--primary)", background: "white", outline: "none" };
const btnPrimary = { display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "var(--primary)", color: "white", border: "none", borderRadius: 7, fontSize: 13.5, fontWeight: 600, cursor: "pointer", height: "fit-content" };
const btnSecondary = { display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "white", color: "var(--primary)", border: "1px solid #D8D2C2", borderRadius: 7, fontSize: 13.5, fontWeight: 600, cursor: "pointer", height: "fit-content" };
const linkBtn = { background: "none", border: "none", color: "#1E4D8C", fontSize: 13, cursor: "pointer", padding: 0, textDecoration: "underline" };
const iconBtn = { background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 4 };
const cardStyle = { background: "white", border: "1px solid #E5E1D6", borderRadius: 10, padding: 22, marginBottom: 20 };
const th = { padding: "11px 16px", fontSize: 12, color: "#8B8578", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 };
const td = { padding: "12px 16px" };
const thBulletin = { padding: "8px 6px", fontWeight: 600, color: "var(--primary)" };
const tdBulletin = { padding: "9px 6px" };
