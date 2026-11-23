-- Étape 3 : envois WhatsApp (facture, rappels, reçu) et leur journal.

alter table public.organizations add column whatsapp_enabled boolean not null default false;
alter table public.customers add column whatsapp_opt_out boolean not null default false;

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  invoice_id uuid not null,
  kind text not null check (kind in ('facture', 'rappel_j-3', 'rappel_j', 'rappel_j+3', 'rappel_j+7', 'recu', 'renvoi')),
  phone text not null,
  template text not null,
  wamid text unique,
  status text not null default 'en_cours'
    check (status in ('en_cours', 'envoye', 'remis', 'lu', 'echec', 'incertain', 'non_remis')),
  error text,
  attempts integer not null default 1,
  -- Dernière tentative d'envoi (les statuts de remise ne la changent pas)
  attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (invoice_id, org_id) references public.invoices (id, org_id) on delete cascade
);
-- Un seul message par facture et par type, sauf les renvois manuels.
create unique index whatsapp_messages_once on public.whatsapp_messages (invoice_id, kind) where kind <> 'renvoi';
create index on public.whatsapp_messages (invoice_id);
create index on public.whatsapp_messages (status, updated_at);

alter table public.whatsapp_messages enable row level security;
create policy "lecture membres" on public.whatsapp_messages for select using (public.is_member(org_id));
-- Aucune écriture pour les utilisateurs : seul le serveur (clé service) écrit.

-- Réserve un envoi avant d'appeler Meta. Renvoie l'id de la ligne, ou null si rien n'est réservé
-- (déjà envoyé, en cours, incertain, ou 3 refus). Un refus explicite (« echec ») est repris.
create or replace function public.whatsapp_reserve(p_invoice uuid, p_kind text, p_phone text, p_template text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_id uuid;
begin
  select org_id into v_org from invoices where id = p_invoice;
  if not found then
    return null;
  end if;
  if p_kind = 'renvoi' then
    insert into whatsapp_messages (org_id, invoice_id, kind, phone, template)
    values (v_org, p_invoice, p_kind, p_phone, p_template)
    returning id into v_id;
    return v_id;
  end if;
  insert into whatsapp_messages (org_id, invoice_id, kind, phone, template)
  values (v_org, p_invoice, p_kind, p_phone, p_template)
  on conflict (invoice_id, kind) where kind <> 'renvoi' do update set
    status = 'en_cours',
    attempts = whatsapp_messages.attempts + 1,
    phone = excluded.phone,
    template = excluded.template,
    error = null,
    attempted_at = now(),
    updated_at = now()
  where whatsapp_messages.status = 'echec' and whatsapp_messages.attempts < 3
  returning id into v_id;
  return v_id;
end;
$$;

-- Applique un statut de remise reçu de Meta ; un statut ne recule jamais.
create or replace function public.whatsapp_apply_status(p_wamid text, p_status text, p_error text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update whatsapp_messages set
    status = p_status,
    error = case when p_status = 'non_remis' then p_error else error end,
    updated_at = now()
  where wamid = p_wamid
    and (
      (p_status = 'non_remis' and status in ('en_cours', 'envoye'))
      or (p_status <> 'non_remis'
          and status in ('en_cours', 'envoye', 'remis')
          and (case p_status when 'envoye' then 1 when 'remis' then 2 when 'lu' then 3 else 0 end)
            > (case status when 'en_cours' then 0 when 'envoye' then 1 when 'remis' then 2 else 3 end))
    );
end;
$$;

-- Un envoi resté « en cours » plus d'une heure (processus interrompu) devient « incertain ».
create or replace function public.whatsapp_expire_stale()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  update whatsapp_messages set status = 'incertain', error = 'Envoi interrompu', updated_at = now()
  where status = 'en_cours' and updated_at < now() - interval '1 hour';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.whatsapp_reserve(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.whatsapp_apply_status(text, text, text) from public, anon, authenticated;
revoke all on function public.whatsapp_expire_stale() from public, anon, authenticated;
grant execute on function public.whatsapp_reserve(uuid, text, text, text) to service_role;
grant execute on function public.whatsapp_apply_status(text, text, text) to service_role;
grant execute on function public.whatsapp_expire_stale() to service_role;
