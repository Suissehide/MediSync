#!/usr/bin/env python3
"""Ancien site (patients, créneaux, rendez-vous) -> SQL Postgres idempotent, pour un service donné.

  docker run -d --name draxa-mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=inf mysql:8.4
  docker exec -i draxa-mysql mysql -uroot -proot inf < draxa_<date>.sql
  python3 deploy/scripts/import-draxa.py > draxa.sql      # contient des données patients : ne pas committer
  psql -v svc=<serviceId> -f draxa.sql
"""
import json
import re
import subprocess
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timedelta

MYSQL = ["docker", "exec", "draxa-mysql", "mysql", "-uroot", "-proot", "inf",
         "--default-character-set=utf8mb4", "-N", "-B", "-r", "-e"]


def rows(table, cols):
    obj = ",".join(f"'{c}',`{c}`" for c in cols)
    out = subprocess.run(MYSQL + [f"select json_object({obj}) from `{table}` order by id"],
                         capture_output=True, text=True, check=True).stdout
    return [json.loads(line) for line in out.splitlines() if line.strip()]


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())


def blank(v):
    return v is None or (isinstance(v, str) and not v.strip())


def q(v):
    if blank(v):
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).strip().replace("'", "''") + "'"


# Valeurs stockées = clés des constantes du front (front/src/constants/patient.constant.ts).
OPTIONS = {
    "gender": {"male": "Homme", "female": "Femme", "other": "Autre"},
    "distance": {"CUB": "CUB", "GIRONDE": "Gironde", "HORS_GIRONDE": "Hors Gironde"},
    "education": {"aucun": "Aucun", "primaire": "Primaire", "secondaire": "Secondaire",
                  "universitaire": "Universitaire"},
    "occupation": {"AGRICULTEUR": "Agriculteur",
                   "ARTISANS_COMMERCANTS_CHEFS": "Artisans, commerçants et chefs d'entreprises",
                   "AUTRE": "Autre",
                   "CADRES_PROF_INTELLECTUELLES": "Cadres et professions intellectuelles supérieures",
                   "EMPLOYES": "Employés", "MERE_AU_FOYER": "Mère au foyer", "OUVRIERS": "Ouvriers",
                   "PROFESSIONS_INTERMEDIAIRES": "Professions intermédiaires"},
    "activity": {"ACTIF": "Actif", "ARRET_MALADIE": "Arrêt maladie", "AUTRE": "Autre",
                 "CHOMAGE": "Chômage", "INVALIDITE": "Invalidité", "RMI_RSA": "RMI/RSA",
                 "RETRAITE": "Retraité", "SANS_EMPLOI": "Sans emploi"},
    "diagnosis": {"AOMI": "AOMI", "AVC": "AVC", "CORONAROPATHIE": "CORONAROPATHIE",
                  "PREVENTION": "PREVENTION"},
    "careMode": {"AMBU": "Ambu", "HDJ": "HDJ", "HDS": "HDS", "HOSPIT": "Hospit"},
    "orientation": {"NS": "NS", "ORIENTATION_PRO_SANTE_HOSPIT": "Orientation pro santé au cours hospit",
                    "ORIENTATION_PRO_SANTE_CS": "Orientation pro santé en Cs",
                    "ORIENTATION_PRO_SANTE_EXT": "Orientation pro santé ext hôpital",
                    "VENUE_SPONTANEE": "Venue spontanée"},
    "etpDecision": {"NON": "Non", "OUI": "Oui"},
    "programType": {"VIVA": "ViVa", "VIVA_AOMI": "ViVa module AOMI"},
    "nonInclusion": {"ABSENCE_BESOINS_EDUCATIFS": "Absence de besoins éducatifs",
                     "ABSENCE_CRITERES_MEDICAUX": "Absence de critères médicaux d'inclusion",
                     "BARRIERE_LANGUE": "Barrière de la langue",
                     "DISTANCE_HABITATION": "Distance  d'habitation",
                     "INDISPONIBILITE": "Indisponibilité", "MANQUE_MOTIVATION": "Manque de motivation",
                     "NS": "NS", "PRISE_CHARGE_BESOINS_QUOTIDIENS": "Prise en charge des besoins quotidiens",
                     "PROBLEME_SANTE": "Problème de santé", "PROBLEMES_MEDICAUX": "Problèmes médicaux à régler",
                     "REFUS": "Refus", "TRANSPORT": "Transport", "TROUBLES_COGNITIFS": "Troubles cognitifs",
                     "TROUBLES_PSYCHIATRIQUES": "Troubles psychiatriques"},
    "stopReason": {"ABSENCE_BESOINS_EDUCATIFS": "Absence besoins éducatifs",
                   "ABSENCE_CRITERES_MEDICAUX": "Absence de critères médicaux d'inclusion",
                   "BARRIERE_LANGUE": "Barrière de la langue", "DISTANCE_HABITATION": "Distance d'habitation",
                   "DECES": "Décès", "DEMENAGEMENT": "Déménagement", "INDISPONIBILITE": "Indisponibilité",
                   "MANQUE_MOTIVATION": "Manque de motivation", "NS": "NS", "PERDU_DE_VUE": "Perdu de vue",
                   "PLUS_BESOIN_FIN_PARCOURS": "Plus de besoin/Fin de parcours",
                   "PRISE_CHARGE_BESOINS_QUOTIDIENS": "Prise en charge besoins quotidiens",
                   "PROBLEME_SANTE": "Problème de santé", "PROBLEMES_MEDICAUX": "Problèmes médicaux à régler",
                   "REFUS": "Refus", "SOUHAIT_ARRET": "Souhait arrêt", "TRANSPORT": "Transport",
                   "TROUBLES_COGNITIFS": "Troubles cognitifs", "TROUBLES_PSYCHIATRIQUES": "Troubles psychiatriques"},
    "etpFinalOutcome": {"ATELIER": "Atelier", "ATELIER_INFORMATION": "Atelier information", "BCVS": "BCVs",
                        "CONSULTATION": "Consultation", "DE": "DE", "ENTRETIEN_INDIVIDUEL": "Entretien individuel",
                        "M12": "M12", "M3": "M3", "RENF1": "Renf1", "RENF2": "Renf2",
                        "SUIVI_TELEPHONIQUE": "Suivi téléphonique"},
}
REVERSE = {f: {norm(k): k for k in d} | {norm(v): k for k, v in d.items()} for f, d in OPTIONS.items()}
unmatched = defaultdict(Counter)


