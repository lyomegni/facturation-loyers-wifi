-- Étape 2 : paiements Campay.

-- Enregistre un paiement reçu d'un prestataire (Campay), une seule fois par référence.
-- Appelée uniquement par le serveur avec la clé service (webhook Campay).
create or replace function public.record_provider_payment(
  p_invoice uuid,
  p_amount integer,
  p_method text,
  p_paid_on date,
  p_provider text,
  p_provider_ref text,
  p_reference text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  inserted integer;
begin
  select id, org_id, status into inv from invoices where id = p_invoice;
  if not found then
    return 'facture_introuvable';
  end if;
  if inv.status = 'annulee' then
    return 'facture_annulee';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Montant invalide : %', p_amount;
  end if;
  insert into payments (org_id, invoice_id, amount_xaf, method, paid_on, reference, provider, provider_ref)
  values (inv.org_id, inv.id, p_amount, p_method, p_paid_on, p_reference, p_provider, p_provider_ref)
  on conflict (provider_ref) do nothing;
  get diagnostics inserted = row_count;
  return case when inserted = 0 then 'deja_enregistre' else 'enregistre' end;
end;
$$;

revoke all on function public.record_provider_payment(uuid, integer, text, date, text, text, text) from public, anon, authenticated;
grant execute on function public.record_provider_payment(uuid, integer, text, date, text, text, text) to service_role;
