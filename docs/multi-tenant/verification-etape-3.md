# Vérification manuelle de l'étape 3 (dossier patient par service)

Procédure à exécuter à la main contre le serveur de développement (port
4270), après avoir démarré l'application normalement et peuplé la base par le
seed à deux services. Ce document ne remplace pas les portes automatisées
(`back` : build, lint, tests unitaires, tests e2e ; `front` : build, tests) —
il vérifie ce qu'elles ne peuvent pas vérifier : ce qu'un compte voit
réellement à l'écran.

## Un avertissement qui s'inverse par rapport à l'étape 2

`verification-etape-2.md` avertissait que **la liste des patients ne prouve
rien** : avec le seed d'alors, les seize patients étaient rigoureusement
identiques dans les deux services (même nom, même ordre), parce que le
patient était encore un modèle d'établissement indivis. Une procédure qui se
serait fiée à cette liste n'aurait rien contrôlé.

**Ce n'est plus vrai depuis la tâche 12, et c'est même le critère de sortie de
cette étape.** Vérifié dans le seed plutôt que supposé, avant d'écrire cette
procédure :

- `back/prisma/seed.ts` appelle désormais `seedPatients` avec deux listes
  disjointes, `PATIENTS_CARDIOLOGIE` et `PATIENTS_PNEUMOLOGIE`
  (`back/prisma/seed/data/patient.ts`), sans aucun nom en commun entre les
  deux — **10 patients en Cardiologie, 6 en Pneumologie, zéro recouvrement**,
  contre les 16 patients identiques des deux côtés à l'étape 2 ;
- `back/prisma/seed/patient.ts` crée, pour chaque patient, un sous-dossier
  (`PatientServiceFile`) rattaché au service de l'appelant — les patients de
  Cardiologie n'ont donc un sous-dossier qu'en Cardiologie, ceux de
  Pneumologie qu'en Pneumologie ; **aucun patient du seed n'a, par défaut, un
  sous-dossier dans les deux services** (voir le point 6 ci-dessous, qui en
  crée un délibérément pour vérifier le signal de suivi ailleurs) ;
- au moins un patient de chaque liste porte un champ clinique non vide et
  identifiable à l'écran — Claire Martin (Cardiologie) a pour diagnostic
  médical « Diabète de type 2 » — ce qui permet de vérifier à l'œil qu'un
  champ précis apparaît ou disparaît, pas seulement qu'une liste est vide ou
  pleine.

La procédure ci-dessous s'appuie donc directement sur l'écran patient, ce que
celle de l'étape 2 devait explicitement éviter.

## Un rappel qui doit être dit sans détour

**La vérification manuelle de l'étape 2 (`verification-etape-2.md`, huit
points) n'a jamais été exécutée.** Elle reste valide et à faire — rien dans
cette étape ne l'a rendue obsolète, à l'exception du point 3 (« la liste des
patients ne prouve rien »), que le paragraphe ci-dessus vient de corriger
pour le contexte de cette étape-ci uniquement. **La procédure ci-dessous ne
la recouvre pas** : elle porte spécifiquement sur le dossier patient par
service (cloisonnement du sous-dossier, séparation identité/dossier, signal
de suivi ailleurs, recherche d'identité), pas sur le sélecteur de service, les
filtres persistés, les anciennes URLs ou l'accès administrateur sans service,
que seule la procédure de l'étape 2 couvre. Les deux procédures sont
complémentaires et doivent, à terme, être exécutées toutes les deux.

## Comptes du seed

| Compte | Mot de passe | Services | Ce qu'il permet de vérifier ici |
|---|---|---|---|
| `admin@qwetle.fr` | `Admin123!` | Cardiologie **et** Pneumologie (COORDINATEUR des deux) | tous les points ci-dessous, y compris le rattachement inter-service |
| `sabrina.bernadet@cepta.fr` | `User123!` | Cardiologie seul (INTERVENANT) | l'accès clinique complet, limité à Cardiologie |
| `secretariat.cardiologie@cepta.fr` | `User123!` | Cardiologie seul (SECRETARIAT) | le filtrage des trois champs cliniques sur le sous-dossier |

## Procédure

1. **Deux services, deux listes de patients réellement différentes.** Se
   connecter avec `admin@qwetle.fr`, ouvrir la liste des patients en
   Cardiologie. Observer : dix patients, dont Claire Martin, Julien Durand,
   Marie Lefebvre… Changer de service vers Pneumologie via le sélecteur.
   Observer : une liste **différente**, six patients, dont Nadia Belkacem,
   Thierry Lemoine… **Aucun nom de la liste de Cardiologie ne doit
   apparaître en Pneumologie, ni l'inverse.** C'est le point qui remplace,
   pour cette étape, l'avertissement de `verification-etape-2.md` : ici la
   liste des patients prouve quelque chose, et c'est la première chose à
   vérifier.

2. **La fiche patient affiche deux blocs, nommés et visuellement séparés.**
   Toujours en Cardiologie, ouvrir la fiche de Claire Martin, onglet « Profil
   & Contexte ». Observer deux blocs distincts : « Identité partagée entre
   les services de l'établissement » (distance, niveau d'études,
   profession…) et, séparé par un intitulé propre, « Dossier de ce
   service — non visible des autres services » (soignant référent, suivi à
   régulariser, notes, détails — les quatre champs de ce bloc ; **vides**
   pour Claire Martin dans le seed, ce qui est normal : son `clinicalFile` ne
   porte que `medicalDiagnosis`, `orientation`, `programType`). Aller sur
   l'onglet « Parcours & Inclusion » : le champ « Diagnostic médical »
   affiche « Diabète de type 2 ». Ce champ est celui qui n'existe que pour
   Cardiologie — c'est ce que le point suivant vérifie par la négative
   (sur un patient qui, lui, porte aussi une valeur dans le bloc « Dossier
   de ce service »).

