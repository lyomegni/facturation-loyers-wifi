# PayeFacile (nom provisoire)

Facturation des loyers et des abonnements Wi-Fi au Cameroun : factures mensuelles automatiques en FCFA,
suivi des paiements, lien de paiement Orange Money / MTN MoMo (Campay), facture acquittée en PDF, et (étape suivante) relances WhatsApp.

## Étape 1 (ce dépôt aujourd'hui)

- **Espace** : compte, nom et coordonnées affichés sur les factures, préfixe de numérotation, délai d'émission.
- **Immeubles et zones Wi-Fi** : chaque contrat est rattaché à un bien.
- **Clients** : nom, numéro WhatsApp (normalisé en +237…), e-mail, notes, archivage.
- **Contrats** : loyer, redevance Wi-Fi ou autre ; montant mensuel, jour d'échéance (1 à 28), logement ou point d'accès, dates de début et de fin.
- **Factures** : émises automatiquement chaque matin (cron Vercel) `N` jours avant l'échéance (7 par défaut), une par contrat et par mois, numérotées `FAC-2026-0001` sans doublon. Bouton « Émettre les factures dues » pour le faire à la main.
- **Paiements** : saisie manuelle (Orange Money, MTN MoMo, espèces, virement), paiements partiels, statut mis à jour par la base (à payer, partiellement payée, en retard, payée, annulée).
- **Code QR d'authenticité** : chaque facture imprimable porte un code QR qui ouvre sa page publique de vérification (`/f/<jeton>`), avec son état de paiement.
- **Tableau de bord** : facturé et encaissé du mois, impayés en retard.
- **Import Excel / CSV** : clients et contrats en une fois, colonnes reconnues automatiquement, biens créés au besoin.

## Étape 2 : paiement Mobile Money (Campay) et facture PDF

- **Bouton « Payer »** sur la page publique de la facture (`/f/<jeton>`) : crée un lien de paiement Campay
  (Orange Money ou MTN MoMo) pour le reste à payer et y redirige le client.
- **Webhook Campay** (`/api/campay/webhook`) : signature JWT vérifiée, transaction relue chez Campay, paiement
  enregistré une seule fois (rejeu sans effet), facture passée à « payée ».
- **Facture PDF** (`/api/factures/<jeton>/pdf`) : tampon « ACQUITTÉE le … » une fois payée, même code QR
  d'authenticité. Lien sur la page publique et bouton « PDF » dans l'application.

### Configurer Campay

1. Dans le tableau de bord Campay, ouvrir l'application et copier le **jeton permanent** (Permanent access token)
   et la **clé du webhook** (Webhook key).
2. Les renseigner dans Vercel (ou `.env.local`) : `CAMPAY_TOKEN`, `CAMPAY_WEBHOOK_KEY`, et `CAMPAY_BASE_URL`
   (`https://demo.campay.net` pour les essais, l'adresse de production indiquée par Campay ensuite).
   Sans `CAMPAY_TOKEN`, le bouton « Payer » n'apparaît pas.
3. Déclarer l'URL du webhook dans Campay : `https://<votre-domaine>/api/campay/webhook`.
4. Appliquer les migrations `20261123000000_public_invoice.sql` et `20261123100000_campay.sql`.

Numéros de test (environnement démo) : `237677777777` MTN réussi, `237677777770` MTN échoué,
`237699999999` Orange réussi, `237699999990` Orange échoué.

## Étape 3 : WhatsApp (facture, rappels, reçu)

- **Chaque matin à 8 h (Douala)**, le cron `/api/cron/whatsapp` envoie : la facture le jour de son émission,
  puis des rappels à J-3, J (échéance), J+3 et J+7 tant qu'elle n'est pas réglée. Jamais plus d'un message par jour
  et par facture, jamais deux fois le même, rien pour les factures en retard de plus de 7 jours.
- **Reçu immédiat** dès qu'une facture est soldée (paiement Campay ou saisi à la main), avec le lien vers le PDF acquitté.
- **Fiche facture** : historique des messages (envoyé, remis, lu, refusé, incertain) et bouton « Renvoyer la facture sur WhatsApp ».
- **Réglages** : case « Envoyer les factures, rappels et reçus sur WhatsApp » dans Paramètres (désactivée par défaut),
  case « Ne pas contacter sur WhatsApp » sur chaque client.
- Un envoi dont WhatsApp n'a pas confirmé la réception (coupure réseau) est marqué « Incertain » et n'est **jamais**
  renvoyé automatiquement, pour ne pas écrire deux fois au client. Un refus explicite de Meta est retenté (3 fois au plus).

### Configurer WhatsApp (API Cloud de Meta)

1. **Compte Meta Business** : sur business.facebook.com, créer (ou utiliser) le portefeuille de votre entreprise.
2. **Application** : sur developers.facebook.com, « Créer une application », type **Business**, puis ajouter le produit
   **WhatsApp**. Meta fournit un **numéro de test** : il permet d'essayer tout de suite, vers 5 numéros que vous déclarez.
3. **Numéro dédié** : WhatsApp → Configuration de l'API → « Ajouter un numéro ». Utilisez votre numéro virtuel (il ne doit
   pas être déjà inscrit sur WhatsApp), vérifiez-le par SMS ou appel, et choisissez le **nom affiché** (votre entreprise).
