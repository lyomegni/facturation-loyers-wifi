-- Facturation loyers et Wi-Fi : schéma initial (multi-espaces, cloisonné par RLS)
-- Montants en francs CFA (XAF), entiers, sans centimes.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Espaces (organisations) et membres
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  -- Coordonnées imprimées sur les factures
  address text,
  phone text,
  email text,
  tax_id text,
  invoice_prefix text not null default 'FAC' check (invoice_prefix ~ '^[A-Z0-9]{1,8}$'),
  -- Nombre de jours avant l'échéance où la facture du mois est émise
  invoice_lead_days integer not null default 7 check (invoice_lead_days between 0 and 28),
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  email text not null,
  role text not null default 'gestionnaire' check (role in ('admin', 'gestionnaire', 'lecteur')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on public.memberships (user_id);

create or replace function public.is_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.org_id = org and m.user_id = auth.uid());
$$;

create or replace function public.has_role(org uuid, roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.org_id = org and m.user_id = auth.uid() and m.role = any (roles)
  );
$$;

create or replace function public.create_organization(org_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  user_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
  select email into user_email from auth.users where id = auth.uid();
  insert into organizations (name) values (org_name) returning id into new_id;
  insert into memberships (org_id, user_id, email, role) values (new_id, auth.uid(), user_email, 'admin');
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Biens : immeubles et zones Wi-Fi
-- ---------------------------------------------------------------------------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  kind text not null check (kind in ('immeuble', 'zone_wifi', 'autre')),
  name text not null check (length(trim(name)) > 0),
  address text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, name)
);

-- ---------------------------------------------------------------------------
-- Clients (locataires, abonnés Wi-Fi)
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  name text not null check (length(trim(name)) > 0),
  -- Numéro WhatsApp au format international : +2376XXXXXXXX
  phone text check (phone is null or phone ~ '^\+[0-9]{8,15}$'),
  email text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, org_id)
);
create index on public.customers (org_id);
create unique index customers_phone_unique on public.customers (org_id, phone) where phone is not null;

-- ---------------------------------------------------------------------------
-- Contrats : ce que le client paie chaque mois
-- ---------------------------------------------------------------------------
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  customer_id uuid not null,
  property_id uuid not null,
  service text not null check (service in ('loyer', 'wifi', 'autre')),
  label text not null check (length(trim(label)) > 0),
  -- Appartement, porte, boutique, point d'accès…
  unit text,
  amount_xaf integer not null check (amount_xaf > 0),
  due_day integer not null default 5 check (due_day between 1 and 28),
  start_on date not null,
  end_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (customer_id, org_id) references public.customers (id, org_id) on delete cascade,
  foreign key (property_id, org_id) references public.properties (id, org_id) on delete restrict,
  check (end_on is null or end_on >= start_on)
);
create index on public.contracts (org_id, active);
create index on public.contracts (customer_id);

-- ---------------------------------------------------------------------------
-- Factures
-- ---------------------------------------------------------------------------
create table public.invoice_counters (
  org_id uuid not null references public.organizations on delete cascade,
  year integer not null,
  last_number integer not null default 0,
  primary key (org_id, year)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  number text,
  contract_id uuid,
  customer_id uuid not null,
  property_id uuid,
  -- Premier jour du mois facturé
  period date not null check (extract(day from period) = 1),
  label text not null,
  amount_xaf integer not null check (amount_xaf > 0),
  issued_on date not null default current_date,
  due_on date not null,
  status text not null default 'a_payer' check (status in ('a_payer', 'payee', 'annulee')),
  paid_xaf integer not null default 0,
  paid_at date,
  -- Jeton du lien public de la facture (paiement en ligne à l'étape 2)
  public_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  unique (org_id, number),
  unique (contract_id, period),
  unique (id, org_id),
  foreign key (contract_id, org_id) references public.contracts (id, org_id) on delete set null (contract_id),
  foreign key (customer_id, org_id) references public.customers (id, org_id) on delete cascade,
  foreign key (property_id, org_id) references public.properties (id, org_id) on delete set null (property_id)
);
create index on public.invoices (org_id, status, due_on);
create index on public.invoices (customer_id);

-- Numérotation continue par espace et par année : FAC-2026-0001
create or replace function public.assign_invoice_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n integer;
  prefix text;
  y integer := extract(year from new.issued_on)::integer;
begin
  if new.number is not null then
    return new;
  end if;
  insert into invoice_counters (org_id, year, last_number) values (new.org_id, y, 1)
  on conflict (org_id, year) do update set last_number = invoice_counters.last_number + 1
  returning last_number into n;
  select invoice_prefix into prefix from organizations where id = new.org_id;
  new.number := coalesce(prefix, 'FAC') || '-' || y || '-' || lpad(n::text, 4, '0');
  return new;
end;
$$;

create trigger invoices_number
  before insert on public.invoices
  for each row execute function public.assign_invoice_number();

-- ---------------------------------------------------------------------------
-- Paiements (saisis à la main ou reçus d'un opérateur Mobile Money)
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  invoice_id uuid not null,
  amount_xaf integer not null check (amount_xaf > 0),
  method text not null check (method in ('especes', 'orange_money', 'mtn_momo', 'virement', 'autre')),
  paid_on date not null default current_date,
  reference text,
  -- Rempli par l'intégration de paiement (étape 2)
  provider text,
  provider_ref text unique,
  recorded_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  foreign key (invoice_id, org_id) references public.invoices (id, org_id) on delete cascade
);
create index on public.payments (invoice_id);

-- Met à jour le montant encaissé et le statut de la facture.
create or replace function public.refresh_invoice_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv uuid := coalesce(new.invoice_id, old.invoice_id);
  total integer;
  last_paid date;
begin
  select coalesce(sum(amount_xaf), 0), max(paid_on) into total, last_paid from payments where invoice_id = inv;
  update invoices set
    paid_xaf = total,
    status = case
      when status = 'annulee' then 'annulee'
      when total >= amount_xaf then 'payee'
      else 'a_payer' end,
    paid_at = case when total >= amount_xaf then last_paid else null end
  where id = inv;
  return null;
end;
$$;

create trigger payments_refresh
  after insert or update or delete on public.payments
  for each row execute function public.refresh_invoice_paid();

-- ---------------------------------------------------------------------------
-- Sécurité : chaque espace ne voit que ses données
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invoice_counters enable row level security;

create policy "membres lisent leur espace" on public.organizations
  for select using (public.is_member(id));
create policy "admins modifient leur espace" on public.organizations
  for update using (public.has_role(id, array['admin'])) with check (public.has_role(id, array['admin']));

create policy "membres voient l'équipe" on public.memberships
  for select using (public.is_member(org_id));
create policy "admins gèrent l'équipe" on public.memberships
  for all using (public.has_role(org_id, array['admin'])) with check (public.has_role(org_id, array['admin']));

-- invoice_counters : uniquement via le déclencheur (aucune policy).

do $$
declare t text;
begin
  foreach t in array array['properties', 'customers', 'contracts', 'invoices', 'payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "lecture membres" on public.%I for select using (public.is_member(org_id))', t);
    execute format('create policy "ajout gestion" on public.%I for insert with check (public.has_role(org_id, array[''admin'',''gestionnaire'']))', t);
    execute format('create policy "modification gestion" on public.%I for update using (public.has_role(org_id, array[''admin'',''gestionnaire''])) with check (public.has_role(org_id, array[''admin'',''gestionnaire'']))', t);
    execute format('create policy "suppression admin" on public.%I for delete using (public.has_role(org_id, array[''admin'']))', t);
  end loop;
end $$;
