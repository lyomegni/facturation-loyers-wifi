# Étape 2 : paiement Campay et facture acquittée — spécification

Validée avec Léopold dans le fil du projet (20 et 23 novembre 2026).

## Objectif

Chaque facture peut être payée en ligne par Orange Money ou MTN MoMo via **Campay** (agrégateur
déjà utilisé par Léopold pour ses zones Wi-Fi). Le paiement confirmé est enregistré tout seul,
et une facture acquittée en PDF, portant le code QR d'authenticité, est téléchargeable.

## Exigences

1. **Lien de paiement stable** : le lien envoyé au client (par WhatsApp à l'étape 3) est la page publique
   `/f/<jeton>` déjà existante. Elle affiche un bouton « Payer par Orange Money / MTN MoMo » tant que la facture
   n'est ni payée ni annulée.
2. **Création du paiement à la demande** : un clic sur le bouton demande à Campay un lien
   (`POST /api/get_payment_link/`) pour le **reste à payer**, en XAF entier, puis redirige le client vers Campay.
   `external_reference` = identifiant de la facture. Retour sur `/f/<jeton>?paiement=retour`.
3. **Confirmation par webhook** : Campay appelle `/api/campay/webhook` (GET ou POST, paramètres en query string).
   - La `signature` (JWT HS256, clé = « webhook key » de l'application Campay) doit être valide, sinon 401.
   - L'application ne croit pas les paramètres : elle relit la transaction (`GET /api/transaction/<reference>/`)
     et n'enregistre que si `status = SUCCESSFUL`.
   - Le paiement est enregistré une seule fois (`payments.provider_ref` = référence Campay, unique), avec
     `provider = 'campay'`, `method` = `orange_money` ou `mtn_momo` selon l'opérateur, le montant reçu.
     Le déclencheur SQL existant met la facture à « payée ».
   - Un webhook rejoué renvoie 200 sans doublon. Une facture inconnue ou annulée : 200, rien enregistré, erreur journalisée.
4. **Vérification au retour** : à l'affichage de `/f/<jeton>?paiement=retour`, si la facture n'est pas encore payée,
   la page indique « Paiement en cours de confirmation » (le webhook fait foi, pas de polling).
5. **Facture acquittée PDF** : `/api/factures/<jeton>/pdf` (public, par jeton) produit une facture A4 avec le même
   contenu que la version imprimable, le code QR vers `/f/<jeton>`, et le tampon « ACQUITTÉE le JJ/MM/AAAA » si payée.
   Liens vers ce PDF sur la page publique et sur la fiche facture.
6. **Configuration** : `CAMPAY_BASE_URL` (défaut `https://demo.campay.net`), `CAMPAY_TOKEN` (jeton permanent
   « APP KEYS »), `CAMPAY_WEBHOOK_KEY`. Sans configuration Campay, le bouton de paiement n'apparaît pas.

## Hors périmètre

Envoi WhatsApp (étape 3), remboursements, retraits, paiement en plusieurs fois initié par le client.

## Référence API

Documentation : https://documenter.getpostman.com/view/2391374/T1LV8PVA. Numéros de test démo :
237677777777 (MTN, succès), 237677777770 (MTN, échec), 237699999999 (Orange, succès), 237699999990 (Orange, échec).