def opt(field, v):
    if blank(v):
        return None
    k = REVERSE[field].get(norm(v))
    if k is None:
        unmatched[field][v] += 1
        return v  # valeur hors liste conservée telle quelle
    return k


# Thématiques : ancien libellé -> libellé du nouveau site (sinon créée sous l'ancien libellé).
THEMATIC_ALIAS = {
    "consultationdieteticienne": "Consultation Diététicienne",
    "consultationpsychologue": "Consultation Psychologue",
    "m1m2": "Coaching PRM M1 / M2", "m2m3": "Coaching PRM M2 / M3", "m3et": "Coaching PRM M3 +",
    "prm1": "Programme de réentraînement à la marche 1", "prm2": "Programme de réentraînement à la marche 2",
    "signesdalerte": "Signes d’alerte : Que faire ?", "signesalerteetcat": "Signes d’alerte : Que faire ?",
    "signesdalerteetcat": "Signes d’alerte : Que faire ?",
    "stressaigu": "Gestion du stress aigu", "preventionstress": "Prévention du stress",
    "stressmcv": "Stress et Maladie cardiovasculaire", "sucres": "Gestion des sucres",
    "gerermonhta": "Gérer mon hypertension artérielle", "gerermondiabete": "Gérer mon diabiète",
    "cuisinedrive": "Drive Cuisine", "facteursderisque": "Mes facteurs de risque",
    "fdr": "Mes facteurs de risque", "diagnosticeducatif": "Diagnostic éducatif",
    "questcequelinsuffisancecardiaque": "Qu’est ce que l’insuffisance cardiaque ?",
}


def thematic_name(thematique, categorie):
    if blank(thematique):
        return (categorie or "").strip() or "Créneau"
    return THEMATIC_ALIAS.get(norm(thematique), thematique.strip())


def location_name(raw):
    n = norm(raw)
    if not n:
        return None
    if "switch" in n or "ou" in n.replace("bureau", "").replace("buro", ""):
        return None
    if "cuisine" in n or "cusine" in n or "tehrapeutique" in n:
        return "Cuisine thérapeutique"
    if re.fullmatch(r"(bureau|buro)?([167])", n):
        return "Bureau " + n[-1]
    if "enseig" in n or "enseug" in n:
        return "Salle enseignement"
    if "meditation" in n:
        return "Salle méditation"
    if "est" in n:
        return "Bureau 2 Est"
    if re.search(r"(2|deux).*(etage|tage|etae)", n):
        return "Bureau 2ème étage"
    return None


