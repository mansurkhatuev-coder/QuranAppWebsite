-- Private per-account storage for Waydean videos. Objects are only accessible
-- through an authenticated owner's folder; never expose this bucket publicly.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'waydean-videos',
  'waydean-videos',
  false,
  52428800,
  array['video/mp4', 'video/webm']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Waydean video owner read" on storage.objects;
create policy "Waydean video owner read"
on storage.objects for select to authenticated
using (
  bucket_id = 'waydean-videos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Waydean video owner upload" on storage.objects;
create policy "Waydean video owner upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'waydean-videos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Waydean video owner update" on storage.objects;
create policy "Waydean video owner update"
on storage.objects for update to authenticated
using (
  bucket_id = 'waydean-videos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'waydean-videos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Waydean video owner delete" on storage.objects;
create policy "Waydean video owner delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'waydean-videos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- Restrictive guards are ANDed with every permissive policy, so an existing
-- broad storage policy cannot grant access to another user's video.
drop policy if exists "Waydean video owner read guard" on storage.objects;
create policy "Waydean video owner read guard"
on storage.objects as restrictive for select to public
using (
  bucket_id = 'waydean-videos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Waydean video owner upload guard" on storage.objects;
create policy "Waydean video owner upload guard"
on storage.objects as restrictive for insert to public
with check (
  bucket_id = 'waydean-videos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Waydean video owner update guard" on storage.objects;
create policy "Waydean video owner update guard"
on storage.objects as restrictive for update to public
using (
  bucket_id = 'waydean-videos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'waydean-videos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Waydean video owner delete guard" on storage.objects;
create policy "Waydean video owner delete guard"
on storage.objects as restrictive for delete to public
using (
  bucket_id = 'waydean-videos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
