alter table public.projects
  add column if not exists cover_photo_id uuid null,
  add column if not exists cover_focal_y smallint null default 35;

alter table public.projects
  drop constraint if exists projects_cover_focal_y_check;

alter table public.projects
  add constraint projects_cover_focal_y_check
  check (cover_focal_y is null or cover_focal_y between 0 and 100);

alter table public.projects
  drop constraint if exists projects_cover_photo_id_fkey;

alter table public.projects
  add constraint projects_cover_photo_id_fkey
  foreign key (cover_photo_id) references public.photos(id) on delete set null;

comment on column public.projects.cover_photo_id is
  'Photo shown as the customer entry hero; null falls back to the first project photo.';

comment on column public.projects.cover_focal_y is
  'Vertical object-position percentage for the customer entry hero (0 top, 100 bottom).';