SOIGNANTS = {2: "IDE Educ1", 3: "IDE Educ2", 5: "Psychologue", 6: "Pharmacienne", 7: "Aide-soignante",
             9: "Diététicienne", 19: "Diét Bilan CEPTA", 22: "IDE SSR", 28: "IDE Educ3", 35: "Psychologue étudiant"}
COLORS = {"Atelier": "#60a5fa", "Consultation": "#34d399", "Entretien": "#fbbf24", "Coaching": "#f472b6",
          "Educative": "#a78bfa"}
APPT_TYPE = {"tel": "telephonic", "ambu": "ambulatory", "hospit": "hospital"}
YES_NO = {"oui": "yes", "non": "no"}


def day(v):
    return v if v and "1900-01-01" <= v <= "2100-01-01" else None


def ts(d, t):
    return datetime.fromisoformat(f"{d}T{t}")


def main():
    patients = rows("patient", ["id", "observ", "divers", "sexe", "nom", "prenom", "date", "tel1", "tel2",
                                "distance", "etude", "profession", "activite", "diagnostic", "dedate",
                                "orientation", "etpdecision", "progetp", "precisions", "precisionsperso",
                                "dentree", "motif", "etp", "notes", "objectif", "soignant_referent", "mode",
                                "offre", "email"])
    slots = rows("slot", ["id", "soignant_id", "date", "heure_debut", "heure_fin", "type", "location",
                          "categorie", "thematique", "place"])
    rdvs = rows("rendez_vous", ["id", "patient_id", "date", "heure", "accompagnant", "etat", "motif_refus",
                                "slot_id", "categorie", "notes", "thematique", "type"])

    out = ["\\set ON_ERROR_STOP on",
           "BEGIN;",
           "SELECT \"establishmentId\" AS est FROM \"Service\" WHERE id = :'svc' \\gset"]

    # --- Patients --------------------------------------------------------------------------------
    pat_rows, file_rows = [], []
    for p in patients:
        pid = f"clgx_pa_{p['id']}"
        details = "\n".join(x for x in [
            f"Offre : {p['offre']}" if not blank(p["offre"]) else None,
            p["observ"] if not blank(p["observ"]) else None,
            p["divers"] if not blank(p["divers"]) else None,
        ] if x)
        pat_rows.append("(" + ",".join([
            q(pid), ":'est'", q(p["prenom"] or "-"), q(p["nom"] or "-"), q(opt("gender", p["sexe"])),
            q(day(p["date"])), q(p["tel1"]), q(p["tel2"]), q(p["email"]), q(opt("distance", p["distance"])),
            q(opt("education", p["etude"])), q(opt("occupation", p["profession"])),
            q(opt("activity", p["activite"])), q(day(p["dedate"])) if day(p["dedate"]) else "now()",
        ]) + ")")
        file_rows.append("(" + ",".join([
            q(f"clgx_psf_{p['id']}"), q(pid), ":'svc'", ":'est'", q(p["soignant_referent"]), q(p["notes"]),
            q(details), q(opt("diagnosis", p["diagnostic"])), q(day(p["dedate"])), q(opt("careMode", p["mode"])),
            q(opt("orientation", p["orientation"])), q(opt("etpDecision", p["etpdecision"])),
            q(opt("programType", p["progetp"])), q(opt("nonInclusion", p["precisions"])),
            q(p["precisionsperso"]), q(p["objectif"]), q(day(p["dentree"])), q(opt("stopReason", p["motif"])),
            q(opt("etpFinalOutcome", p["etp"])),
        ]) + ")")
    out.append(insert("Patient", ["id", "establishmentId", "firstName", "lastName", "gender", "birthDate",
                                  "phone1", "phone2", "email", "distance", "educationLevel", "occupation",
                                  "currentActivity", "createDate"], pat_rows))
    out.append(insert("PatientServiceFile", ["id", "patientId", "serviceId", "establishmentId",
                                             "referringCaregiver", "notes", "details", "medicalDiagnosis",
                                             "entryDate", "careMode", "orientation", "etpDecision",
                                             "programType", "nonInclusionDetails", "customContentDetails",
                                             "goal", "exitDate", "stopReason", "etpFinalOutcome"], file_rows))

    # --- Créneaux : anciens slots + créneaux reconstitués pour les rdv sans slot ------------------
    # slot -> dict(start, end, them, cat, type, loc, place, soignant)
    all_slots = {}
    for s in slots:
        if not s["date"] or not s["heure_debut"]:
            continue
        start = ts(s["date"], s["heure_debut"])
        end = ts(s["date"], s["heure_fin"]) if s["heure_fin"] else None
        if not end or end <= start:
            end = start + timedelta(hours=1)
        all_slots[f"clgx_sl_{s['id']}"] = dict(start=start, end=end, cat=s["categorie"],
                                             them=thematic_name(s["thematique"], s["categorie"]),
                                             loc=s["location"], place=s["place"] or 1, soignant=s["soignant_id"])
    slot_of_rdv, orphans = {}, defaultdict(list)
    for r in rdvs:
        if r["slot_id"] and f"clgx_sl_{r['slot_id']}" in all_slots:
            slot_of_rdv[r["id"]] = f"clgx_sl_{r['slot_id']}"
        else:
            orphans[(r["date"], r["heure"], r["categorie"], r["thematique"])].append(r)
    for (d, h, cat, them), group in orphans.items():
        sid = f"clgx_sl_o{min(r['id'] for r in group)}"
        start = ts(d, h)
        all_slots[sid] = dict(start=start, end=start + timedelta(hours=1), cat=cat,
                              them=thematic_name(them, cat), loc=None, place=len(group), soignant=None)
        for r in group:
            slot_of_rdv[r["id"]] = sid

    them_names = sorted({s["them"] for s in all_slots.values()})
    loc_names = sorted({n for s in all_slots.values() if (n := location_name(s["loc"]))})
    out.append("CREATE TEMP TABLE clgx_them(name text PRIMARY KEY, id text);")
    for n in them_names:
        out.append(lookup_or_create("Thematic", "clgx_them", n, "clgx_th_"))
    out.append("CREATE TEMP TABLE clgx_loc(name text PRIMARY KEY, id text);")
    for n in loc_names:
        out.append(lookup_or_create("Location", "clgx_loc", n, "clgx_lo_"))
    out.append("CREATE TEMP TABLE clgx_soi(old int PRIMARY KEY, id text);")
    for old, n in SOIGNANTS.items():
        out.append(f"""INSERT INTO "Soignant"(id,"establishmentId","serviceId",name)
SELECT 'clgx_so_{old}', :'est', :'svc', {q(n)} WHERE NOT EXISTS
  (SELECT 1 FROM "Soignant" WHERE "serviceId" = :'svc' AND lower(name) = lower({q(n)}));
INSERT INTO clgx_soi SELECT {old}, (SELECT id FROM "Soignant" WHERE "serviceId" = :'svc'
  AND lower(name) = lower({q(n)}) ORDER BY id LIMIT 1);""")

    tpl_rows, slot_rows, link_rows = [], [], []
    for sid, s in all_slots.items():
        tid = sid.replace("clgx_sl_", "clgx_st_")
        loc = location_name(s["loc"])
        individual = s["place"] <= 1
        tpl_rows.append("(" + ",".join([
            q(tid), ":'est'", ":'svc'", q(s["start"].strftime("%H:%M:%S")) + "::time",
            q(s["end"].strftime("%H:%M:%S")) + "::time", "0", q(individual), q(s["place"]),
            f"(SELECT id FROM clgx_them WHERE name = {q(s['them'])})",
            f"(SELECT id FROM clgx_loc WHERE name = {q(loc)})" if loc else "NULL",
            q(None if loc else s["loc"]), q(COLORS.get((s["cat"] or "").strip(), "#94a3b8")),
        ]) + ")")
        slot_rows.append(f"({q(sid)},:'est',:'svc',{q(str(s['start']))},{q(str(s['end']))},{q(tid)})")
        if s["soignant"] in SOIGNANTS:
            link_rows.append(f"({q(tid)},(SELECT id FROM clgx_soi WHERE old = {s['soignant']}),:'svc',:'est')")
    out.append(insert("SlotTemplate", ["id", "establishmentId", "serviceId", "startTime", "endTime",
                                       "offsetDays", "isIndividual", "capacity", "thematicId", "locationID",
                                       "description", "color"], tpl_rows))
    out.append(insert("Slot", ["id", "establishmentId", "serviceId", "startDate", "endDate", "slotTemplateID"],
                      slot_rows))
    out.append(insert("SlotTemplateSoignant", ["slotTemplateId", "soignantId", "serviceId", "establishmentId"],
                      link_rows))

    # --- Rendez-vous : 1 Appointment par rdv sur créneau individuel, 1 par créneau collectif --------
    by_slot = defaultdict(list)
    for r in rdvs:
        by_slot[slot_of_rdv[r["id"]]].append(r)
    appt_rows, ap_rows = [], []
    for sid, group in by_slot.items():
        s = all_slots[sid]
        them = f"(SELECT id FROM clgx_them WHERE name = {q(s['them'])})"
        if s["place"] <= 1:
            for r in group:
                start = ts(r["date"], r["heure"])
                end = s["end"] if s["end"] > start else start + timedelta(minutes=30)
                aid = f"clgx_ap_{r['id']}"
                appt_rows.append(appt(aid, start, end, them, r["type"], sid))
                ap_rows.append(appt_patient(aid, r))
        else:
            aid = f"clgx_ap_s{sid[8:]}"
            common = Counter(r["type"] for r in group if not blank(r["type"])).most_common(1)
            appt_rows.append(appt(aid, s["start"], s["end"], them, common[0][0] if common else None, sid))
            seen = set()
            for r in sorted(group, key=lambda r: -r["id"]):  # un patient une fois par créneau : rdv le plus récent
                if r["patient_id"] not in seen:
                    seen.add(r["patient_id"])
                    ap_rows.append(appt_patient(aid, r))
    out.append(insert("Appointment", ["id", "establishmentId", "serviceId", "startDate", "endDate",
                                      "thematicId", "type", "slotID"], appt_rows))
    out.append(insert("AppointmentPatient", ["id", "establishmentId", "serviceId", "appointmentId", "patientId",
                                             "accompanying", "status", "rejectionReason", "transmissionNotes"],
                      ap_rows))
    out.append("COMMIT;")
    print("\n".join(out))

    print(f"patients={len(patients)} slots={len(all_slots)} (dont reconstitués={len(orphans)}) "
          f"appointments={len(appt_rows)} appointmentPatients={len(ap_rows)} thematiques={len(them_names)}",
          file=sys.stderr)
    for f, c in unmatched.items():
        print(f"valeurs hors liste {f}: {dict(c)}", file=sys.stderr)


