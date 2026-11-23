# Paiement Campay et facture acquittée — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** payer une facture par Orange Money / MTN MoMo via Campay, l'enregistrer automatiquement, et produire la facture acquittée en PDF avec le code QR.

**Architecture:** la logique pure (vérification du JWT, lecture du webhook, choix du moyen de paiement) vit dans `src/lib/domain/campay.ts`, testée sans réseau. Un petit client HTTP `src/lib/campay.ts` (fetch injectable) parle à Campay. Les routes Next.js utilisent le client Supabase service (`createAdminClient`) car le client payeur n'est pas connecté. Le PDF est rendu par `@react-pdf/renderer`, déjà en dépendance.

**Tech Stack:** Next.js 16, TypeScript, Supabase, Vitest, @react-pdf/renderer, qrcode, `node:crypto`.

**Spec:** `docs/superpowers/specs/2026-11-23-campay-paiement.md`

## Global Constraints

- Montants en XAF entiers ; Campay refuse les décimales (ER201).
- Aucune nouvelle dépendance npm : JWT vérifié avec `node:crypto` (HMAC-SHA256, comparaison `timingSafeEqual`).
- Secrets uniquement côté serveur : `CAMPAY_TOKEN`, `CAMPAY_WEBHOOK_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Textes visibles en français.
- Chaque commit passe `npm test`, `npm run typecheck` et `npm run build`.

## Review Focus

- Webhook rejoué (Campay renvoie souvent deux fois) : un seul paiement, réponse 200.
- Signature absente, falsifiée ou signée avec `alg: none` : 401, rien enregistré.
- Paramètres du webhook mentant sur le statut ou le montant : seul le statut relu chez Campay compte.
- Facture déjà payée ou annulée quand le client clique « Payer » : pas de lien créé, message clair.
- Campay injoignable ou réponse d'erreur au clic « Payer » : message d'erreur sur la page publique, pas de page 500.

---

### Task 1: Logique Campay pure

**Files:**
- Create: `src/lib/domain/campay.ts`
- Test: `src/lib/domain/campay.test.ts`

**Interfaces:**
- Produces:
  - `verifyHs256Jwt(token: string, key: string): Record<string, unknown> | null` — `null` si format, `alg` ≠ `HS256` ou signature invalides.
  - `operatorToMethod(operator: string | null | undefined): "orange_money" | "mtn_momo" | "autre"` — insensible à la casse, `MTN`, `ORANGE`.
  - `type CampayWebhook = { reference: string; status: string; externalReference: string | null; signature: string }`
  - `parseWebhookParams(params: URLSearchParams): CampayWebhook | null` — `null` si `reference` ou `signature` manquent.
  - `type CampayTransaction = { reference: string; status: "SUCCESSFUL" | "FAILED" | "PENDING" | string; amount: number; operator: string | null; externalReference: string | null; operatorReference: string | null }`
  - `parseTransaction(json: unknown): CampayTransaction` — lève une `Error` si `reference` absent ; `amount` converti en entier (`"5000"` → 5000).

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
const key = "cle-webhook";
const good = signHs256({ status: "SUCCESSFUL" }, key); // helper de test : header {"alg":"HS256","typ":"JWT"}, base64url, HMAC node:crypto
expect(verifyHs256Jwt(good, key)).toEqual({ status: "SUCCESSFUL" });
expect(verifyHs256Jwt(good, "autre-cle")).toBeNull();
expect(verifyHs256Jwt(good.slice(0, -2) + "xx", key)).toBeNull();
expect(verifyHs256Jwt(unsignedNoneToken, key)).toBeNull();   // header {"alg":"none"}, signature vide
expect(verifyHs256Jwt("pas-un-jwt", key)).toBeNull();
expect(operatorToMethod("MTN")).toBe("mtn_momo");
expect(operatorToMethod("orange")).toBe("orange_money");
expect(operatorToMethod(undefined)).toBe("autre");
expect(parseWebhookParams(new URLSearchParams("reference=r1&status=SUCCESSFUL&signature=s&external_reference=inv1")))
  .toEqual({ reference: "r1", status: "SUCCESSFUL", externalReference: "inv1", signature: "s" });
expect(parseWebhookParams(new URLSearchParams("status=SUCCESSFUL"))).toBeNull();
expect(parseTransaction({ reference: "r1", status: "SUCCESSFUL", amount: "5000", operator: "MTN", external_reference: "inv1", operator_reference: "op1" }))
  .toEqual({ reference: "r1", status: "SUCCESSFUL", amount: 5000, operator: "MTN", externalReference: "inv1", operatorReference: "op1" });
expect(() => parseTransaction({})).toThrow();
```