3. **Le secrétariat voit le sous-dossier moins trois champs cliniques.**
   Toujours avec `admin@qwetle.fr` (accès clinique complet), ouvrir la fiche
   de **Pierre Bernard** (Cardiologie) : onglet « Parcours & Inclusion », le
   champ « Diagnostic médical » affiche « Post-infarctus du myocarde » ;
   onglet « Profil & Contexte », bloc « Dossier de ce service », le champ
   « Notes » affiche « Suivi rapproché nécessaire ». Se déconnecter, se
   reconnecter avec `secretariat.cardiologie@cepta.fr`, rouvrir la même
   fiche (Pierre Bernard). Observer : le champ « Diagnostic médical » est
   **vide**, et le champ « Notes » est **vide** — alors qu'ils portaient
   tous deux une valeur au paragraphe précédent pour un compte à accès
   clinique. Les treize autres champs du dossier de service (soignant
   référent, date d'entrée, mode de prise en charge…) restent affichés
   normalement. **Le champ « Détails » n'est pas démontrable ici** : aucun
   des seize patients du seed (`back/prisma/seed/data/patient.ts`) ne porte
   de valeur pour ce champ, donc il reste vide pour tout compte — y compris
   un compte à accès clinique complet — et son vide ne prouve rien pour le
   secrétariat spécifiquement. Il est masqué par le même mécanisme que
   « Notes » et « Diagnostic médical » (`back/src/main/utils/clinical-fields.ts`,
   `CLINICAL_FIELDS`), non démontré à l'écran faute de donnée de seed. Ce
   comportement n'est pas nouveau (il existait déjà sur le patient avant
   cette étape) : ce point vérifie qu'il s'applique bien au sous-dossier
   maintenant qu'il porte ces trois champs, sans modification de code
   au-delà de ce que l'étape devait vérifier (spec §5.2).

4. **Un sous-dossier d'un service reste inatteignable depuis l'autre.**
   Toujours avec `admin@qwetle.fr` (qui a accès aux deux services), noter
   l'identifiant de Claire Martin dans l'URL de sa fiche en Cardiologie.
   Changer de service vers Pneumologie via le sélecteur, puis remplacer dans
   la barre d'adresse l'identifiant de patient par celui de Claire Martin
   tout en restant sous l'URL de Pneumologie. Observer : son **identité**
   (nom, date de naissance…) reste visible — c'est attendu, l'identité est
   partagée à l'échelle de l'établissement, décision D1 de
   `decisions-etape-3.md` — mais l'onglet « Parcours & Inclusion » et le
   bloc « Dossier de ce service » de l'onglet « Profil & Contexte »
   n'affichent **aucune** des valeurs vues au point 2 : ni « Diabète de type
   2 », ni aucun autre champ du dossier de Cardiologie. Le dossier de
   service apparaît vide (aucun sous-dossier de Pneumologie n'existe encore
   pour Claire), pas rempli avec les données de l'autre service. **Et le
   bloc identité n'affiche aucune mention « Suivi existant dans un autre
   service de l'établissement. »** — alors même que Claire Martin *est*
   suivie ailleurs (en Cardiologie). C'est la vérification de la décision D3
   de `decisions-etape-3.md` (la correction la plus importante de l'étape
   sur ce point) : le signal de suivi ailleurs ne doit apparaître **que** si
   le service courant possède déjà lui-même un sous-dossier pour ce patient
   — ici Pneumologie n'en a aucun, donc le signal doit rester absent, même
   si un autre service en a un. Si cette mention apparaissait ici, ce serait
   une régression de D3 : chercher ou ouvrir un patient depuis un service
   qui ne le suit pas révélerait qu'il est suivi ailleurs.

