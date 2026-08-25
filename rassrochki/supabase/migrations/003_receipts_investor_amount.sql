-- Чеки к оплатам + сумма вложений инвестора в сделку

alter table public.loans
  add column if not exists investor_amount numeric(12, 2);

comment on column public.loans.investor_amount is 'Сколько денег вложил инвестор в эту сделку';

alter table public.payments
  add column if not exists receipt_path text;

alter table public.payment_schedules
  add column if not exists receipt_path text;

-- Хранилище чеков (фото/PDF из Сбера и т.п.)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-receipts',
  'payment-receipts',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do nothing;

-- Путь файла: {organization_id}/{loan_id}/...
drop policy if exists "receipts_select_org" on storage.objects;
drop policy if exists "receipts_insert_org" on storage.objects;
drop policy if exists "receipts_update_org" on storage.objects;
drop policy if exists "receipts_delete_org" on storage.objects;

create policy "receipts_select_org"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = public.user_organization_id()::text
  );

create policy "receipts_insert_org"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = public.user_organization_id()::text
  );

create policy "receipts_update_org"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = public.user_organization_id()::text
  );

create policy "receipts_delete_org"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = public.user_organization_id()::text
  );