- [ ] **Step 2: `npx vitest run src/lib/domain/campay.test.ts`** — attendu : échec, module introuvable.
- [ ] **Step 3: Implémenter les fonctions ci-dessus dans `src/lib/domain/campay.ts`.**
- [ ] **Step 4: Relancer le test** — attendu : PASS.
- [ ] **Step 5: Commit** `feat: logique Campay (JWT, webhook, transaction)`

### Task 2: Client HTTP Campay

**Files:**
- Create: `src/lib/campay.ts`
- Test: `src/lib/campay.test.ts`
- Modify: `.env.example` (ajouter `CAMPAY_BASE_URL=https://demo.campay.net`, `CAMPAY_TOKEN=`, `CAMPAY_WEBHOOK_KEY=`)

**Interfaces:**
- Consumes: `parseTransaction`, `CampayTransaction` (Task 1).
- Produces:
  - `campayConfigured(): boolean` — vrai si `CAMPAY_TOKEN` et `CAMPAY_WEBHOOK_KEY` sont définis.
  - `type PaymentLinkRequest = { amount: number; description: string; externalReference: string; redirectUrl: string; firstName?: string; lastName?: string; email?: string | null }`
  - `createPaymentLink(req: PaymentLinkRequest, fetchImpl?: typeof fetch): Promise<{ link: string; reference: string | null }>` — `POST {base}/api/get_payment_link/`, en-tête `Authorization: Token <CAMPAY_TOKEN>`, corps avec `amount` en chaîne, `currency: "XAF"`, `external_reference`, `redirect_url`, `failure_redirect_url` = `redirectUrl`, `payment_options: "MOMO"`, `payer_can_pay_more: "no"`. Lève `Error("Campay : …")` si réponse non 2xx ou sans `link`.
  - `getTransaction(reference: string, fetchImpl?: typeof fetch): Promise<CampayTransaction>` — `GET {base}/api/transaction/<reference>/` (référence encodée).

