# PayeFacile (nom provisoire)

Facturation des loyers et des abonnements Wi-Fi au Cameroun : factures mensuelles automatiques en FCFA,
suivi des paiements, et (étapes suivantes) lien de paiement Orange Money / MTN MoMo et relances WhatsApp.

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

## Prochaines étapes

2. Paiement Mobile Money par lien (agrégateur camerounais), facture acquittée en PDF.
3. WhatsApp (API Cloud de Meta) : envoi de la facture, relances, reçu.
4. Tableau de bord complet et mise en service.

## Stack

Next.js 16 (App Router, TypeScript) · Tailwind CSS · Supabase (PostgreSQL, Auth) cloisonné par espace (RLS) · Vercel (cron quotidien).

## Démarrer en local

1. Créer un projet Supabase (région UE, ex. Francfort ou Paris).
2. Appliquer `supabase/migrations/20261120000000_init.sql` (SQL Editor, ou `npx supabase db push`).
3. Copier `.env.example` vers `.env.local` et renseigner les clés.
4. Dans Supabase › Authentication › URL Configuration, ajouter `http://localhost:3000/auth/callback`.
5. `npm install` puis `npm run dev`.

```bash
npm test          # logique métier : échéances, factures, téléphones, montants, import
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
supabase/migrations/ schéma, numérotation, paiements, RLS
```