def appt(aid, start, end, them, typ, sid):
    t = APPT_TYPE.get(norm(typ))
    return (f"({q(aid)},:'est',:'svc',{q(str(start))},{q(str(end))},{them},"
            f"{q(t) + ('::\"AppointmentType\"' if t else '')},{q(sid)})")


def appt_patient(aid, r):
    st = YES_NO.get(norm(r["etat"]))
    return "(" + ",".join([
        q(f"clgx_app_{r['id']}"), ":'est'", ":'svc'", q(aid), q(f"clgx_pa_{r['patient_id']}"),
        q(YES_NO.get(norm(r["accompagnant"]))), q(st) + ('::"AppointmentStatus"' if st else ""),
        q(r["motif_refus"]), q(r["notes"]),
    ]) + ")"


def lookup_or_create(table, temp, name, prefix):
    return f"""INSERT INTO "{table}"(id,"establishmentId","serviceId",name)
SELECT {q(prefix + norm(name)[:40])}, :'est', :'svc', {q(name)} WHERE NOT EXISTS
  (SELECT 1 FROM "{table}" WHERE "serviceId" = :'svc' AND lower(name) = lower({q(name)}))
ON CONFLICT DO NOTHING;
INSERT INTO {temp} SELECT {q(name)}, (SELECT id FROM "{table}" WHERE "serviceId" = :'svc'
  AND lower(name) = lower({q(name)}) ORDER BY id LIMIT 1);"""


def insert(table, cols, values, chunk=500):
    if not values:
        return ""
    head = f'INSERT INTO "{table}"(' + ",".join(f'"{c}"' for c in cols) + ") VALUES\n"
    return "\n".join(head + ",\n".join(values[i:i + chunk]) + "\nON CONFLICT DO NOTHING;"
                     for i in range(0, len(values), chunk))


if __name__ == "__main__":
    main()