4. **Jeton permanent** : Paramètres de l'entreprise → Utilisateurs système → créer un utilisateur système « admin »,
   lui attribuer l'application et le compte WhatsApp, puis « Générer un jeton » avec la permission
   `whatsapp_business_messaging` (et `whatsapp_business_management`), sans date d'expiration.
5. **Variables Vercel** (Secret, Production) :
   - `WHATSAPP_TOKEN` : le jeton permanent ;
   - `WHATSAPP_PHONE_NUMBER_ID` : l'« identifiant du numéro de téléphone » (WhatsApp → Configuration de l'API) ;
   - `WHATSAPP_APP_SECRET` : Paramètres de l'application → Général → « Clé secrète » ;
   - `WHATSAPP_VERIFY_TOKEN` : une phrase secrète de votre choix (sert à l'étape suivante).
   Puis **Redeploy**.
6. **Webhook** : WhatsApp → Configuration → Webhook : URL `https://<votre-domaine>/api/whatsapp/webhook`,
   jeton de vérification = `WHATSAPP_VERIFY_TOKEN`, puis s'abonner au champ **messages**.
7. **Modèles de messages** : WhatsApp Manager → Modèles → Créer, catégorie **Utility**, langue **French**,
   avec exactement ces noms et ces textes (les `{{n}}` sont remplis par l'application) :
   - `facture_emise` : Bonjour {{1}}, {{2}} vous remercie de votre confiance. Votre facture {{3}} ({{4}}) d'un montant de {{5}} est disponible, avec une échéance au {{6}}. Vous pouvez la régler par Orange Money ou MTN MoMo ici : {{7}} . Bonne journée.
   - `rappel_avant_echeance` : Bonjour {{1}}, {{2}} se permet de vous rappeler que votre facture {{3}} ({{4}}) de {{5}} arrive à échéance le {{6}}. Vous pouvez la régler ici : {{7}} . Merci beaucoup et bonne journée.
   - `rappel_echeance` : Bonjour {{1}}, {{2}} vous informe que votre facture {{3}} ({{4}}) de {{5}} arrive à échéance aujourd'hui. Vous pouvez la régler ici : {{6}} . Si c'est déjà fait, merci de ne pas tenir compte de ce message. Bonne journée.
   - `rappel_retard` : Bonjour {{1}}, sauf erreur de la part de {{2}}, votre facture {{3}} ({{4}}), échue le {{5}}, reste à régler pour un montant de {{6}}. Vous pouvez la régler ici : {{7}} . Si le paiement est déjà en cours, merci de ne pas tenir compte de ce message. Nous vous remercions de votre compréhension.
   - `recu_paiement` : Bonjour {{1}}, {{2}} a bien reçu votre paiement de {{3}} pour la facture {{4}} ({{5}}) le {{6}}. Votre facture acquittée est disponible ici : {{7}} . Merci pour votre confiance et à bientôt.
   Meta demande un exemple pour chaque variable (par ex. Jean Mballa, Immeuble Les Palmiers, FAC-2026-0001, Loyer décembre 2026, 75 000 FCFA, 05/12/2026, un lien). La validation prend de quelques minutes à 2 jours.
8. **Base** : appliquer la migration `20261124000000_whatsapp.sql` dans Supabase (SQL Editor).
9. **Activer** : une fois les 5 modèles validés, cocher la case WhatsApp dans Paramètres. Pour tester d'abord,
   utilisez un client dont le numéro est l'un de vos numéros de test, puis « Renvoyer la facture sur WhatsApp ».

## Prochaines étapes

4. Tableau de bord complet et mise en service.

## Stack

Next.js 16 (App Router, TypeScript) · Tailwind CSS · Supabase (PostgreSQL, Auth) cloisonné par espace (RLS) · Vercel (cron quotidien).

## Démarrer en local

1. Créer un projet Supabase (région UE, ex. Francfort ou Paris).
2. Appliquer les migrations de `supabase/migrations/` dans l'ordre (SQL Editor, ou `npx supabase db push`).
3. Copier `.env.example` vers `.env.local` et renseigner les clés.
4. Dans Supabase › Authentication › URL Configuration, ajouter `http://localhost:3000/auth/callback`.
5. `npm install` puis `npm run dev`.

```bash
npm test          # logique métier, Campay (signature, webhook), PDF
npm run typecheck
npm run build
```

## Mise en production

Vercel : importer le dépôt et renseigner les variables de `.env.example`. Le cron de `vercel.json` appelle
`/api/cron/factures` chaque jour à 5 h UTC (6 h à Douala) et `/api/cron/whatsapp` à 7 h UTC (8 h à Douala),
avec `Authorization: Bearer $CRON_SECRET`.

## Organisation du code

```
src/lib/domain/      logique métier pure et testée (dates, factures, montants, téléphones, import)
src/lib/invoicing.ts émission des factures (partagée par le cron et le bouton)
src/app/app/         application (pages et actions serveur)
src/app/api/cron/    émission quotidienne des factures
src/lib/campay.ts    client Campay (lien de paiement, transaction)
src/lib/pdf/         facture PDF
src/app/api/campay/  webhook de paiement
src/app/f/[token]/   page publique de vérification et de paiement
src/lib/whatsapp*.ts client Meta, répartiteur des envois et journal (règle d'envoi dans src/lib/domain/whatsapp.ts)
src/app/api/whatsapp/ webhook des statuts de remise ; src/app/api/cron/whatsapp/ envoi quotidien
supabase/migrations/ schéma, numérotation, paiements, RLS
```
