-- Vérification publique d'une facture par son code QR.
-- Le jeton (uuid aléatoire) n'est connu que de qui détient la facture ; la fonction ne renvoie
-- que les informations imprimées sur la facture, sans téléphone ni e-mail du client.

create or replace function public.get_public_invoice(token uuid)
returns table (
  number text,
  label text,
  amount_xaf integer,
  paid_xaf integer,
  status text,
  issued_on date,
  due_on date,
  paid_at date,
  customer_name text,
  property_name text,
  org_name text,
  org_phone text,
  org_address text
)
language sql stable security definer set search_path = public as $$
  select i.number, i.label, i.amount_xaf, i.paid_xaf, i.status, i.issued_on, i.due_on, i.paid_at,
         c.name, p.name, o.name, o.phone, o.address
  from invoices i
  join customers c on c.id = i.customer_id
  join organizations o on o.id = i.org_id
  left join properties p on p.id = i.property_id
  where i.public_token = token;
$$;

revoke all on function public.get_public_invoice(uuid) from public;
grant execute on function public.get_public_invoice(uuid) to anon, authenticated;
