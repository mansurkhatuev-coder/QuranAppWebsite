-- Seed demo Academy lessons for every active teacher.
-- Additive: skips if a lesson with the same title already exists for that owner.
-- No DELETE / TRUNCATE.

do $$
declare
  t record;
  lesson_id uuid;
begin
  for t in
    select user_id, display_name
    from public.academy_teachers
    where is_active = true
  loop
    -- 1) Фикх: условия намаза
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Фикх: условия намаза'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Фикх: условия намаза', 'fiqh', 'beginner', 'Короткий live-урок для класса')
      returning id into lesson_id;

      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (
        lesson_id,
        'single_choice',
        'Сколько обязательных фарзов у вуду (омовения) по ханафитскому мазхабу?',
        '{"options":[{"id":"a","label":"2"},{"id":"b","label":"3"},{"id":"c","label":"4"},{"id":"d","label":"5"}],"correct_option_id":"c"}'::jsonb,
        '{"method":"auto","points":1}'::jsonb,
        0
      ),
      (
        lesson_id,
        'true_false',
        'Намаз можно совершать без омовения, если очень спешишь.',
        '{"correct":false}'::jsonb,
        '{"method":"auto","points":1}'::jsonb,
        1
      ),
      (
        lesson_id,
        'short_text',
        'Сколько ракаатов в обязательном утреннем намазе (фаджр)?',
        '{"accepted":["2","два"],"normalize":["trim","lower","yo_to_e"]}'::jsonb,
        '{"method":"auto","points":1}'::jsonb,
        2
      ),
      (
        lesson_id,
        'single_choice',
        'Что из перечисленного нарушает омовение?',
        '{"options":[{"id":"a","label":"Улыбка"},{"id":"b","label":"Выход чего-либо из двух путей"},{"id":"c","label":"Чтение Корана"},{"id":"d","label":"Ходьба"}],"correct_option_id":"b"}'::jsonb,
        '{"method":"auto","points":1}'::jsonb,
        3
      );
    end if;

    -- 2) Акыда: основы веры
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Акыда: основы веры'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Акыда: основы веры', 'aqida', 'beginner', 'Проверка базовых понятий')
      returning id into lesson_id;

      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (
        lesson_id,
        'single_choice',
        'Сколько столпов имана (веры)?',
        '{"options":[{"id":"a","label":"3"},{"id":"b","label":"5"},{"id":"c","label":"6"},{"id":"d","label":"7"}],"correct_option_id":"c"}'::jsonb,
        '{"method":"auto","points":1}'::jsonb,
        0
      ),
      (
        lesson_id,
        'true_false',
        'Вера в предопределение (кадар) — один из столпов имана.',
        '{"correct":true}'::jsonb,
        '{"method":"auto","points":1}'::jsonb,
        1
      ),
      (
        lesson_id,
        'short_text',
        'Как называется свидетельство веры одним словом (шахада — кратко: «нет бога кроме…»)? Напишите ключевое имя.',
        '{"accepted":["Аллах","аллах"],"normalize":["trim","lower","yo_to_e"]}'::jsonb,
        '{"method":"auto","points":1}'::jsonb,
        2
      ),
      (
        lesson_id,
        'single_choice',
        'Кто последний пророк?',
        '{"options":[{"id":"a","label":"Муса (мир ему)"},{"id":"b","label":"Иса (мир ему)"},{"id":"c","label":"Мухаммад ﷺ"},{"id":"d","label":"Ибрахим (мир ему)"}],"correct_option_id":"c"}'::jsonb,
        '{"method":"auto","points":1}'::jsonb,
        3
      );
    end if;

    -- 3) Коран: короткая проверка
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Коран: короткая проверка'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Коран: короткая проверка', 'quran', 'beginner', 'Несколько простых вопросов')
      returning id into lesson_id;

      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (
        lesson_id,
        'single_choice',
        'Как называется первая сура Корана?',
        '{"options":[{"id":"a","label":"Аль-Бакара"},{"id":"b","label":"Аль-Фатиха"},{"id":"c","label":"Аль-Ихляс"},{"id":"d","label":"Ан-Нас"}],"correct_option_id":"b"}'::jsonb,
        '{"method":"auto","points":1}'::jsonb,
        0
      ),
      (
        lesson_id,
        'true_false',
        'Сура «Аль-Ихляс» говорит о единобожии.',
        '{"correct":true}'::jsonb,
        '{"method":"auto","points":1}'::jsonb,
        1
      ),
      (
        lesson_id,
        'short_text',
        'Сколько аятов в суре Аль-Фатиха? (число)',
        '{"accepted":["7","семь"],"normalize":["trim","lower","yo_to_e"]}'::jsonb,
        '{"method":"auto","points":1}'::jsonb,
        2
      ),
      (
        lesson_id,
        'single_choice',
        'На каком языке ниспослан Коран?',
        '{"options":[{"id":"a","label":"Персидский"},{"id":"b","label":"Турецкий"},{"id":"c","label":"Арабский"},{"id":"d","label":"Урду"}],"correct_option_id":"c"}'::jsonb,
        '{"method":"auto","points":1}'::jsonb,
        3
      );
    end if;
  end loop;
end $$;
