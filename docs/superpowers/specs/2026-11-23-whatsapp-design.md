# Étape 3 : envois WhatsApp (facture, rappels, reçu) — conception

Discutée avec Léopold dans le fil du projet le 23 novembre 2026.

## Pourquoi

Léopold veut être payé à temps sans relancer chaque locataire et chaque abonné Wi-Fi à la main.
Chaque client reçoit donc sur WhatsApp sa facture avec le lien de paiement Mobile Money, des rappels tant
qu'elle n'est pas réglée, puis un reçu une fois payée. Environ 50 factures par mois au départ.

## Objectifs

1. **Facture** : dès qu'une facture « à payer » est émise, le client reçoit un message avec le libellé,
   le montant, l'échéance et le lien `/f/<jeton>` (paiement Campay déjà en place).
2. **Rappels** à J-3, J (jour de l'échéance), J+3 et J+7 tant que la facture est « à payer ».
3. **Reçu** : dès que la facture passe « payée » (paiement Campay ou saisi à la main), le client reçoit un message
   de confirmation avec le lien vers la facture acquittée PDF `/api/factures/<jeton>/pdf`.
4. **Suivi** : sur la fiche facture, l'historique des messages WhatsApp (type, date, statut : envoyé, remis, lu,
   échec avec la raison) et un bouton « Renvoyer la facture sur WhatsApp ».

## Non-objectifs

- Recevoir ou traiter les réponses des clients (conversation). Le numéro sert à envoyer.
- Relancer les vieilles dettes : les factures dont l'échéance date de plus de 7 jours au moment de l'activation
  ne reçoivent rien.
- Plusieurs numéros d'envoi (un par espace). Un seul numéro pour toute l'application, réglé par variables d'environnement.
- SMS de secours, e-mail.

## Anti-objectifs (échec même si « ça marche »)