5. **Rechercher une identité existante ne révèle que l'identité.** Toujours
   avec `admin@qwetle.fr`, sur Cardiologie, ouvrir « Ajouter un patient »,
   saisir « Nadia » dans le champ Prénom, cliquer « Rechercher un patient
   existant ». Observer : le résultat affiche « Nadia Belkacem — né(e)
   le… » et un bouton « Choisir » — **rien d'autre** : ni mention d'un suivi
   ailleurs, ni service, ni aucune donnée clinique. C'est la propriété que
   `decisions-etape-3.md` (D3) documente comme fermée : trouver quelqu'un ne
   révèle que son identité.

6. **Rattacher une identité crée un sous-dossier vide et allume le signal,
   dans les deux sens.** Poursuivre depuis le point précédent : cliquer
   « Choisir » sur Nadia Belkacem. Observer : la popup se ferme, Nadia
   apparaît maintenant dans la liste des patients de Cardiologie (un
   patient qui n'y était pas au point 1). Ouvrir sa fiche : le dossier de
   service est **vide** (aucune valeur reprise de son dossier de
   Pneumologie), et l'onglet « Profil & Contexte » affiche, sous le titre du
   bloc identité, la mention « Suivi existant dans un autre service de
   l'établissement. » — rien de plus, ni le nom du service ni son nombre.
   Changer de service vers Pneumologie et rouvrir la fiche de Nadia : la
   même mention apparaît maintenant **aussi de ce côté** (Cardiologie porte
   désormais, elle aussi, un sous-dossier pour cette personne) — c'est le
   test « dans les deux sens » exigé par la spécification (§7). **Ce
   rattachement est irréversible** : aucun écran ne permet de retirer le
   sous-dossier créé en Cardiologie pour Nadia.

7. **Créer un patient sans parcours l'affiche immédiatement dans la liste du
   service où il a été créé.** Toujours en Cardiologie, ouvrir « Ajouter un
   patient », saisir un nom qui n'existe dans aucune des deux listes (ex.
   « Test Vérification »), cliquer « Créer sans parcours ». Observer : le
   nouveau patient apparaît **immédiatement** dans la liste de Cardiologie,
   sans avoir besoin d'un rendez-vous ni d'une inscription à un parcours.
   Ce point vérifie la fermeture d'un défaut réel trouvé pendant la tâche
   12 (`decisions-etape-3.md`, D6) : avant sa correction, un patient ainsi
   créé disparaissait de la liste de tout service, y compris celui où il
   venait d'être créé.

8. **Compte à un seul service, accès clinique complet.** Se déconnecter, se
   reconnecter avec `sabrina.bernadet@cepta.fr`. Observer : aucun sélecteur
   de service (comme à l'étape 2 — ce point n'est pas nouveau, il est repris
   ici pour vérifier qu'il tient toujours avec le dossier patient). Ouvrir la
   fiche de Claire Martin : contrairement au secrétariat (point 3), le champ
   « Diagnostic médical » affiche bien « Diabète de type 2 » — un compte
   intervenant, limité à un seul service, garde son accès clinique complet
   sur ce service.

---

**Ce que cette procédure ne couvre pas**, et qui reste à vérifier via
`verification-etape-2.md` (jamais exécutée, voir plus haut) : le sélecteur de
service lui-même, les filtres de soignants persistés par service, la
redirection des anciennes URL avec conservation des paramètres de recherche,
l'accès d'un administrateur d'établissement sans aucune affectation de
service, et la déconnexion/reconnexion avec mémorisation du dernier service
visité.
