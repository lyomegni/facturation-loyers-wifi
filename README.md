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

## Prochaines étapes

3. WhatsApp (API Cloud de Meta) : envoi de la facture, relances, reçu.
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
`/api/cron/factures` chaque jour à 5 h UTC (6 h à Douala) avec `Authorization: Bearer $CRON_SECRET`.

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
supabase/migrations/ schéma, numérotation, paiements, RLS
```