- Un client reçoit deux fois le même message, ou plusieurs messages le même jour pour la même facture.
- Un message part pour une facture payée ou annulée (sauf le reçu d'une facture payée).
- Un envoi qui échoue bloque l'émission des factures ou l'enregistrement d'un paiement.
- Un flot de messages part d'un coup vers des clients en retard depuis longtemps à la mise en service.

## Contraintes

- **API WhatsApp Cloud de Meta en direct** (option A choisie par Léopold). Pas d'intermédiaire.
- **Numéro dédié**, virtuel si possible (Léopold ne veut pas déplacer son numéro WhatsApp Business actuel).
  Le code ne dépend pas du numéro : `WHATSAPP_PHONE_NUMBER_ID` suffit.
- Pour écrire en premier, Meta impose des **modèles** (catégorie « utility », langue `fr`) validés à l'avance.
  Chaque message envoyé est facturé par Meta.
- Fuseau `Africa/Douala`. Les envois quotidiens partent vers **8 h** heure de Douala (07:00 UTC), après l'émission
  des factures (cron existant à 05:00 UTC).
- Hébergement Vercel (cron quotidien), Supabase, Next.js 16 : même pile que les étapes 1 et 2.
- Les numéros des clients sont déjà stockés au format international `+237…` (`customers.phone`).

## Approches envisagées

- **A. API Cloud de Meta en direct (choisie).** Seul coût : le tarif Meta par message. Numéro virtuel
  (par exemple Twilio, 1 à 2 $/mois) qui reçoit le SMS ou l'appel de vérification. Indicatif souvent étranger,
  mais le nom de l'entreprise s'affiche. Le même code marche avec un futur numéro camerounais.
- B. Twilio WhatsApp : inscription Meta simplifiée, mais environ 0,005 $ de plus par message et un fournisseur de plus.
- C. Envoi semi-manuel (lien `wa.me` cliqué par Léopold) : gratuit mais pas automatique, contraire au but.

## Comportement attendu

### Quand envoyer quoi (règle de calcul, pure et testée)

Pour une facture donnée et la date du jour `today` (Douala), avec les messages déjà envoyés :

| Type        | Date prévue         | Condition                     |
|-------------|---------------------|-------------------------------|
| `facture`   | `issued_on`         | statut `a_payer`              |
| `rappel_j-3`| `due_on - 3 jours`  | statut `a_payer`              |
| `rappel_j`  | `due_on`            | statut `a_payer`              |
| `rappel_j+3`| `due_on + 3 jours`  | statut `a_payer`              |
| `rappel_j+7`| `due_on + 7 jours`  | statut `a_payer`              |
| `recu`      | dès que payée       | statut `payee`                |

- Chaque type part **au plus une fois** par facture (garanti en base par une contrainte unique).
- Pour une facture « à payer », on envoie **au plus un message par jour** : le type le plus récent dont la date prévue
  est atteinte (`<= today`) et qui n'a pas encore été envoyé. Les types plus anciens non envoyés sont abandonnés
  (pas de rattrapage en rafale). Le `facture` reste prioritaire tant qu'il n'est pas parti : s'il part aujourd'hui,
  aucun rappel ne part le même jour.
- Rattrapage limité : un type n'est envoyé que si sa date prévue date de **2 jours au plus** (cron manqué, Meta en panne).
  Au-delà, il est abandonné. Cela vaut aussi pour `facture` : une facture émise il y a plus de 2 jours sans message
  `facture` ne bloque pas les rappels, qui partent normalement à leur date.
- Facture dont l'échéance est passée de plus de 7 jours : rien (non-objectif « vieilles dettes »).
- Client sans numéro, client qui a refusé WhatsApp, ou espace où WhatsApp est désactivé : rien, sans erreur.
- `recu` : envoyé pour une facture `payee` dont `paid_at` date de 2 jours au plus, si pas déjà envoyé.
  Le montant annoncé est le total encaissé (`paid_xaf`).
- Paiement supprimé après coup (facture repassée « à payer ») : la règle s'applique normalement ; les types déjà
  envoyés ne repartent pas, et un second `recu` ne part pas si elle est payée de nouveau. Cas rare, accepté.

### Déclenchement

- Une facture émise en cours de journée (bouton « Émettre maintenant ») reçoit son message `facture` au passage
  du cron suivant, à 8 h. Pas d'envoi immédiat à l'émission : un seul chemin, et pas de message la nuit.
  Léopold peut utiliser « Renvoyer » s'il veut l'envoyer tout de suite.
- **Cron quotidien** `/api/cron/whatsapp` à 07:00 UTC, protégé par `CRON_SECRET` comme le cron existant :
  parcourt les factures candidates de tous les espaces actifs et envoie selon la règle.
- **Reçu immédiat** : après un paiement Campay enregistré (webhook) ou un paiement saisi qui solde la facture,
  l'application tente d'envoyer le `recu` tout de suite. Un échec ici ne doit jamais faire échouer l'enregistrement
  du paiement ; le cron du lendemain rattrape.
- **Bouton « Renvoyer la facture sur WhatsApp »** (fiche facture, rôles admin et gestionnaire, facture `a_payer`) :
  renvoie le modèle `facture`. Si le `facture` automatique n'est pas encore parti, ce clic est journalisé comme `facture`
  (le cron ne le renverra pas) ; sinon il est journalisé à part (type `renvoi`, sans limite d'unicité). Action humaine
  explicite : elle n'est pas soumise à la limite « un message par jour ». Refusée (message clair) si WhatsApp n'est pas
  configuré, désactivé pour l'espace, si le client n'a pas de numéro ou a refusé WhatsApp.

### Journal des messages

Nouvelle table `whatsapp_messages` : espace, facture, type, numéro destinataire, identifiant Meta (`wamid`),
statut (`en_cours`, `envoye`, `remis`, `lu`, `echec`, `incertain`), raison de l'échec, nombre de tentatives, dates.
Contrainte unique (facture, type) sauf pour `renvoi`.
Lecture réservée aux membres de l'espace (RLS comme les autres tables) ; écriture par le serveur uniquement.

On écrit la ligne **avant** l'appel à Meta (réservation, statut `en_cours`) pour qu'un double déclenchement simultané
ne puisse pas envoyer deux fois. Ensuite :
- Meta répond avec un `wamid` → `envoye`.
- Meta répond par un refus explicite (réponse HTTP 4xx avec un objet d'erreur) → `echec` avec la raison. Le message
  n'est pas parti, donc il peut être retenté : la même ligne est reprise (tentatives + 1) au passage suivant du cron,
  tant que la règle de date l'autorise et dans la limite de 3 tentatives.
- Pas de réponse claire (délai dépassé, coupure réseau, 5xx) → `incertain`. Meta a peut-être envoyé : **jamais retenté**
  automatiquement, pour ne pas doubler. Visible sur la fiche facture ; Léopold peut utiliser « Renvoyer ».
- Ligne restée `en_cours` plus d'une heure (processus interrompu) → traitée comme `incertain`.

### Statuts de remise (webhook Meta)

Route `/api/whatsapp/webhook` :
- `GET` : vérification Meta (`hub.mode=subscribe`, `hub.verify_token` = `WHATSAPP_VERIFY_TOKEN`) → renvoie `hub.challenge`.
- `POST` : signature `X-Hub-Signature-256` (HMAC-SHA256 du corps brut avec `WHATSAPP_APP_SECRET`) obligatoire, sinon 401.
  Met à jour le statut de la ligne par `wamid` (`delivered` → `remis`, `read` → `lu`, `failed` → `echec` + raison).
  Un statut ne recule jamais (lu ne redevient pas remis). Messages entrants et événements inconnus : 200, ignorés.

### Réglages

- Espace : case « Envoyer les factures et rappels sur WhatsApp » (désactivée par défaut), page Paramètres, admin.
- Client : case « Ne pas contacter sur WhatsApp » sur la fiche client.
- Sans les variables WhatsApp configurées, rien n'est envoyé et la page Paramètres l'indique.

### Modèles Meta (à créer par Léopold, texte exact fourni)

Cinq modèles « utility », langue `fr`, variables numérotées. Le texte final figure dans le README.
1. `facture_emise` : nom de l'entreprise, libellé, montant, échéance, lien de paiement.
2. `rappel_avant_echeance` (J-3) : libellé, montant, échéance, lien.
3. `rappel_echeance` (J) : libellé, montant, lien.
4. `rappel_retard` (J+3 et J+7) : libellé, montant restant, échéance dépassée, lien.
5. `recu_paiement` : libellé, montant payé, date, lien vers le PDF acquitté.
Le montant est formaté comme sur les factures (`25 000 FCFA`), les dates en `JJ/MM/AAAA`.
Les rappels annoncent le **reste à payer** (montant − déjà payé).

### Configuration (variables d'environnement)

`WHATSAPP_TOKEN` (jeton permanent d'un utilisateur système Meta), `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, et optionnellement `WHATSAPP_API_VERSION` (défaut : version
courante de l'API Graph au moment du code). Le README donne les étapes Meta pas à pas (compte Business, application,
numéro, modèles, jeton, webhook), y compris le **numéro de test Meta** pour essayer avant d'avoir le numéro virtuel.

## Laissé au constructeur

- Découpage des fichiers, noms internes, forme exacte du client HTTP vers Meta (en suivant le style de `src/lib/campay.ts`).
- Ordre et pagination des requêtes du cron (volume faible : quelques centaines de factures au plus).
- Présentation de l'historique sur la fiche facture (sobre, cohérente avec l'existant).
