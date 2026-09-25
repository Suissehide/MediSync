export const toLocalhostIfLinux = (address: string): string =>
  process.platform === 'linux'
    ? address.replace('127.0.0.1', 'localhost').replace('0.0.0.0', 'localhost')
    : address

// Retire la chaine de requete d'une URL avant de la journaliser (task-5-re-review-3.md, I3) :
// `GET /patient/export?search=<nom du patient>` recopiait un nom de patient dans le journal
// applicatif, au niveau `info`, sur le chemin heureux, sans qu'aucune erreur ne survienne. Aucun
// autre parametre de requete de l'API ne porte aujourd'hui de donnee personnelle (page, action,
// userID, from/to/year/month, pathwayTemplateTags — des noms techniques ou des identifiants, pas
// du texte libre) ; on retire toute la chaine plutot que de maintenir une liste de parametres a
// masquer au coup par coup, qui se perime des qu'une route ajoute un filtre en texte libre sans y
// penser.
export const pathWithoutQuery = (url: string): string => url.split('?')[0] ?? url