- [ ] **Step 1: Tests qui échouent** avec un `fetch` factice qui enregistre l'appel : URL `https://demo.campay.net/api/get_payment_link/`, méthode `POST`, en-tête `Authorization: Token tok`, `JSON.parse(body)` contient `{ amount: "75000", currency: "XAF", external_reference: "inv1" }` ; résultat `{ link: "https://pay/x", reference: "r1" }`. Réponse 400 → rejet avec un message contenant `Campay`. `getTransaction("r 1")` appelle `…/api/transaction/r%201/`.
- [ ] **Step 2: Lancer** `npx vitest run src/lib/campay.test.ts` — échec attendu.
- [ ] **Step 3: Implémenter** (variables lues à l'appel, pas au chargement du module, pour que les tests puissent les poser).
- [ ] **Step 4: Relancer** — PASS.
- [ ] **Step 5: Commit** `feat: client API Campay`

### Task 3: Enregistrement idempotent d'un paiement Campay + webhook

**Files:**
- Create: `src/lib/payments.ts`
- Create: `src/app/api/campay/webhook/route.ts`
- Create: `supabase/migrations/20261123100000_campay.sql`
- Test: `src/lib/payments.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 2 (`getTransaction`).
- Produces:
  - `type RecordOutcome = "enregistre" | "deja_enregistre" | "ignore_statut" | "facture_introuvable" | "facture_annulee"`
  - `recordCampayPayment(db: SupabaseClient, tx: CampayTransaction, today: string): Promise<RecordOutcome>`
  - Fonction SQL `public.record_provider_payment(p_invoice uuid, p_amount integer, p_method text, p_paid_on date, p_provider text, p_provider_ref text, p_reference text) returns text` (security definer, `revoke all … from public`, `grant execute … to service_role`) : renvoie `'facture_introuvable'`, `'facture_annulee'`, `'deja_enregistre'` (conflit sur `provider_ref`, via `on conflict (provider_ref) do nothing`) ou `'enregistre'`. Elle prend `org_id` sur la facture.

- [ ] **Step 1: Tests qui échouent** pour `recordCampayPayment` avec un `db` factice dont `rpc` renvoie une valeur fixée :
  - `tx.status = "FAILED"` → `"ignore_statut"` et `rpc` jamais appelé ;
  - `tx.externalReference = null` ou non-UUID → `"facture_introuvable"` sans `rpc` ;
  - succès → `rpc("record_provider_payment", { p_invoice: "<uuid>", p_amount: 75000, p_method: "mtn_momo", p_paid_on: "2026-11-23", p_provider: "campay", p_provider_ref: "r1", p_reference: "op1" })` et renvoie ce que renvoie `rpc` ;
  - erreur `rpc` → rejet.
- [ ] **Step 2: Lancer** — échec attendu.
- [ ] **Step 3: Écrire la migration et `recordCampayPayment`.**
- [ ] **Step 4: Écrire la route** `GET` et `POST` (POST : lire aussi un corps JSON ou formulaire s'il y en a, fusionné avec la query string) : `parseWebhookParams` → 400 si `null` ; `verifyHs256Jwt(signature, CAMPAY_WEBHOOK_KEY)` → 401 si `null` ; `getTransaction(reference)` ; `recordCampayPayment(createAdminClient(), tx, todayIso())` ; réponse `200 { outcome }` ; erreur Campay ou base → 500 (Campay réessaiera) avec `console.error`.
- [ ] **Step 5: Vérifier la migration sur PostgreSQL local** (schéma `auth` simulé comme pour l'étape 1) : deux appels avec le même `p_provider_ref` → `enregistre` puis `deja_enregistre`, la facture passe à `payee` ; facture annulée → `facture_annulee`.
- [ ] **Step 6: Tests, typecheck, build** — tout passe.
- [ ] **Step 7: Commit** `feat: webhook Campay et enregistrement idempotent des paiements`

### Task 4: Bouton « Payer » sur la page publique

**Files:**
- Create: `src/app/f/[token]/actions.ts` (action serveur `startPayment`)
- Create: `src/lib/domain/pay.ts`, Test: `src/lib/domain/pay.test.ts`
- Modify: `src/app/f/[token]/page.tsx`
- Modify: `supabase/migrations/20261123100000_campay.sql` (ajouter `id`, `customer_email` au retour de `get_public_invoice` : `drop function` puis `create`)

**Interfaces:**
- Consumes: `createPaymentLink`, `campayConfigured` (Task 2), `remaining`, `displayStatus` (étape 1).
- Produces:
  - `payableAmount(inv: { status: StoredStatus; amount_xaf: number; paid_xaf: number }): number` — 0 si payée ou annulée, sinon le reste.
  - `splitName(full: string): { firstName: string; lastName: string }` — `"Jean Paul Mballa"` → `{ firstName: "Jean", lastName: "Paul Mballa" }` ; un seul mot → `lastName: ""`.
  - `startPayment(token: string): Promise<void>` — relit la facture par jeton (client service), refuse si `payableAmount` = 0 (redirige vers `/f/<jeton>?paiement=deja`), sinon crée le lien (description = `"<numéro> · <libellé>"` tronquée à 100 caractères, `redirectUrl` = `${appUrl()}/f/<jeton>?paiement=retour`) et `redirect(link)`. Sur erreur Campay : `redirect('/f/<jeton>?paiement=erreur')`.

- [ ] **Step 1: Tests qui échouent** pour `payableAmount` (`a_payer` 75000/25000 → 50000 ; `payee` → 0 ; `annulee` → 0) et `splitName`.
- [ ] **Step 2: Lancer** — échec ; **Step 3: Implémenter** ; **Step 4: Relancer** — PASS.
- [ ] **Step 5: Page publique** : si `campayConfigured()` et montant payable > 0, formulaire `action={startPayment.bind(null, token)}` avec le bouton « Payer <montant> par Orange Money ou MTN MoMo ». Messages selon `?paiement=` : `retour` et non payée → « Paiement en cours de confirmation, actualisez dans un instant » ; `retour` et payée → « Merci, paiement reçu » ; `erreur` → « Le service de paiement ne répond pas, réessayez plus tard » ; `deja` → « Cette facture est déjà réglée ».
- [ ] **Step 6: Tests, typecheck, build** ; **Step 7: Commit** `feat: paiement Campay depuis la page de la facture`

### Task 5: Facture acquittée en PDF

**Files:**
- Create: `src/lib/pdf/invoice-pdf.tsx`, `src/app/api/factures/[token]/pdf/route.ts`
- Test: `src/lib/pdf/invoice-pdf.test.tsx`
- Modify: `src/lib/qr.ts` (ajouter `qrPngDataUrl(text: string): Promise<string>` via `QRCode.toDataURL`, marge 1, niveau M)
- Modify: `src/app/f/[token]/page.tsx` et `src/app/app/(espace)/factures/[id]/page.tsx` (lien « Télécharger la facture (PDF) »)

**Interfaces:**
- Consumes: `invoicePublicUrl`, `formatXaf`, `formatDate`, `remaining`.
- Produces:
  - `type InvoicePdfData = { org: { name: string; address: string | null; phone: string | null; email: string | null; tax_id: string | null }; invoice: { number: string; label: string; amount_xaf: number; paid_xaf: number; status: StoredStatus; issued_on: string; due_on: string; paid_at: string | null }; customer: { name: string; phone: string | null }; propertyName: string | null; publicUrl: string; qrDataUrl: string }`
  - `InvoicePdf(props: { data: InvoicePdfData }): JSX.Element`
  - `renderInvoicePdf(data: InvoicePdfData): Promise<Buffer>`

- [ ] **Step 1: Test qui échoue** : `renderInvoicePdf(données payées)` renvoie un `Buffer` qui commence par `%PDF` ; le texte du document (rendre `InvoicePdf` et parcourir l'arbre, ou chercher les chaînes non compressées) contient `ACQUITTÉE` pour une facture payée et ne le contient pas pour une facture à payer.
- [ ] **Step 2: Lancer** — échec ; **Step 3: Implémenter** (Helvetica intégrée, montants via `formatXaf` en remplaçant l'espace fine ` ` par une espace normale car Helvetica ne l'a pas) ; **Step 4: Relancer** — PASS.
- [ ] **Step 5: Route** `GET /api/factures/[token]/pdf` : jeton validé par regex UUID (404 sinon), lecture par le client service, `content-type: application/pdf`, `content-disposition: inline; filename="<numéro>.pdf"`, `cache-control: no-store`.
- [ ] **Step 6: Tests, typecheck, build** ; **Step 7: Commit** `feat: facture acquittée en PDF avec code QR`

### Task 6: Vérification de bout en bout et documentation

**Files:** Modify `README.md` (section Campay : variables, URL du webhook à déclarer dans Campay `https://<domaine>/api/campay/webhook`, numéros de test).

- [ ] **Step 1:** `npm test`, `npm run typecheck`, `npm run build` — tout passe (sortie collée dans la PR).
- [ ] **Step 2:** Test d'intégration `src/app/api/campay/webhook/route.test.ts` : appeler `GET` de la route avec `fetch` Campay et `createAdminClient` simulés (`vi.mock`) et un JWT signé avec `CAMPAY_WEBHOOK_KEY` ; attendus : sans `signature` → 400, signature fausse → 401, transaction `SUCCESSFUL` → 200 `{ outcome: "enregistre" }`, même appel rejoué (rpc renvoie `deja_enregistre`) → 200 `{ outcome: "deja_enregistre" }`.
- [ ] **Step 3:** README ; commit `docs: configuration Campay` ; push ; pull request.
