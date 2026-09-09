-- Seed Academy lessons from QuranApp course banks (standalone filter).
-- Sources: knowledge / tuhfat / tajweed-beginner / madina / names99.
-- Additive: skips if lesson with same title already exists for owner.
-- No DELETE / TRUNCATE.

do $$
declare
  t record;
  lesson_id uuid;
begin
  for t in
    select user_id from public.academy_teachers where is_active = true
  loop
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Знания: исламская викторина'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Знания: исламская викторина', 'other', 'beginner', 'Самостоятельные вопросы из раздела «Знания» приложения')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'В каком народе впервые появилось многобожие?', '{"options":[{"id":"adam","label":"В народе Адама (мир ему)"},{"id":"nuh","label":"В народе Нуха (мир ему)"},{"id":"ibrahim","label":"В народе Ибрахима (мир ему)"},{"id":"musa","label":"В народе Мусы (мир ему)"}],"correct_option_id":"nuh"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Как называется дерево, которое растёт в Аду со дна и станет пищей для грешников?', '{"options":[{"id":"tuba","label":"Туба"},{"id":"bakhur","label":"Бахур"},{"id":"sakura","label":"Сакура"},{"id":"zaqqum","label":"Заккум"}],"correct_option_id":"zaqqum"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Где впервые был ниспослан Коран?', '{"options":[{"id":"hira","label":"В пещере Хира"},{"id":"safa","label":"На холме Ас-Сафа"},{"id":"thawr","label":"В пещере Савр"},{"id":"arafat","label":"На вершине горы Арафат"}],"correct_option_id":"hira"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Кто из четырёх великих имамов был табиином?', '{"options":[{"id":"abuHanifa","label":"Абу-Ханифа"},{"id":"shafii","label":"Имам Шафии"},{"id":"ahmad","label":"Имам Ахмад"},{"id":"malik","label":"Имам Малик"}],"correct_option_id":"abuHanifa"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'В какой суре содержится аят аль-Курси?', '{"options":[{"id":"imran","label":"Аль-Имран"},{"id":"maida","label":"Аль-Маида"},{"id":"baqara","label":"Аль-Бакара"},{"id":"anfal","label":"Аль-Анфаль"}],"correct_option_id":"baqara"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Имя какого пророка упоминается в Коране чаще других?', '{"options":[{"id":"ibrahim","label":"Ибрахим (мир ему)"},{"id":"musa","label":"Муса (мир ему)"},{"id":"isa","label":"Иса (мир ему)"},{"id":"muhammad","label":"Мухаммад (мир ему)"}],"correct_option_id":"musa"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Кто из пророков имел способность толковать сны?', '{"options":[{"id":"ibrahim","label":"Ибрахим (мир ему)"},{"id":"yusuf","label":"Юсуф (мир ему)"},{"id":"isa","label":"Иса (мир ему)"},{"id":"nuh","label":"Нух (мир ему)"}],"correct_option_id":"yusuf"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'За какой период был ниспослан Коран?', '{"options":[{"id":"y23","label":"За 23 года"},{"id":"y20","label":"За 20 лет"},{"id":"y33","label":"За 33 года"}],"correct_option_id":"y23"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'В каком году родился пророк Мухаммад (мир ему и благословение Аллаха)?', '{"options":[{"id":"y469","label":"В 469 году н.э."},{"id":"y574","label":"В 574 году н.э."},{"id":"y571","label":"В 571 году н.э."}],"correct_option_id":"y571"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', 'Столпы ислама — это свидетельство веры, намаз, закят, пост и …?', '{"options":[{"id":"angels","label":"Вера в ангелов"},{"id":"hajj","label":"Хадж"},{"id":"sadaqa","label":"Садака"}],"correct_option_id":"hajj"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9),
      (lesson_id, 'single_choice', 'Какой ангел протрубит в рог в Судный день?', '{"options":[{"id":"israfil","label":"Исрафил"},{"id":"jibril","label":"Джабраил"},{"id":"mikail","label":"Микаил"}],"correct_option_id":"israfil"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 10),
      (lesson_id, 'single_choice', 'В каком году пост стал обязателен для мусульман?', '{"options":[{"id":"y2ah","label":"Во втором году хиджры"},{"id":"beforeDeath","label":"За год до кончины Пророка (мир ему)"},{"id":"y7ah","label":"В седьмом году хиджры"}],"correct_option_id":"y2ah"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 11),
      (lesson_id, 'single_choice', 'Чей народ уверовал полностью?', '{"options":[{"id":"yunus","label":"Юнуса (мир ему)"},{"id":"nuh","label":"Нуха (мир ему)"},{"id":"lut","label":"Лута (мир ему)"},{"id":"musa","label":"Мусы (мир ему)"}],"correct_option_id":"yunus"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 12),
      (lesson_id, 'single_choice', 'Какой пророк покинул город, не дождавшись приказа Аллаха?', '{"options":[{"id":"yunus","label":"Юнус (мир ему)"},{"id":"lut","label":"Лут (мир ему)"},{"id":"musa","label":"Муса (мир ему)"},{"id":"nuh","label":"Нух (мир ему)"}],"correct_option_id":"yunus"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 13),
      (lesson_id, 'single_choice', 'За сколько дней Аллах создал небеса и землю?', '{"options":[{"id":"d5","label":"5 дней"},{"id":"d10","label":"10 дней"},{"id":"d6","label":"6 дней"},{"id":"d1000","label":"1000 лет"}],"correct_option_id":"d6"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 14),
      (lesson_id, 'single_choice', 'Сколько джузов в Коране?', '{"options":[{"id":"n20","label":"20"},{"id":"n30","label":"30"},{"id":"n40","label":"40"},{"id":"n114","label":"114"}],"correct_option_id":"n30"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 15),
      (lesson_id, 'single_choice', 'Сколько сур в Коране?', '{"options":[{"id":"n100","label":"100"},{"id":"n114","label":"114"},{"id":"n120","label":"120"},{"id":"n99","label":"99"}],"correct_option_id":"n114"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 16),
      (lesson_id, 'single_choice', 'Сколько аятов в Коране?', '{"options":[{"id":"n6000","label":"6000"},{"id":"n6236","label":"6236"},{"id":"n6666","label":"6666"},{"id":"n7000","label":"7000"}],"correct_option_id":"n6236"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 17),
      (lesson_id, 'single_choice', 'В Коране неоднократно сказано об определённом Дне. Что это за день?', '{"options":[{"id":"friday","label":"Пятница"},{"id":"judgment","label":"Судный день"},{"id":"ashura","label":"Ашура"},{"id":"eid","label":"Праздник"}],"correct_option_id":"judgment"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 18),
      (lesson_id, 'single_choice', 'Какую суру называют «сердцем Корана»?', '{"options":[{"id":"fatiha","label":"Аль-Фатиха"},{"id":"yasin","label":"Ясин"},{"id":"mulk","label":"Аль-Мульк"},{"id":"ikhlas","label":"Аль-Ихлас"}],"correct_option_id":"yasin"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 19),
      (lesson_id, 'single_choice', 'Какая битва была после битвы при Ухуде?', '{"options":[{"id":"badr","label":"Бадр"},{"id":"khandaq","label":"Хандак (битва у рва)"},{"id":"hunayn","label":"Хунейн"},{"id":"tabuk","label":"Табук"}],"correct_option_id":"khandaq"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 20);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Таджвид (Тухфа) · модуль 1'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Таджвид (Тухфа) · модуль 1', 'quran', 'beginner', 'Самостоятельные вопросы Тухфат аль-Атфаль из приложения')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Первая буква алфавита —', '{"options":[{"id":"a","label":"Алиф (أ)"},{"id":"b","label":"Ба (ب)"},{"id":"c","label":"Йа (ي)"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Буква горла из группы 5 —', '{"options":[{"id":"a","label":"Iайн (ع)"},{"id":"b","label":"Ба (ب)"},{"id":"c","label":"Каф (ك)"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Естественный мадд — сколько счётов?', '{"options":[{"id":"a","label":"Два счёта (хараката)"},{"id":"b","label":"Пять счётов"},{"id":"c","label":"Один счёт"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'На вакфе в этом аяте — арид мадд допускает сколько счётов?', '{"options":[{"id":"a","label":"2, 4 или 6 счётов"},{"id":"b","label":"Шесть счётов"},{"id":"c","label":"4–5 счётов"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Мадд табиъи —', '{"options":[{"id":"a","label":"Два счёта (хараката)"},{"id":"b","label":"Шесть счётов"},{"id":"c","label":"4–5 счётов"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Мнемоника букв калькаля —', '{"options":[{"id":"a","label":"قطبجد"},{"id":"b","label":"ينمو"},{"id":"c","label":"Шесть букв горла"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'true_false', 'Верно ли: удлинение ه касается только ه-местоимения на конце слова, а не любой хIа?', '{"correct":true}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Три основные огласовки —', '{"options":[{"id":"a","label":"Фатха، касра، дамма"},{"id":"b","label":"Сукун، ташдид، танвин"},{"id":"c","label":"Только мадд"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Таджвид (Тухфа) · модуль 2'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Таджвид (Тухфа) · модуль 2', 'quran', 'beginner', 'Самостоятельные вопросы Тухфат аль-Атфаль из приложения')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Сколько видов танвина в матне?', '{"options":[{"id":"a","label":"Три"},{"id":"b","label":"Четыре"},{"id":"c","label":"Две"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Какой риваят в курсе?', '{"options":[{"id":"a","label":"Хафс ‘ан ‘Асим"},{"id":"b","label":"Варш"},{"id":"c","label":"Калун"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Автор «تحفة الأطفال» —', '{"options":[{"id":"a","label":"Сулейман аль-Джамзури"},{"id":"b","label":"Ибн Касир"},{"id":"c","label":"Ибн аль-Джазари"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'С чего начать урок?', '{"options":[{"id":"a","label":"Сначала прочитать теорию"},{"id":"b","label":"Сразу к тесту"},{"id":"c","label":"Только вызубрить поэму"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Сколько основных правил в бабе нуна?', '{"options":[{"id":"a","label":"Четыре"},{"id":"b","label":"Три"},{"id":"c","label":"Шесть"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', '«مِنْ عِلْمٍ» — какое правило?', '{"options":[{"id":"a","label":"Изхар"},{"id":"b","label":"Идгам"},{"id":"c","label":"Ихфа"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', '«عَن نَّفْسٍ» — какое правило?', '{"options":[{"id":"a","label":"Идгам с гунной"},{"id":"b","label":"Изхар"},{"id":"c","label":"Икляб"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'true_false', 'Верно ли: правила нун сукун относятся и к танвину?', '{"correct":true}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Таджвид (Тухфа) · модуль 3'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Таджвид (Тухфа) · модуль 3', 'quran', 'beginner', 'Самостоятельные вопросы Тухфат аль-Атфаль из приложения')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', '«مِنْ قَوْمٍ» — какое правило?', '{"options":[{"id":"a","label":"Ихфа"},{"id":"b","label":"Изхар"},{"id":"c","label":"Икляб"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Какое правило в «أَنْعَمْتَ»?', '{"options":[{"id":"a","label":"Изхар"},{"id":"b","label":"Икляб"},{"id":"c","label":"Идгам"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Какая из букв — буква изхара (нун сукун)?', '{"options":[{"id":"a","label":"Iайн (ع)"},{"id":"b","label":"Ба (ب)"},{"id":"c","label":"Каф (ك)"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Сколько букв идгама с гунной?', '{"options":[{"id":"a","label":"Четыре"},{"id":"b","label":"Две"},{"id":"c","label":"Шесть"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Какое правило в «مَن يَقُولُ»?', '{"options":[{"id":"a","label":"Идгам с гунной"},{"id":"b","label":"Изхар"},{"id":"c","label":"Икляб"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Сколько букв ихфа?', '{"options":[{"id":"a","label":"Пятнадцать"},{"id":"b","label":"Шесть"},{"id":"c","label":"Четыре"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Какое правило в «مِنْ كَذَا» (перед ك — каф)?', '{"options":[{"id":"a","label":"Ихфа"},{"id":"b","label":"Икляб"},{"id":"c","label":"Идгам с гунной"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'true_false', 'Верно ли: правила ихфа/идгам/изхар шафави относятся к миму сукун?', '{"correct":true}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Таджвид (Тухфа) · модуль 4'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Таджвид (Тухфа) · модуль 4', 'quran', 'beginner', 'Самостоятельные вопросы Тухфат аль-Атфаль из приложения')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', '«أَمْثَالُهُمْ» — какое правило?', '{"options":[{"id":"a","label":"Изхар шафави"},{"id":"b","label":"Идгам"},{"id":"c","label":"Икляб"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Сколько счётов длится гунна?', '{"options":[{"id":"a","label":"Два счёта (хараката)"},{"id":"b","label":"Три счёта"},{"id":"c","label":"Пять счётов"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'true_false', 'Верно ли: гунна бывает и на нуне, и на миме с ташдидом?', '{"correct":true}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Таджвид (Муаллим) · модуль 1'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Таджвид (Муаллим) · модуль 1', 'quran', 'beginner', 'Самостоятельные вопросы курса Муаллим из приложения')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'В какую сторону читается арабский текст?', '{"options":[{"id":"rtl","label":"Справа налево"},{"id":"ltr","label":"Слева направо"}],"correct_option_id":"rtl"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'В каком порядке обычно идёт урок?', '{"options":[{"id":"studyThenPractice","label":"Сначала теория, потом практика"},{"id":"skipTheory","label":"Сразу только тест"},{"id":"random","label":"В случайном порядке"}],"correct_option_id":"studyThenPractice"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Как называется буква د?', '{"options":[{"id":"correct","label":"Даль"},{"id":"d1","label":"Заль"},{"id":"d2","label":"Ро"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Как называется буква ذ?', '{"options":[{"id":"correct","label":"Заль"},{"id":"d1","label":"Даль"},{"id":"d2","label":"За"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Как называется буква ر?', '{"options":[{"id":"correct","label":"Ро"},{"id":"d1","label":"За"},{"id":"d2","label":"Даль"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Как называется буква ز?', '{"options":[{"id":"correct","label":"За"},{"id":"d1","label":"Ро"},{"id":"d2","label":"Син"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Как называется буква س?', '{"options":[{"id":"correct","label":"Син"},{"id":"d1","label":"Шин"},{"id":"d2","label":"СӀод"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Как называется буква ش?', '{"options":[{"id":"correct","label":"Шин"},{"id":"d1","label":"Син"},{"id":"d2","label":"СӀод"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Таджвид (Муаллим) · модуль 2'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Таджвид (Муаллим) · модуль 2', 'quran', 'beginner', 'Самостоятельные вопросы курса Муаллим из приложения')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Как называется буква ص?', '{"options":[{"id":"correct","label":"СӀод"},{"id":"d1","label":"Син"},{"id":"d2","label":"ДӀод"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Как называется буква ض?', '{"options":[{"id":"correct","label":"ДӀод"},{"id":"d1","label":"СӀод"},{"id":"d2","label":"ТIо (твёрдая)"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Как называется буква ط?', '{"options":[{"id":"correct","label":"ТIо (твёрдая)"},{"id":"d1","label":"Та"},{"id":"d2","label":"ЗIо (твёрдая)"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Как называется буква ظ?', '{"options":[{"id":"correct","label":"ЗIо (твёрдая)"},{"id":"d1","label":"Заль"},{"id":"d2","label":"ТIо (твёрдая)"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Сколько коротких огласовок (харакат) в арабском письме?', '{"options":[{"id":"two","label":"Две"},{"id":"three","label":"Три"},{"id":"four","label":"Четыре"}],"correct_option_id":"three"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Какая огласовка на букве?', '{"options":[{"id":"fatha","label":"Фатха (звук «а»)"},{"id":"kasra","label":"Касра (звук «и»)"},{"id":"damma","label":"Дамма (звук «у»)"}],"correct_option_id":"fatha"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Как называется буква ع?', '{"options":[{"id":"correct","label":"Iайн"},{"id":"d1","label":"ГIойн"},{"id":"d2","label":"Хьа"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Как называется буква غ?', '{"options":[{"id":"correct","label":"ГIойн"},{"id":"d1","label":"Iайн"},{"id":"d2","label":"Хо"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Таджвид (Муаллим) · модуль 3'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Таджвид (Муаллим) · модуль 3', 'quran', 'beginner', 'Самостоятельные вопросы курса Муаллим из приложения')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Как называется буква ف?', '{"options":[{"id":"correct","label":"Фа"},{"id":"d1","label":"Къаф"},{"id":"d2","label":"Ба"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Как называется буква ق?', '{"options":[{"id":"correct","label":"Къаф"},{"id":"d1","label":"Фа"},{"id":"d2","label":"Каф"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Как называется буква ك?', '{"options":[{"id":"correct","label":"Каф"},{"id":"d1","label":"Къаф"},{"id":"d2","label":"Лям"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Как называется буква ل?', '{"options":[{"id":"correct","label":"Лям"},{"id":"d1","label":"Каф"},{"id":"d2","label":"Мим"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Как называется буква م?', '{"options":[{"id":"correct","label":"Мим"},{"id":"d1","label":"Нун"},{"id":"d2","label":"Ба"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Как называется буква ن?', '{"options":[{"id":"correct","label":"Нун"},{"id":"d1","label":"Мим"},{"id":"d2","label":"Ба"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Как называется буква ه?', '{"options":[{"id":"correct","label":"ХIа (конечная)"},{"id":"d1","label":"Хьа"},{"id":"d2","label":"Мим"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Как называется буква و?', '{"options":[{"id":"correct","label":"Вов"},{"id":"d1","label":"Йа"},{"id":"d2","label":"ХIа (конечная)"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Таджвид (Муаллим) · модуль 4'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Таджвид (Муаллим) · модуль 4', 'quran', 'beginner', 'Самостоятельные вопросы курса Муаллим из приложения')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Сколько букв в арабском алфавите?', '{"options":[{"id":"correct","label":"28"},{"id":"d1","label":"26"},{"id":"d2","label":"30"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Какая буква первая в алфавите?', '{"options":[{"id":"correct","label":"Алиф"},{"id":"d1","label":"Ба"},{"id":"d2","label":"Йа"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Как называется буква ا?', '{"options":[{"id":"correct","label":"Алиф"},{"id":"d1","label":"Ба"},{"id":"d2","label":"Та"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Как называется буква ي?', '{"options":[{"id":"correct","label":"Йа"},{"id":"d1","label":"Вов"},{"id":"d2","label":"Ба"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Сколько букв мадда в арабском?', '{"options":[{"id":"two","label":"Две"},{"id":"three","label":"Три"},{"id":"four","label":"Четыре"}],"correct_option_id":"three"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Выберите все буквы мадда', '{"options":[{"id":"alif","label":"ا"},{"id":"waw","label":"و"},{"id":"ya","label":"ي"},{"id":"ba","label":"ب"},{"id":"ta","label":"ت"},{"id":"sin","label":"س"},{"id":"mim","label":"م"},{"id":"lam","label":"ل"},{"id":"ha","label":"ه"},{"id":"ra","label":"ر"}],"correct_option_id":"alif"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Это короткий звук или мадд?', '{"options":[{"id":"short","label":"Короткий звук"},{"id":"madd","label":"Мадд (долгий)"}],"correct_option_id":"madd"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'В «عَالِي» мадд на каких буквах? (выберите оба)', '{"options":[{"id":"alif","label":"Алиф (тянет «а»)"},{"id":"waw","label":"Вав (тянет «у»)"},{"id":"ya","label":"Йа (тянет «и»)"}],"correct_option_id":"alif"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Таджвид (Муаллим) · модуль 5'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Таджвид (Муаллим) · модуль 5', 'quran', 'beginner', 'Самостоятельные вопросы курса Муаллим из приложения')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Как правильно развернуть «رَبَّ»?', '{"options":[{"id":"expanded","label":"رَبْبَ"},{"id":"plain","label":"رَبَ"},{"id":"tanwin","label":"رَبًا"}],"correct_option_id":"expanded"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Сколько видов танвина?', '{"options":[{"id":"two","label":"Два"},{"id":"three","label":"Три"},{"id":"four","label":"Четыре"}],"correct_option_id":"three"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Какая буква не соединяется слева?', '{"options":[{"id":"ra","label":"Ро"},{"id":"ba","label":"Ба"},{"id":"lam","label":"Лям"}],"correct_option_id":"ra"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Какая буква соединяется с следующей?', '{"options":[{"id":"ba","label":"Ба"},{"id":"dal","label":"Даль"},{"id":"waw","label":"Вов"}],"correct_option_id":"ba"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Какой знак в конце «كِتَابٌ»?', '{"options":[{"id":"tanwin","label":"Танвин"},{"id":"sukun","label":"Сукун"},{"id":"shadda","label":"Ташдид"}],"correct_option_id":"tanwin"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Сколько видов окончаний при паузе?', '{"options":[{"id":"three","label":"Три"},{"id":"two","label":"Два"},{"id":"four","label":"Четыре"}],"correct_option_id":"three"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Как называется буква ب?', '{"options":[{"id":"correct","label":"Ба"},{"id":"d1","label":"Та"},{"id":"d2","label":"Са"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Какая буква из семи букв истиъля (твёрдых)?', '{"options":[{"id":"sad","label":"СӀод"},{"id":"sin","label":"Син"},{"id":"lam","label":"Лям"}],"correct_option_id":"sad"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Таджвид (Муаллим) · модуль 6'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Таджвид (Муаллим) · модуль 6', 'quran', 'beginner', 'Самостоятельные вопросы курса Муаллим из приложения')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Выберите буквы истиъля (твёрдые)', '{"options":[{"id":"kha","label":"Хо"},{"id":"sad","label":"СӀод"},{"id":"sin","label":"Син"},{"id":"qaf","label":"Къаф"},{"id":"ba","label":"Ба"}],"correct_option_id":"kha"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Как называется буква ت?', '{"options":[{"id":"correct","label":"Та"},{"id":"d1","label":"Ба"},{"id":"d2","label":"Са"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Как называется буква ث?', '{"options":[{"id":"correct","label":"Са"},{"id":"d1","label":"Та"},{"id":"d2","label":"Ба"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Как называется буква ج?', '{"options":[{"id":"correct","label":"Джим"},{"id":"d1","label":"Хьа"},{"id":"d2","label":"Хо"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Как называется буква ح?', '{"options":[{"id":"correct","label":"Хьа"},{"id":"d1","label":"ХIа (конечная)"},{"id":"d2","label":"Хо"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Как называется буква خ?', '{"options":[{"id":"correct","label":"Хо"},{"id":"d1","label":"Хьа"},{"id":"d2","label":"Джим"}],"correct_option_id":"correct"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 1'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 1', 'arabic', 'beginner', 'Самостоятельные вопросы урока 1 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Что значит هَٰذَا بَيْتٌ?', '{"options":[{"id":"a","label":"Это дом."},{"id":"b","label":"Где дом?"},{"id":"c","label":"Это мечеть."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Что значит это слово? — هَٰذَا', '{"options":[{"id":"a","label":"это / этот"},{"id":"c","label":"что?"},{"id":"b","label":"да"},{"id":"d","label":"нет"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Что значит это слово? — جَمَلٌ', '{"options":[{"id":"b","label":"собака"},{"id":"d","label":"осёл"},{"id":"a","label":"верблюд"},{"id":"c","label":"петух"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что значит это слово? — تَاجِرٌ', '{"options":[{"id":"c","label":"студент"},{"id":"d","label":"врач"},{"id":"a","label":"торговец"},{"id":"b","label":"мужчина"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Как сказать «дом»?', '{"options":[{"id":"a","label":"بَيْتٌ"},{"id":"b","label":"مَسْجِدٌ"},{"id":"c","label":"بَابٌ"},{"id":"d","label":"كِتَابٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Как сказать «мечеть»?', '{"options":[{"id":"a","label":"مَسْجِدٌ"},{"id":"b","label":"بَيْتٌ"},{"id":"c","label":"بَابٌ"},{"id":"d","label":"كِتَابٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Как сказать «дверь»?', '{"options":[{"id":"a","label":"بَابٌ"},{"id":"b","label":"بَيْتٌ"},{"id":"c","label":"مَسْجِدٌ"},{"id":"d","label":"كِتَابٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Вставьте пропущенное слово: «книга» — هَٰذَا ___ .', '{"options":[{"id":"a","label":"كِتَابٌ"},{"id":"b","label":"بَيْتٌ"},{"id":"c","label":"مَسْجِدٌ"},{"id":"d","label":"بَابٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Вставьте пропущенное слово: «ручка» — هَٰذَا ___ .', '{"options":[{"id":"a","label":"قَلَمٌ"},{"id":"b","label":"بَيْتٌ"},{"id":"c","label":"مَسْجِدٌ"},{"id":"d","label":"بَابٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 2'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 2', 'arabic', 'beginner', 'Самостоятельные вопросы урока 2 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Предмет рядом. Какое слово выбрать? — قَرِيبٌ', '{"options":[{"id":"a","label":"هَٰذَا"},{"id":"b","label":"ذَٰلِكَ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Предмет далеко. Какое слово выбрать? — بَعِيدٌ', '{"options":[{"id":"a","label":"هَٰذَا"},{"id":"b","label":"ذَٰلِكَ"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Как спросить о далёком предмете «что то?»', '{"options":[{"id":"a","label":"مَا ذَٰلِكَ؟"},{"id":"b","label":"مَنْ ذَٰلِكَ؟"},{"id":"c","label":"مَا هَٰذَا؟"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что значит ذَٰلِكَ نَجْمٌ?', '{"options":[{"id":"a","label":"То звезда."},{"id":"b","label":"Это звезда."},{"id":"c","label":"Где звезда?"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Как сказать: «Это мечеть, а то дом»?', '{"options":[{"id":"a","label":"هَٰذَا مَسْجِدٌ وَذَٰلِكَ بَيْتٌ."},{"id":"b","label":"ذَٰلِكَ مَسْجِدٌ وَهَٰذَا بَيْتٌ."},{"id":"c","label":"مَا ذَٰلِكَ؟"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что значит это слово? — بَيْتٌ', '{"options":[{"id":"a","label":"дом"},{"id":"c","label":"камень"},{"id":"b","label":"звезда"},{"id":"d","label":"кровать"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что значит это слово? — مَا', '{"options":[{"id":"b","label":"то / тот"},{"id":"d","label":"частица вопроса «да/нет»"},{"id":"a","label":"что?"},{"id":"c","label":"и"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Что значит это слово? — حِمَارٌ', '{"options":[{"id":"c","label":"лошадь"},{"id":"d","label":"собака"},{"id":"a","label":"осёл"},{"id":"b","label":"кот"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Как сказать «звезда»?', '{"options":[{"id":"a","label":"نَجْمٌ"},{"id":"b","label":"مَسْجِدٌ"},{"id":"c","label":"بَيْتٌ"},{"id":"d","label":"سَرِيرٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', 'Как сказать «кровать»?', '{"options":[{"id":"a","label":"سَرِيرٌ"},{"id":"b","label":"نَجْمٌ"},{"id":"c","label":"مَسْجِدٌ"},{"id":"d","label":"بَيْتٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 3'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 3', 'arabic', 'beginner', 'Самостоятельные вопросы урока 3 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Сделайте определённым: بَيْتٌ', '{"options":[{"id":"a","label":"الْبَيْتُ"},{"id":"b","label":"بَيْتُ ال"},{"id":"c","label":"الْبَيْتٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Сделайте определённым: قَلَمٌ', '{"options":[{"id":"a","label":"قَلَمُ الْ"},{"id":"b","label":"الْقَلَمُ"},{"id":"c","label":"الْقَلَمٌ"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Сделайте определённым: كِتَابٌ', '{"options":[{"id":"a","label":"الْكِتَابُ"},{"id":"b","label":"كِتَابٌ ال"},{"id":"c","label":"اَلْكِتَابٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Сделайте определённым: بَابٌ', '{"options":[{"id":"a","label":"الْبَابٌ"},{"id":"b","label":"الْبَابُ"},{"id":"c","label":"بَابُ الْ"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Что значит الْقَلَمُ مَكْسُورٌ?', '{"options":[{"id":"a","label":"Ручка сломана."},{"id":"b","label":"Это ручка."},{"id":"c","label":"Где ручка?"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что значит الْبَابُ مَفْتُوحٌ?', '{"options":[{"id":"a","label":"Дверь закрыта."},{"id":"b","label":"Дверь открыта."},{"id":"c","label":"То дверь."}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что значит الْكِتَابُ جَدِيدٌ وَالْقَلَمُ قَدِيمٌ?', '{"options":[{"id":"a","label":"Книга новая, а ручка старая."},{"id":"b","label":"Книга старая, а ручка новая."},{"id":"c","label":"Это книга и ручка."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Что значит الْبَيْتُ كَبِيرٌ?', '{"options":[{"id":"a","label":"Дом большой."},{"id":"b","label":"Дом маленький."},{"id":"c","label":"Дверь открыта."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'В الْبَيْتُ после ال стоит ب. Это какая буква?', '{"options":[{"id":"a","label":"Лунная — слышим «ль»"},{"id":"b","label":"Солнечная — «ль» не слышим"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', 'В النَّجْمُ после ال стоит ن с шаддой. Это какая буква?', '{"options":[{"id":"a","label":"Лунная — слышим «ль»"},{"id":"b","label":"Солнечная — «ль» не слышим"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 4'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 4', 'arabic', 'beginner', 'Самостоятельные вопросы урока 4 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Как сказать «в комнате»?', '{"options":[{"id":"a","label":"فِي الْغُرْفَةِ"},{"id":"b","label":"عَلَى الْغُرْفَةِ"},{"id":"c","label":"مِنَ الْغُرْفَةِ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', '«Он на кухне» — правильно:', '{"options":[{"id":"a","label":"هُوَ فِي الْمَطْبَخِ."},{"id":"b","label":"هِيَ فِي الْمَطْبَخِ."},{"id":"c","label":"هُوَ عَلَى الْمَطْبَخِ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Выберите: «пошёл к директору»', '{"options":[{"id":"a","label":"ذَهَبَ إِلَى الْمُدِيرِ."},{"id":"b","label":"خَرَجَ عَلَى الْمُدِيرِ."},{"id":"c","label":"ذَهَبَ مِنَ الْمُدِيرِ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Как спросить «где Мухаммад»?', '{"options":[{"id":"a","label":"أَيْنَ مُحَمَّدٌ؟"},{"id":"b","label":"مَا مُحَمَّدٌ؟"},{"id":"c","label":"مَنْ فِي مُحَمَّدٍ؟"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Какая пара значит «из … к …»?', '{"options":[{"id":"a","label":"مِنْ … إِلَى …"},{"id":"b","label":"فِي … عَلَى …"},{"id":"c","label":"هُوَ … هِيَ …"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что значит это слово? — أَيْنَ', '{"options":[{"id":"a","label":"где?"},{"id":"b","label":"он"},{"id":"c","label":"в"},{"id":"d","label":"пошёл"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что значит это слово? — الْغُرْفَةُ', '{"options":[{"id":"a","label":"комната"},{"id":"b","label":"кухня"},{"id":"c","label":"на"},{"id":"d","label":"вышел"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Как сказать «кухня»?', '{"options":[{"id":"a","label":"الْمَطْبَخُ"},{"id":"b","label":"الْغُرْفَةُ"},{"id":"c","label":"الْمَكْتَبُ"},{"id":"d","label":"الْمَسْجِدُ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Что значит فِي? — فِي', '{"options":[{"id":"a","label":"в"},{"id":"b","label":"на"},{"id":"c","label":"из / от"},{"id":"d","label":"к"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', 'Вставьте пропущенное слово: «стол» — هُوَ فِي ___ .', '{"options":[{"id":"a","label":"الْمَكْتَبُ"},{"id":"b","label":"الْغُرْفَةُ"},{"id":"c","label":"الْمَطْبَخُ"},{"id":"d","label":"الْمَسْجِدُ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 5'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 5', 'arabic', 'beginner', 'Самостоятельные вопросы урока 5 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Как сказать «книга Мухаммада»?', '{"options":[{"id":"a","label":"كِتَابُ مُحَمَّدٍ"},{"id":"b","label":"كِتَابٌ مُحَمَّدٌ"},{"id":"c","label":"الْكِتَابُ مُحَمَّدٍ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Как сказать «стол Мухаммада»?', '{"options":[{"id":"a","label":"مَكْتَبُ مُحَمَّدٍ"},{"id":"b","label":"مُحَمَّدُ الْمَكْتَبِ"},{"id":"c","label":"الْمَكْتَبُ مُحَمَّدٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Как сказать «она под столом»?', '{"options":[{"id":"a","label":"هِيَ تَحْتَ الْمَكْتَبِ."},{"id":"b","label":"هِيَ عَلَى الْمَكْتَبِ."},{"id":"c","label":"هِيَ أَمَامَ الْمَكْتَبِ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что значит это слово? — تَحْتَ', '{"options":[{"id":"a","label":"под"},{"id":"b","label":"там"},{"id":"c","label":"сын"},{"id":"d","label":"книга"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Что значит это слово? — اِبْنٌ', '{"options":[{"id":"a","label":"сын"},{"id":"b","label":"стол"},{"id":"c","label":"дом"},{"id":"d","label":"под"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Как сказать «стол»?', '{"options":[{"id":"a","label":"الْمَكْتَبُ"},{"id":"b","label":"كِتَابٌ"},{"id":"c","label":"يَا"},{"id":"d","label":"الْبَيْتُ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что значит это слово? — هُنَاكَ', '{"options":[{"id":"a","label":"там"},{"id":"b","label":"под"},{"id":"c","label":"о…"},{"id":"d","label":"книга"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Что значит это слово? — يَا', '{"options":[{"id":"a","label":"о…; обращение"},{"id":"b","label":"под"},{"id":"c","label":"там"},{"id":"d","label":"сын"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Как сказать «книга сына»?', '{"options":[{"id":"a","label":"كِتَابُ الِابْنِ"},{"id":"b","label":"كِتَابٌ اِبْنٌ"},{"id":"c","label":"الْكِتَابُ الِابْنُ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 6'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 6', 'arabic', 'beginner', 'Самостоятельные вопросы урока 6 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', '«Это окно» (ж.р., близко):', '{"options":[{"id":"a","label":"هَٰذِهِ نَافِذَةٌ."},{"id":"b","label":"هَٰذَا نَافِذَةٌ."},{"id":"c","label":"تِلْكَ نَافِذَةٌ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Что значит لِمَنْ هَٰذِهِ?', '{"options":[{"id":"a","label":"Чья это?"},{"id":"b","label":"Где это?"},{"id":"c","label":"Что это?"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', '«Это принадлежит Халиду»:', '{"options":[{"id":"a","label":"هَٰذِهِ لِخَالِدٍ."},{"id":"b","label":"هَٰذِهِ مِنْ خَالِدٍ."},{"id":"c","label":"هَٰذَا عَلَى خَالِدٍ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что значит это слово? — لِـ', '{"options":[{"id":"a","label":"для / принадлежит"},{"id":"c","label":"машина"},{"id":"b","label":"эта / это (ж. р.)"},{"id":"d","label":"окно"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Как сказать «окно»?', '{"options":[{"id":"a","label":"نَافِذَةٌ"},{"id":"b","label":"سَيَّارَةٌ"},{"id":"c","label":"مِكْوَاةٌ"},{"id":"d","label":"خَالِدٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что значит это слово? — مِكْوَاةٌ', '{"options":[{"id":"b","label":"чей?"},{"id":"d","label":"окно"},{"id":"a","label":"утюг"},{"id":"c","label":"Халид"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Вставьте пропущенное слово: «Халид» — هَٰذِهِ ___ .', '{"options":[{"id":"a","label":"خَالِدٌ"},{"id":"b","label":"نَافِذَةٌ"},{"id":"c","label":"سَيَّارَةٌ"},{"id":"d","label":"مِكْوَاةٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Как сказать «эта»?', '{"options":[{"id":"a","label":"هَذِهِ"},{"id":"b","label":"نَافِذَةٌ"},{"id":"c","label":"سَيَّارَةٌ"},{"id":"d","label":"مِكْوَاةٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', '«Эта машина»:', '{"options":[{"id":"a","label":"هٰذِهِ سَيَّارَةٌ"},{"id":"b","label":"هٰذَا سَيَّارَةٌ"},{"id":"c","label":"تِلْكَ سَيَّارَةٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 7'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 7', 'arabic', 'beginner', 'Самостоятельные вопросы урока 7 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', '«То — яйцо» (далеко, ж.):', '{"options":[{"id":"a","label":"تِلْكَ بَيْضَةٌ."},{"id":"b","label":"هَٰذِهِ بَيْضَةٌ."},{"id":"c","label":"ذَٰلِكَ بَيْضَةٌ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Пара для ж.р. близко / далеко:', '{"options":[{"id":"a","label":"هَٰذِهِ / تِلْكَ"},{"id":"b","label":"هَٰذَا / ذَٰلِكَ"},{"id":"c","label":"هُوَ / هِيَ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Что значит هَٰذَا جَمَلٌ وَتِلْكَ نَاقَةٌ?', '{"options":[{"id":"a","label":"Это верблюд, а та — верблюдица."},{"id":"b","label":"Оба мужского рода."},{"id":"c","label":"Это вопрос «где?»"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что значит это слово? — نَاقَةٌ', '{"options":[{"id":"a","label":"верблюдица"},{"id":"c","label":"яйцо"},{"id":"b","label":"та / то (ж. р.)"},{"id":"d","label":"тот / то (м. р.)"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Как сказать «яйцо»?', '{"options":[{"id":"a","label":"بَيْضَةٌ"},{"id":"b","label":"نَاقَةٌ"},{"id":"c","label":"جَمَلٌ"},{"id":"d","label":"مُمَرِّضَةٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Как сказать «медсестра»?', '{"options":[{"id":"a","label":"مُمَرِّضَةٌ"},{"id":"b","label":"بَيْضَةٌ"},{"id":"c","label":"نَاقَةٌ"},{"id":"d","label":"جَمَلٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что значит это слово? — ذَلِكَ', '{"options":[{"id":"a","label":"тот"},{"id":"b","label":"та"},{"id":"c","label":"эта"},{"id":"d","label":"яйцо"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Пара ж.р. близко / далеко:', '{"options":[{"id":"a","label":"هٰذِهِ / تِلْكَ"},{"id":"b","label":"هٰذَا / ذٰلِكَ"},{"id":"c","label":"هُوَ / هِيَ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Верблюдица далеко — какая форма?', '{"options":[{"id":"a","label":"تِلْكَ نَاقَةٌ"},{"id":"b","label":"هٰذِهِ نَاقَةٌ"},{"id":"c","label":"هٰذَا نَاقَةٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 8'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 8', 'arabic', 'beginner', 'Самостоятельные вопросы урока 8 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', '«Перед мечетью»:', '{"options":[{"id":"a","label":"أَمَامَ الْمَسْجِدِ"},{"id":"b","label":"خَلْفَ الْمَسْجِدِ"},{"id":"c","label":"تَحْتَ الْمَسْجِدِ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', '«Этот мужчина — торговец»:', '{"options":[{"id":"a","label":"هَٰذَا الرَّجُلُ تَاجِرٌ."},{"id":"b","label":"هَٰذَا رَجُلٌ التَّاجِرُ."},{"id":"c","label":"تِلْكَ الرَّجُلُ تَاجِرٌ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Что значит هَٰذِهِ السَّيَّارَةُ لِلطَّبِيبِ?', '{"options":[{"id":"a","label":"Эта машина принадлежит врачу."},{"id":"b","label":"Врач под машиной."},{"id":"c","label":"Где машина?"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что значит это слово? — أَمَامَ', '{"options":[{"id":"a","label":"перед"},{"id":"c","label":"торговец"},{"id":"b","label":"за / позади"},{"id":"d","label":"мужчина"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Как сказать «врач»?', '{"options":[{"id":"a","label":"طَبِيبٌ"},{"id":"b","label":"الرَّجُلُ"},{"id":"c","label":"تَاجِرٌ"},{"id":"d","label":"الْمَسْجِدُ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Вставьте пропущенное слово: «мечеть» — هَٰذَا ___ .', '{"options":[{"id":"a","label":"الْمَسْجِدُ"},{"id":"b","label":"الرَّجُلُ"},{"id":"c","label":"تَاجِرٌ"},{"id":"d","label":"طَبِيبٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Как сказать «за / позади»?', '{"options":[{"id":"a","label":"خَلْفَ"},{"id":"b","label":"أَمَامَ"},{"id":"c","label":"هٰذَا"},{"id":"d","label":"طَبِيبٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', '«Этот мужчина» как группа:', '{"options":[{"id":"a","label":"هٰذَا الرَّجُلُ"},{"id":"b","label":"الرَّجُلُ هٰذَا"},{"id":"c","label":"هٰذِهِ الرَّجُلُ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Пара «перед / за»:', '{"options":[{"id":"a","label":"أَمَامَ / خَلْفَ"},{"id":"b","label":"فِي / عَلَى"},{"id":"c","label":"تَحْتَ / هُنَاكَ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', '«Машина перед мечетью»:', '{"options":[{"id":"a","label":"سَيَّارَةٌ أَمَامَ الْمَسْجِدِ"},{"id":"b","label":"سَيَّارَةٌ خَلْفَ الْمَسْجِدِ"},{"id":"c","label":"أَمَامَ سَيَّارَةٌ الْمَسْجِدِ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 9'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 9', 'arabic', 'beginner', 'Самостоятельные вопросы урока 9 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', '«Новая книга» (с ال):', '{"options":[{"id":"a","label":"الْكِتَابُ الْجَدِيدُ"},{"id":"b","label":"كِتَابٌ الْجَدِيدُ"},{"id":"c","label":"الْكِتَابُ جَدِيدٌ ال"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', '«Я голоден» (مَنْع من الصرف pattern):', '{"options":[{"id":"a","label":"أَنَا جَوْعَانُ"},{"id":"b","label":"أَنَا جَوْعَانٌ"},{"id":"c","label":"أَنَا الْجَوْعَانُ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Что значит الْكِتَابُ الْجَدِيدُ عِنْدِي?', '{"options":[{"id":"a","label":"Новая книга у меня."},{"id":"b","label":"Книга под столом."},{"id":"c","label":"Где новая книга?"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что значит это слово? — الَّذِي', '{"options":[{"id":"a","label":"который (м. р.)"},{"id":"b","label":"новый"},{"id":"c","label":"ленивый"},{"id":"d","label":"ученик"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Что значит это слово? — جَدِيدٌ', '{"options":[{"id":"a","label":"новый"},{"id":"b","label":"ленивый"},{"id":"c","label":"голодный"},{"id":"d","label":"ученик"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Как сказать «ленивый»?', '{"options":[{"id":"a","label":"كَسْلَانُ"},{"id":"b","label":"جَوْعَانُ"},{"id":"c","label":"جَدِيدٌ"},{"id":"d","label":"طَالِبٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что значит это слово? — جَوْعَانُ', '{"options":[{"id":"a","label":"голодный"},{"id":"b","label":"ленивый"},{"id":"c","label":"новый"},{"id":"d","label":"книга"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', '«Новый ученик»:', '{"options":[{"id":"a","label":"طَالِبٌ جَدِيدٌ"},{"id":"b","label":"جَدِيدٌ طَالِبٌ"},{"id":"c","label":"الطَّالِبُ جَدِيدَةٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Что делает الَّذِي в фразе?', '{"options":[{"id":"a","label":"связывает определение с именем"},{"id":"b","label":"ставит вопрос «где?»"},{"id":"c","label":"убирает артикль"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', 'Как сказать «новая книга»?', '{"options":[{"id":"a","label":"كِتَابٌ جَدِيدٌ"},{"id":"b","label":"جَدِيدٌ كِتَابٌ"},{"id":"c","label":"كِتَابٌ جَدِيدَةٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 10'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 10', 'arabic', 'beginner', 'Самостоятельные вопросы урока 10 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', '«Как тебя зовут?»', '{"options":[{"id":"a","label":"مَا اسْمُكَ؟"},{"id":"b","label":"مَا اسْمِي؟"},{"id":"c","label":"مَنْ أَنْتَ اسْمٌ؟"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', '«У меня есть машина?» (вопрос):', '{"options":[{"id":"a","label":"أَعِنْدَكَ سَيَّارَةٌ"},{"id":"b","label":"أَلِي سَيَّارَةٌ"},{"id":"c","label":"أَفِي سَيَّارَةٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', '«Твой отец»:', '{"options":[{"id":"a","label":"أَبُوكَ"},{"id":"b","label":"أَبِي كَ"},{"id":"c","label":"الْأَبُ أَنْتَ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что значит это слово? — أَخُوكَ', '{"options":[{"id":"a","label":"твой брат"},{"id":"c","label":"у меня"},{"id":"b","label":"мой"},{"id":"d","label":"его"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Как сказать «твой отец»?', '{"options":[{"id":"a","label":"أَبُوكَ"},{"id":"b","label":"أَخُوكَ"},{"id":"c","label":"كِتَابٌ"},{"id":"d","label":"سَيَّارَةٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что значит это слово? — كِتَابٌ', '{"options":[{"id":"a","label":"книга"},{"id":"b","label":"твой отец"},{"id":"c","label":"твой брат"},{"id":"d","label":"машина"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Как сказать «машина»?', '{"options":[{"id":"a","label":"سَيَّارَةٌ"},{"id":"b","label":"أَبُوكَ"},{"id":"c","label":"أَخُوكَ"},{"id":"d","label":"كِتَابٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Что значит это слово? — ـي', '{"options":[{"id":"a","label":"мой"},{"id":"b","label":"твой (м. р.)"},{"id":"c","label":"его"},{"id":"d","label":"у меня"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Как сказать «твой (м. р.)»?', '{"options":[{"id":"a","label":"ـكَ"},{"id":"b","label":"ـي"},{"id":"c","label":"ـهُ"},{"id":"d","label":"عِنْدِي"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', '«Твой брат»:', '{"options":[{"id":"a","label":"أَخُوكَ"},{"id":"b","label":"أَخِي"},{"id":"c","label":"أَخُوهُ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 11'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 11', 'arabic', 'beginner', 'Самостоятельные вопросы урока 11 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', '«Это мой дом»:', '{"options":[{"id":"a","label":"هَٰذَا بَيْتِي."},{"id":"b","label":"هَٰذَا بَيْتٌ ي."},{"id":"c","label":"هَٰذِهِ بَيْتِي."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', '«Я люблю арабский язык»:', '{"options":[{"id":"a","label":"أُحِبُّ اللُّغَةَ الْعَرَبِيَّةَ."},{"id":"b","label":"أُحِبُّ اللُّغَةُ الْعَرَبِيَّةُ."},{"id":"c","label":"يُحِبُّ اللُّغَةَ الْعَرَبِيَّةَ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Что значит مَا فِيهِ أَحَدٌ?', '{"options":[{"id":"a","label":"В нём никого нет."},{"id":"b","label":"В нём все есть."},{"id":"c","label":"Кто в доме?"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что значит это слово? — فِيهِ', '{"options":[{"id":"a","label":"в нём"},{"id":"b","label":"в ней"},{"id":"c","label":"я люблю"},{"id":"d","label":"комната"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Как сказать «мой дом»?', '{"options":[{"id":"a","label":"بَيْتِي"},{"id":"b","label":"بَيْتُكَ"},{"id":"c","label":"بَيْتُهُ"},{"id":"d","label":"غُرْفَةٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что значит это слово? — غُرْفَةٌ', '{"options":[{"id":"a","label":"комната"},{"id":"b","label":"школа"},{"id":"c","label":"ученик"},{"id":"d","label":"мечеть"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Как сказать «школа»?', '{"options":[{"id":"a","label":"مَدْرَسَةٌ"},{"id":"b","label":"غُرْفَةٌ"},{"id":"c","label":"بَيْتِي"},{"id":"d","label":"طَالِبٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Что значит это слово? — أُحِبُّ', '{"options":[{"id":"a","label":"я люблю"},{"id":"b","label":"в нём"},{"id":"c","label":"в ней"},{"id":"d","label":"ученик"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Как сказать «ученик»?', '{"options":[{"id":"a","label":"طَالِبٌ"},{"id":"b","label":"مُدَرِّسٌ"},{"id":"c","label":"غُرْفَةٌ"},{"id":"d","label":"مَدْرَسَةٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', '«Моя комната»:', '{"options":[{"id":"a","label":"غُرْفَتِي"},{"id":"b","label":"غُرْفَةٌ"},{"id":"c","label":"الْغُرْفَةُ هِيَ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 12'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 12', 'arabic', 'beginner', 'Самостоятельные вопросы урока 12 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Обращение к женщине «как дела?»:', '{"options":[{"id":"a","label":"كَيْفَ حَالُكِ؟"},{"id":"b","label":"كَيْفَ حَالُكَ؟"},{"id":"c","label":"كَيْفَ حَالُكُمْ؟"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', '«Она пошла в школу»:', '{"options":[{"id":"a","label":"ذَهَبَتْ إِلَى الْمَدْرَسَةِ."},{"id":"b","label":"ذَهَبَ إِلَى الْمَدْرَسَةِ."},{"id":"c","label":"ذَهَبُوا إِلَى الْمَدْرَسَةِ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', '«Тётя по матери»:', '{"options":[{"id":"a","label":"الْخَالَةُ"},{"id":"b","label":"الْعَمَّةُ"},{"id":"c","label":"الْخَالُ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что значит это слово? — عَمٌّ', '{"options":[{"id":"a","label":"дядя по отцу"},{"id":"c","label":"тётя по отцу"},{"id":"b","label":"тётя по матери"},{"id":"d","label":"дядя по матери"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Как сказать «тётя по отцу»?', '{"options":[{"id":"a","label":"عَمَّةٌ"},{"id":"b","label":"عَمٌّ"},{"id":"c","label":"خَالٌ"},{"id":"d","label":"خَالَةٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что значит это слово? — خَالٌ', '{"options":[{"id":"b","label":"тётя по матери"},{"id":"d","label":"дядя по отцу"},{"id":"a","label":"дядя по матери"},{"id":"c","label":"тётя по отцу"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Как сказать «тётя по матери»?', '{"options":[{"id":"a","label":"خَالَةٌ"},{"id":"b","label":"عَمٌّ"},{"id":"c","label":"عَمَّةٌ"},{"id":"d","label":"خَالٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Что значит это слово? — أَنْتِ', '{"options":[{"id":"a","label":"ты (ж. р.)"},{"id":"b","label":"твой"},{"id":"c","label":"которая (ж. р.)"},{"id":"d","label":"дядя по отцу"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Как сказать «твой»?', '{"options":[{"id":"a","label":"ـكِ"},{"id":"b","label":"أَنْتِ"},{"id":"c","label":"الَّتِي"},{"id":"d","label":"عَمٌّ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', '«Дядя по отцу»:', '{"options":[{"id":"a","label":"عَمٌّ"},{"id":"b","label":"خَالٌ"},{"id":"c","label":"أَبٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 13'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 13', 'arabic', 'beginner', 'Самостоятельные вопросы урока 13 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', '«Эти (м.) — новые студенты»:', '{"options":[{"id":"a","label":"هَٰؤُلَاءِ طُلَّابٌ جُدُدٌ."},{"id":"b","label":"هَٰذِهِ طُلَّابٌ جُدُدٌ."},{"id":"c","label":"ذَٰلِكَ طُلَّابٌ جُدُدٌ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', '«Они (ж.) пошли в библиотеку»:', '{"options":[{"id":"a","label":"ذَهَبْنَ إِلَى الْمَكْتَبَةِ."},{"id":"b","label":"ذَهَبُوا إِلَى الْمَكْتَبَةِ."},{"id":"c","label":"ذَهَبَتْ إِلَى الْمَكْتَبَةِ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Далёкое «те» для людей:', '{"options":[{"id":"a","label":"أُولَٰئِكَ"},{"id":"b","label":"تِلْكَ"},{"id":"c","label":"هَٰذِهِ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что значит это слово? — طُلَّابٌ', '{"options":[{"id":"a","label":"ученики"},{"id":"c","label":"они (ж. р.)"},{"id":"b","label":"эти"},{"id":"d","label":"они (м. р.)"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Как сказать «книга»?', '{"options":[{"id":"a","label":"كِتَابٌ"},{"id":"b","label":"طُلَّابٌ"},{"id":"c","label":"مَسْجِدٌ"},{"id":"d","label":"بَيْتٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что значит это слово? — أُولَئِكَ', '{"options":[{"id":"b","label":"эти"},{"id":"d","label":"они (ж. р.)"},{"id":"a","label":"те"},{"id":"c","label":"они пошли (ж. р.)"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что значит это слово? — هُمْ', '{"options":[{"id":"c","label":"они (ж. р.)"},{"id":"d","label":"они пошли (м. р.)"},{"id":"a","label":"они (м. р.)"},{"id":"b","label":"те"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Как сказать «они пошли (м. р.)»?', '{"options":[{"id":"a","label":"ذَهَبُوا"},{"id":"b","label":"ذَهَبْنَ"},{"id":"c","label":"هُمْ"},{"id":"d","label":"طُلَّابٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Что значит это слово? — ذَهَبْنَ', '{"options":[{"id":"a","label":"они пошли (ж. р.)"},{"id":"b","label":"эти"},{"id":"c","label":"те"},{"id":"d","label":"они (м. р.)"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 14'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 14', 'arabic', 'beginner', 'Самостоятельные вопросы урока 14 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', '«Кто вы?» (к группе мужчин):', '{"options":[{"id":"a","label":"مَنْ أَنْتُمْ؟"},{"id":"b","label":"مَنْ أَنْتَ؟"},{"id":"c","label":"مَنْ أَنْتُنَّ؟"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', '«Наш новый дом»:', '{"options":[{"id":"a","label":"بَيْتُنَا الْجَدِيدُ"},{"id":"b","label":"بَيْتُكُمُ الْجَدِيدُ"},{"id":"c","label":"بَيْتِي الْجَدِيدُ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Что значит أَيُّ يَوْمٍ هَٰذَا?', '{"options":[{"id":"a","label":"Какой это день?"},{"id":"b","label":"Где этот день?"},{"id":"c","label":"Кто этот день?"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что значит это слово? — ـكُمْ', '{"options":[{"id":"a","label":"ваш"},{"id":"c","label":"мы"},{"id":"b","label":"вы (м. р. мн.)"},{"id":"d","label":"наш"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Как сказать «наша книга»?', '{"options":[{"id":"a","label":"كِتَابُنَا"},{"id":"b","label":"طُلَّابٌ"},{"id":"c","label":"كِتَابٌ"},{"id":"d","label":"بَيْتٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что значит это слово? — أَيّ', '{"options":[{"id":"c","label":"мы"},{"id":"d","label":"наш"},{"id":"a","label":"какой? / который?"},{"id":"b","label":"вы (м. р. мн.)"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Как сказать «мы»?', '{"options":[{"id":"a","label":"نَحْنُ"},{"id":"b","label":"أَنْتُمْ"},{"id":"c","label":"طُلَّابٌ"},{"id":"d","label":"كِتَابٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Что значит это слово? — مَسْجِدٌ', '{"options":[{"id":"a","label":"мечеть"},{"id":"b","label":"наша книга"},{"id":"c","label":"ученики"},{"id":"d","label":"книга"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', '«Мы ученики»:', '{"options":[{"id":"a","label":"نَحْنُ طُلَّابٌ"},{"id":"b","label":"أَنْتُمْ طُلَّابٌ"},{"id":"c","label":"هُمْ طَالِبٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 15'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 15', 'arabic', 'beginner', 'Самостоятельные вопросы урока 15 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', '«Вы» (ж. мн.):', '{"options":[{"id":"a","label":"أَنْتُنَّ"},{"id":"b","label":"أَنْتُمْ"},{"id":"c","label":"هُنَّ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', '«После месяца»:', '{"options":[{"id":"a","label":"بَعْدَ شَهْرٍ"},{"id":"b","label":"قَبْلَ شَهْرٍ"},{"id":"c","label":"فِي شَهْرٍ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', '«Вы (ж.) пошли?»', '{"options":[{"id":"a","label":"أَذَهَبْتُنَّ"},{"id":"b","label":"أَذَهَبْتُمْ"},{"id":"c","label":"أَذَهَبْنَ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что значит это слово? — بَعْدَ', '{"options":[{"id":"a","label":"после"},{"id":"c","label":"вы (ж. р. мн.)"},{"id":"b","label":"до"},{"id":"d","label":"вернулся"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Как сказать «ученицы»?', '{"options":[{"id":"a","label":"طَالِبَاتٌ"},{"id":"b","label":"مَدْرَسَةٌ"},{"id":"c","label":"بَيْتٌ"},{"id":"d","label":"كِتَابٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что значит это слово? — مَدْرَسَةٌ', '{"options":[{"id":"a","label":"школа"},{"id":"b","label":"ученицы"},{"id":"c","label":"дом"},{"id":"d","label":"книга"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Как сказать «когда?»?', '{"options":[{"id":"a","label":"مَتَى"},{"id":"b","label":"قَبْلَ"},{"id":"c","label":"بَعْدَ"},{"id":"d","label":"رَجَعَ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Что значит это слово? — قَبْلَ', '{"options":[{"id":"c","label":"когда?"},{"id":"d","label":"после"},{"id":"a","label":"до"},{"id":"b","label":"ваш (ж. р. мн.)"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Что значит это слово? — رَجَعَ', '{"options":[{"id":"a","label":"вернулся"},{"id":"b","label":"вы (ж. р. мн.)"},{"id":"c","label":"ваш (ж. р. мн.)"},{"id":"d","label":"когда?"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 16'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 16', 'arabic', 'beginner', 'Самостоятельные вопросы урока 16 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', '«Эти ручки» (предметы):', '{"options":[{"id":"a","label":"هَٰذِهِ الْأَقْلَامُ"},{"id":"b","label":"هَٰؤُلَاءِ الْأَقْلَامُ"},{"id":"c","label":"هَٰذَا الْأَقْلَامُ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', '«Эти — новые студенты» (люди):', '{"options":[{"id":"a","label":"هَٰؤُلَاءِ طُلَّابٌ جُدُدٌ."},{"id":"b","label":"هَٰذِهِ طُلَّابٌ جُدُدٌ."},{"id":"c","label":"تِلْكَ طُلَّابٌ جُدُدٌ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', '«Эти книги новые»:', '{"options":[{"id":"a","label":"هَٰذِهِ كُتُبٌ جَدِيدَةٌ."},{"id":"b","label":"هَٰؤُلَاءِ كُتُبٌ جَدِيدَةٌ."},{"id":"c","label":"هَٰذَا كُتُبٌ جَدِيدَةٌ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Как сказать «книги»?', '{"options":[{"id":"a","label":"كُتُبٌ"},{"id":"b","label":"طُلَّابٌ"},{"id":"c","label":"سَيَّارَاتٌ"},{"id":"d","label":"رَجُلٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Что значит это слово? — سَيَّارَاتٌ', '{"options":[{"id":"b","label":"неразумный; предмет/животное"},{"id":"d","label":"эти (люди)"},{"id":"a","label":"машины"},{"id":"c","label":"ученики"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Как сказать «мужчина»?', '{"options":[{"id":"a","label":"رَجُلٌ"},{"id":"b","label":"كُتُبٌ"},{"id":"c","label":"طُلَّابٌ"},{"id":"d","label":"سَيَّارَاتٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что значит это слово? — عَاقِلٌ', '{"options":[{"id":"a","label":"разумный; человек"},{"id":"b","label":"неразумный; предмет"},{"id":"c","label":"эта"},{"id":"d","label":"эти (люди)"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Как сказать «неразумный; предмет»?', '{"options":[{"id":"a","label":"غَيْرُ عَاقِلٍ"},{"id":"b","label":"عَاقِلٌ"},{"id":"c","label":"هَذِهِ"},{"id":"d","label":"هَؤُلَاءِ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', '«Эти машины» (предметы):', '{"options":[{"id":"a","label":"هَٰذِهِ سَيَّارَاتٌ"},{"id":"b","label":"هَٰؤُلَاءِ سَيَّارَاتٌ"},{"id":"c","label":"هَٰذَا سَيَّارَاتٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 17'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 17', 'arabic', 'beginner', 'Самостоятельные вопросы урока 17 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', '«Двери мечети открыты»:', '{"options":[{"id":"a","label":"أَبْوَابُ الْمَسْجِدِ مَفْتُوحَةٌ."},{"id":"b","label":"أَبْوَابُ الْمَسْجِدِ مَفْتُوحُونَ."},{"id":"c","label":"أَبْوَابُ الْمَسْجِدِ مَفْتُوحٌ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', '«Звёзды красивы»:', '{"options":[{"id":"a","label":"النُّجُومُ جَمِيلَةٌ."},{"id":"b","label":"النُّجُومُ جَمِيلُونَ."},{"id":"c","label":"النُّجُومُ جَمِيلٌ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', '«Японские часы дешёвые»:', '{"options":[{"id":"a","label":"السَّاعَةُ الْيَابَانِيَّةُ رَخِيصَةٌ."},{"id":"b","label":"السَّاعَةُ الْيَابَانِيَّةُ رَخِيصٌ."},{"id":"c","label":"السَّاعَةُ الْيَابَانِيّ رَخِيصَةٌ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что значит это слово? — كُتُبٌ', '{"options":[{"id":"a","label":"книги"},{"id":"b","label":"дома"},{"id":"c","label":"ручки"},{"id":"d","label":"мечети"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Как сказать «мечети»?', '{"options":[{"id":"a","label":"مَسَاجِدُ"},{"id":"b","label":"كُتُبٌ"},{"id":"c","label":"بُيُوتٌ"},{"id":"d","label":"قُمُصٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что значит это слово? — قُمُصٌ', '{"options":[{"id":"a","label":"рубашки"},{"id":"b","label":"книги"},{"id":"c","label":"ручки"},{"id":"d","label":"дома"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Как сказать «дома»?', '{"options":[{"id":"a","label":"بُيُوتٌ"},{"id":"b","label":"كُتُبٌ"},{"id":"c","label":"مَسَاجِدُ"},{"id":"d","label":"أَقْلَامٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Что значит это слово? — نَعْتٌ', '{"options":[{"id":"a","label":"прилагательное"},{"id":"b","label":"сказуемое"},{"id":"c","label":"книги"},{"id":"d","label":"дома"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Как сказать «сказуемое»?', '{"options":[{"id":"a","label":"خَبَرٌ"},{"id":"b","label":"نَعْتٌ"},{"id":"c","label":"كُتُبٌ"},{"id":"d","label":"بُيُوتٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', '«Книги новые»:', '{"options":[{"id":"a","label":"كُتُبٌ جَدِيدَةٌ"},{"id":"b","label":"كُتُبٌ جَدِيدٌ"},{"id":"c","label":"جَدِيدَةٌ كُتُبٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 18'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 18', 'arabic', 'beginner', 'Самостоятельные вопросы урока 18 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', '«Два магазина»:', '{"options":[{"id":"a","label":"مَتْجَرَانِ"},{"id":"b","label":"مَتْجَرَاتٌ"},{"id":"c","label":"مَتْجَرٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', '«Эти два» (м.):', '{"options":[{"id":"a","label":"هَٰذَانِ"},{"id":"b","label":"هَٰتَانِ"},{"id":"c","label":"هَٰؤُلَاءِ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', '«Сколько братьев у тебя?»', '{"options":[{"id":"a","label":"كَمْ أَخًا لَكَ"},{"id":"b","label":"كَمْ أَخٌ لَكَ"},{"id":"c","label":"مَتَى أَخًا لَكَ؟"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', '«Утренний намаз — два ракаата»:', '{"options":[{"id":"a","label":"صَلَاةُ الْفَجْرِ رَكْعَتَانِ."},{"id":"b","label":"صَلَاةُ الْفَجْرِ رَكْعَةٌ."},{"id":"c","label":"صَلَاةُ الْفَجْرِ رَكَعَاتٌ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Что значит это слово? — هُمَا', '{"options":[{"id":"a","label":"они двое"},{"id":"c","label":"эти двое (м. р.)"},{"id":"b","label":"двойственное число"},{"id":"d","label":"эти две (ж. р.)"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Как сказать «две книги»?', '{"options":[{"id":"a","label":"كِتَابَانِ"},{"id":"b","label":"طَالِبَتَانِ"},{"id":"c","label":"كِتَابٌ"},{"id":"d","label":"بَيْتٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что значит это слово? — طَالِبَتَانِ', '{"options":[{"id":"a","label":"две ученицы"},{"id":"b","label":"две книги"},{"id":"c","label":"книга"},{"id":"d","label":"дом"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Что значит это слово? — مُثَنًّى', '{"options":[{"id":"a","label":"двойственное число"},{"id":"b","label":"эти двое (м. р.)"},{"id":"c","label":"эти две (ж. р.)"},{"id":"d","label":"они двое"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Как сказать «эти двое (м. р.)»?', '{"options":[{"id":"a","label":"هَذَانِ"},{"id":"b","label":"مُثَنًّى"},{"id":"c","label":"هَاتَانِ"},{"id":"d","label":"هُمَا"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', '«Две ученицы»:', '{"options":[{"id":"a","label":"طَالِبَتَانِ"},{"id":"b","label":"طَالِبَاتٌ"},{"id":"c","label":"طَالِبَانِ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 19'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 19', 'arabic', 'beginner', 'Самостоятельные вопросы урока 19 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', '«Пять книг» (м. معدود):', '{"options":[{"id":"a","label":"خَمْسَةُ كُتُبٍ"},{"id":"b","label":"خَمْسُ كُتُبٍ"},{"id":"c","label":"خَمْسَةٌ كِتَابٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', '«В неделе семь дней»:', '{"options":[{"id":"a","label":"فِي الْأُسْبُوعِ سَبْعَةُ أَيَّامٍ."},{"id":"b","label":"فِي الْأُسْبُوعِ سَبْعُ أَيَّامٍ."},{"id":"c","label":"فِي الْأُسْبُوعِ سَبْعَةٌ يَوْمٌ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', '«Сколько стоит?»', '{"options":[{"id":"a","label":"كَمْ ثَمَنُهُ"},{"id":"b","label":"مَتَى ثَمَنُهُ؟"},{"id":"c","label":"أَيْنَ ثَمَنُهُ؟"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что значит это слово? — كُتُبٍ', '{"options":[{"id":"a","label":"книг"},{"id":"c","label":"десять (с муж. сущ.)"},{"id":"b","label":"три (с муж. сущ.)"},{"id":"d","label":"семь (с муж. сущ.)"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Как сказать «ручек»?', '{"options":[{"id":"a","label":"أَقْلَامٍ"},{"id":"b","label":"كُتُبٍ"},{"id":"c","label":"أَبْوَابٍ"},{"id":"d","label":"بَيْتٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что значит это слово? — أَبْوَابٍ', '{"options":[{"id":"a","label":"дверей"},{"id":"b","label":"книг"},{"id":"c","label":"ручек"},{"id":"d","label":"дом"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что значит это слово? — ثَلَاثَةُ', '{"options":[{"id":"a","label":"три (с муж. сущ.)"},{"id":"b","label":"пять (с муж. сущ.)"},{"id":"c","label":"семь (с муж. сущ.)"},{"id":"d","label":"десять (с муж. сущ.)"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Как сказать «пять (с муж. сущ.)»?', '{"options":[{"id":"a","label":"خَمْسَةُ"},{"id":"b","label":"ثَلَاثَةُ"},{"id":"c","label":"سَبْعَةُ"},{"id":"d","label":"عَشَرَةُ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', '«Семь дверей»:', '{"options":[{"id":"a","label":"سَبْعَةُ أَبْوَابٍ"},{"id":"b","label":"سَبْعُ أَبْوَابٍ"},{"id":"c","label":"سَبْعَةٌ أَبْوَابٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 20'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 20', 'arabic', 'beginner', 'Самостоятельные вопросы урока 20 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', '«Пять студенток» (ж. معدود):', '{"options":[{"id":"a","label":"خَمْسُ طَالِبَاتٍ"},{"id":"b","label":"خَمْسَةُ طَالِبَاتٍ"},{"id":"c","label":"خَمْسَةٌ طَالِبَةٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', '«Три комнаты»:', '{"options":[{"id":"a","label":"ثَلَاثُ غُرَفٍ"},{"id":"b","label":"ثَلَاثَةُ غُرَفٍ"},{"id":"c","label":"ثَلَاثَةٌ غُرْفَةٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', '«Десять врачей (ж.)»:', '{"options":[{"id":"a","label":"عَشْرُ طَبِيبَاتٍ"},{"id":"b","label":"عَشَرَةُ طَبِيبَاتٍ"},{"id":"c","label":"عَشَرَةٌ طَبِيبَةٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что значит это слово? — طَالِبَاتٍ', '{"options":[{"id":"a","label":"учениц"},{"id":"c","label":"десять (с жен. сущ.)"},{"id":"b","label":"три (с жен. сущ.)"},{"id":"d","label":"семь (с жен. сущ.)"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Как сказать «машин»?', '{"options":[{"id":"a","label":"سَيَّارَاتٍ"},{"id":"b","label":"طَالِبَاتٍ"},{"id":"c","label":"بَنَاتٍ"},{"id":"d","label":"غُرْفَةٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что значит это слово? — بَنَاتٍ', '{"options":[{"id":"a","label":"девочек"},{"id":"b","label":"учениц"},{"id":"c","label":"машин"},{"id":"d","label":"комната"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что значит это слово? — ثَلَاثُ', '{"options":[{"id":"a","label":"три (с жен. сущ.)"},{"id":"b","label":"пять (с жен. сущ.)"},{"id":"c","label":"семь (с жен. сущ.)"},{"id":"d","label":"десять (с жен. сущ.)"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Как сказать «пять (с жен. сущ.)»?', '{"options":[{"id":"a","label":"خَمْسُ"},{"id":"b","label":"ثَلَاثُ"},{"id":"c","label":"سَبْعُ"},{"id":"d","label":"عَشْرُ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', '«Пять учениц»:', '{"options":[{"id":"a","label":"خَمْسُ طَالِبَاتٍ"},{"id":"b","label":"خَمْسَةُ طَالِبَاتٍ"},{"id":"c","label":"خَمْسٌ طَالِبَاتٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', '«Семь машин»:', '{"options":[{"id":"a","label":"سَبْعُ سَيَّارَاتٍ"},{"id":"b","label":"سَبْعَةُ سَيَّارَاتٍ"},{"id":"c","label":"سَبْعٌ سَيَّارَاتٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 21'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 21', 'arabic', 'beginner', 'Самостоятельные вопросы урока 21 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', '«Это моя школа»:', '{"options":[{"id":"a","label":"هَٰذِهِ مَدْرَسَتِي."},{"id":"b","label":"هَٰذَا مَدْرَسَتِي."},{"id":"c","label":"تِلْكَ مَدْرَسَةٌ ي."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', '«У неё три двери»:', '{"options":[{"id":"a","label":"لَهَا ثَلَاثَةُ أَبْوَابٍ."},{"id":"b","label":"لَهَا ثَلَاثُ أَبْوَابٍ."},{"id":"c","label":"لَهُ ثَلَاثَةُ أَبْوَابٍ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', '«В нём два больших окна»:', '{"options":[{"id":"a","label":"فِيهِ نَافِذَتَانِ كَبِيرَتَانِ."},{"id":"b","label":"فِيهَا نَافِذَتَانِ كَبِيرَتَانِ."},{"id":"c","label":"فِيهِ نَوَافِذُ كَبِيرَةٌ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что значит это слово? — فُصُولٌ', '{"options":[{"id":"a","label":"классы"},{"id":"c","label":"я люблю"},{"id":"b","label":"моя школа"},{"id":"d","label":"многие"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Что значит это слово? — مُدَرِّسِي', '{"options":[{"id":"b","label":"библиотека"},{"id":"d","label":"многие"},{"id":"a","label":"мой учитель"},{"id":"c","label":"ученики"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Как сказать «библиотека»?', '{"options":[{"id":"a","label":"مَكْتَبَةٌ"},{"id":"b","label":"مَدْرَسَتِي"},{"id":"c","label":"فُصُولٌ"},{"id":"d","label":"مُدَرِّسِي"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Как сказать «ученики»?', '{"options":[{"id":"a","label":"طُلَّابٌ"},{"id":"b","label":"مَدْرَسَتِي"},{"id":"c","label":"مَكْتَبَةٌ"},{"id":"d","label":"فُصُولٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', '«Мой учитель»:', '{"options":[{"id":"a","label":"مُدَرِّسِي"},{"id":"b","label":"مُدَرِّسٌ"},{"id":"c","label":"الْمُدَرِّسُ هُوَ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 22'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 22', 'arabic', 'beginner', 'Самостоятельные вопросы урока 22 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', '«Зелёная рубашка»:', '{"options":[{"id":"a","label":"قَمِيصٌ أَخْضَرُ"},{"id":"b","label":"قَمِيصٌ أَحْمَرُ"},{"id":"c","label":"أَخْضَرُ قَمِيصٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', '«Ленивый студент» (فَعْلَانُ):', '{"options":[{"id":"a","label":"طَالِبٌ كَسْلَانُ"},{"id":"b","label":"طَالِبٌ كَسْلَانٌ"},{"id":"c","label":"طَالِبٌ كَسْلَانًا"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', '«Мечети» (ломаное мн.):', '{"options":[{"id":"a","label":"مَسَاجِدُ"},{"id":"b","label":"مَسْجِدُونَ"},{"id":"c","label":"مَسْجِدَاتٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что значит это слово? — مَمْنُوعٌ مِنَ الصَّرْفِ', '{"options":[{"id":"a","label":"несклоняемое слово; диптот"},{"id":"b","label":"красный"},{"id":"c","label":"рубашка"},{"id":"d","label":"книга"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Как сказать «рубашка»?', '{"options":[{"id":"a","label":"قَمِيصٌ"},{"id":"b","label":"قَلَمٌ"},{"id":"c","label":"كِتَابٌ"},{"id":"d","label":"أَحْمَرُ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что значит это слово? — أَخْضَرُ', '{"options":[{"id":"a","label":"зелёный"},{"id":"b","label":"красный"},{"id":"c","label":"синий"},{"id":"d","label":"жёлтый"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Как сказать «жёлтый»?', '{"options":[{"id":"a","label":"أَصْفَرُ"},{"id":"b","label":"أَخْضَرُ"},{"id":"c","label":"أَزْرَقُ"},{"id":"d","label":"أَحْمَرُ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Что значит это слово? — أَحْمَرُ', '{"options":[{"id":"a","label":"красный"},{"id":"b","label":"зелёный"},{"id":"c","label":"синий"},{"id":"d","label":"жёлтый"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Как сказать «синий»?', '{"options":[{"id":"a","label":"أَزْرَقُ"},{"id":"b","label":"أَصْفَرُ"},{"id":"c","label":"أَحْمَرُ"},{"id":"d","label":"أَخْضَرُ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', 'Что значит это слово? — قَلَمٌ', '{"options":[{"id":"a","label":"ручка"},{"id":"b","label":"рубашка"},{"id":"c","label":"книга"},{"id":"d","label":"красный"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = 'Мединский арабский · урок 23'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, 'Мединский арабский · урок 23', 'arabic', 'beginner', 'Самостоятельные вопросы урока 23 мединского курса')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', '«Я из Пакистана»:', '{"options":[{"id":"a","label":"أَنَا مِنْ بَاكِسْتَانَ."},{"id":"b","label":"أَنَا مِنْ بَاكِسْتَانِ."},{"id":"c","label":"أَنَا مِنْ بَاكِسْتَانُ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', '«Он поехал в Мекку»:', '{"options":[{"id":"a","label":"ذَهَبَ إِلَى مَكَّةَ."},{"id":"b","label":"ذَهَبَ إِلَى مَكَّةِ."},{"id":"c","label":"ذَهَبَ إِلَى مَكَّةٌ."}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', '«Пять минут назад»:', '{"options":[{"id":"a","label":"قَبْلَ خَمْسِ دَقَائِقَ"},{"id":"b","label":"قَبْلَ خَمْسَةِ دَقَائِقَ"},{"id":"c","label":"قَبْلَ خَمْسِ دَقَائِقٍ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что значит это слово? — مَكَّةَ', '{"options":[{"id":"a","label":"Мекка"},{"id":"c","label":"Пакистан"},{"id":"b","label":"диптот"},{"id":"d","label":"в / к"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Как сказать «Пакистан»?', '{"options":[{"id":"a","label":"بَاكِسْتَانَ"},{"id":"b","label":"مَكَّةَ"},{"id":"c","label":"طَالِبٌ"},{"id":"d","label":"مَسْجِدٌ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что значит это слово? — إِلَى', '{"options":[{"id":"b","label":"пошёл / поехал"},{"id":"d","label":"диптот"},{"id":"a","label":"в / к"},{"id":"c","label":"из"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Как сказать «диптот»?', '{"options":[{"id":"a","label":"مَمْنُوعٌ مِنَ الصَّرْفِ"},{"id":"b","label":"مِنْ"},{"id":"c","label":"إِلَى"},{"id":"d","label":"بَاكِسْتَانَ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = '99 имён · Урок 1 · Аллах и имена милости'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, '99 имён · Урок 1 · Аллах и имена милости', 'aqida', 'beginner', 'Детерминированные вопросы по именам Аллаха (из данных приложения)')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Что означает имя «ٱللَّٰهُ» (Allah)?', '{"options":[{"id":"a","label":"Миротворец"},{"id":"b","label":"Могучий"},{"id":"c","label":"Подчиняющий себе"},{"id":"d","label":"Аллах, Бог, Единый Бог, Первый Создатель"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Аллах, Бог, Единый Бог, Первый Создатель»?', '{"options":[{"id":"a","label":"ٱللَّٰهُ — Allah"},{"id":"b","label":"ٱلرَّحِيمُ — Ar-Rahim"},{"id":"c","label":"ٱلْقُدُّوسُ — Al-Quddus"},{"id":"d","label":"ٱلْمُؤْمِنُ — Al-Mu''min"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلرَّحْمَـٰنُ» (Ar-Rahman)?', '{"options":[{"id":"a","label":"Могучий"},{"id":"b","label":"Милостивый"},{"id":"c","label":"Подчиняющий себе"},{"id":"d","label":"Аллах, Бог, Единый Бог, Первый Создатель"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلرَّحِيمُ» (Ar-Rahim)?', '{"options":[{"id":"a","label":"Подчиняющий себе"},{"id":"b","label":"Милосердный"},{"id":"c","label":"Царь"},{"id":"d","label":"Милостивый"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Милосердный»?', '{"options":[{"id":"a","label":"ٱلسَّلَـٰمُ — As-Salam"},{"id":"b","label":"ٱلْمُؤْمِنُ — Al-Mu''min"},{"id":"c","label":"ٱللَّٰهُ — Allah"},{"id":"d","label":"ٱلرَّحِيمُ — Ar-Rahim"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْمَـٰلِكُ» (Al-Malik)?', '{"options":[{"id":"a","label":"Милостивый"},{"id":"b","label":"Аллах, Бог, Единый Бог, Первый Создатель"},{"id":"c","label":"Царь"},{"id":"d","label":"Миротворец"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْقُدُّوسُ» (Al-Quddus)?', '{"options":[{"id":"a","label":"Аллах, Бог, Единый Бог, Первый Создатель"},{"id":"b","label":"Могущественный"},{"id":"c","label":"Царь"},{"id":"d","label":"Свободный от недостатков"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Свободный от недостатков»?', '{"options":[{"id":"a","label":"ٱلْجَبَّارُ — Al-Jabbar"},{"id":"b","label":"ٱلسَّلَـٰمُ — As-Salam"},{"id":"c","label":"ٱلْقُدُّوسُ — Al-Quddus"},{"id":"d","label":"ٱلرَّحْمَـٰنُ — Ar-Rahman"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلسَّلَـٰمُ» (As-Salam)?', '{"options":[{"id":"a","label":"Миротворец"},{"id":"b","label":"Верный договору"},{"id":"c","label":"Царь"},{"id":"d","label":"Подчиняющий себе"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْمُؤْمِنُ» (Al-Mu''min)?', '{"options":[{"id":"a","label":"Миротворец"},{"id":"b","label":"Верный договору"},{"id":"c","label":"Могучий"},{"id":"d","label":"Милостивый"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Верный договору»?', '{"options":[{"id":"a","label":"ٱلْعَزِيزُ — Al-Aziz"},{"id":"b","label":"ٱلرَّحْمَـٰنُ — Ar-Rahman"},{"id":"c","label":"ٱلْمُؤْمِنُ — Al-Mu''min"},{"id":"d","label":"ٱلْمَـٰلِكُ — Al-Malik"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 10),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْمُهَيْمِنُ» (Al-Muhaymin)?', '{"options":[{"id":"a","label":"Миротворец"},{"id":"b","label":"Могучий"},{"id":"c","label":"Подчиняющий себе"},{"id":"d","label":"Свободный от недостатков"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 11);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = '99 имён · Урок 2 · Имена 11–20'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, '99 имён · Урок 2 · Имена 11–20', 'aqida', 'beginner', 'Детерминированные вопросы по именам Аллаха (из данных приложения)')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْمُتَكَبِّرُ» (Al-Mutakabbir)?', '{"options":[{"id":"a","label":"Дающий блага и пропитание"},{"id":"b","label":"Дарующий"},{"id":"c","label":"Придающий всему форму и облик"},{"id":"d","label":"Превосходящий все творения"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Превосходящий все творения»?', '{"options":[{"id":"a","label":"ٱلْمُتَكَبِّرُ — Al-Mutakabbir"},{"id":"b","label":"ٱلْعَلِيمُ — Al-Alim"},{"id":"c","label":"ٱلْفَتَّاحُ — Al-Fattah"},{"id":"d","label":"ٱلْغَفَّـٰرُ — Al-Ghaffar"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Что означает имя «الخَالِق» (Al-Khaliq)?', '{"options":[{"id":"a","label":"Открывающий врата добра"},{"id":"b","label":"Творец"},{"id":"c","label":"Прощающий"},{"id":"d","label":"Дающий блага и пропитание"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что означает имя «البَارِئ» (Al-Bari)?', '{"options":[{"id":"a","label":"Придающий всему форму и облик"},{"id":"b","label":"Всезнающий"},{"id":"c","label":"Создающий без изъянов"},{"id":"d","label":"Превосходящий все творения"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Создающий без изъянов»?', '{"options":[{"id":"a","label":"ٱلْوَهَّابُ — Al-Wahhab"},{"id":"b","label":"البَارِئ — Al-Bari"},{"id":"c","label":"ٱلْقَهَّـٰرُ — Al-Qahhar"},{"id":"d","label":"ٱلْمُصَوِّرُ — Al-Musawwir"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْمُصَوِّرُ» (Al-Musawwir)?', '{"options":[{"id":"a","label":"Придающий всему форму и облик"},{"id":"b","label":"Дарующий"},{"id":"c","label":"Творец"},{"id":"d","label":"Прощающий"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْغَفَّـٰرُ» (Al-Ghaffar)?', '{"options":[{"id":"a","label":"Прощающий"},{"id":"b","label":"Дающий блага и пропитание"},{"id":"c","label":"Всезнающий"},{"id":"d","label":"Творец"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Прощающий»?', '{"options":[{"id":"a","label":"ٱلْقَهَّـٰرُ — Al-Qahhar"},{"id":"b","label":"ٱلْغَفَّـٰرُ — Al-Ghaffar"},{"id":"c","label":"ٱلْفَتَّاحُ — Al-Fattah"},{"id":"d","label":"ٱلرَّزَّاقُ — Ar-Razzaq"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْقَهَّـٰرُ» (Al-Qahhar)?', '{"options":[{"id":"a","label":"Придающий всему форму и облик"},{"id":"b","label":"Создающий без изъянов"},{"id":"c","label":"Прощающий"},{"id":"d","label":"Господствующий"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْوَهَّابُ» (Al-Wahhab)?', '{"options":[{"id":"a","label":"Всезнающий"},{"id":"b","label":"Создающий без изъянов"},{"id":"c","label":"Дарующий"},{"id":"d","label":"Превосходящий все творения"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Дарующий»?', '{"options":[{"id":"a","label":"الخَالِق — Al-Khaliq"},{"id":"b","label":"ٱلْمُصَوِّرُ — Al-Musawwir"},{"id":"c","label":"ٱلْوَهَّابُ — Al-Wahhab"},{"id":"d","label":"ٱلْغَفَّـٰرُ — Al-Ghaffar"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 10),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلرَّزَّاقُ» (Ar-Razzaq)?', '{"options":[{"id":"a","label":"Дающий блага и пропитание"},{"id":"b","label":"Создающий без изъянов"},{"id":"c","label":"Господствующий"},{"id":"d","label":"Творец"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 11);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = '99 имён · Урок 3 · Имена 21–30'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, '99 имён · Урок 3 · Имена 21–30', 'aqida', 'beginner', 'Детерминированные вопросы по именам Аллаха (из данных приложения)')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْقَابِضُ» (Al-Qabid)?', '{"options":[{"id":"a","label":"Всеслышащий"},{"id":"b","label":"Возвышающий уверовавших"},{"id":"c","label":"Высший судья"},{"id":"d","label":"Забирающий души"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Забирающий души»?', '{"options":[{"id":"a","label":"ٱلْعَدْلُ — Al-Adl"},{"id":"b","label":"ٱلْبَاسِطُ — Al-Basit"},{"id":"c","label":"ٱلْقَابِضُ — Al-Qabid"},{"id":"d","label":"ٱلْحَكَمُ — Al-Hakam"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْبَاسِطُ» (Al-Basit)?', '{"options":[{"id":"a","label":"Всеслышащий"},{"id":"b","label":"Простирающий, расширяющий"},{"id":"c","label":"Забирающий души"},{"id":"d","label":"Справедливый"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْخَافِضُ» (Al-Khafid)?', '{"options":[{"id":"a","label":"Возвышающий уверовавших"},{"id":"b","label":"Простирающий, расширяющий"},{"id":"c","label":"Унижающий неверующих"},{"id":"d","label":"Забирающий души"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Унижающий неверующих»?', '{"options":[{"id":"a","label":"ٱلْحَكَمُ — Al-Hakam"},{"id":"b","label":"ٱلسَّمِيعُ — As-Sami"},{"id":"c","label":"ٱلْخَافِضُ — Al-Khafid"},{"id":"d","label":"ٱلْمُعِزُّ — Al-Mu''izz"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلرَّافِعُ» (Ar-Rafi)?', '{"options":[{"id":"a","label":"Возвышающий уверовавших"},{"id":"b","label":"Унижающий неверующих"},{"id":"c","label":"Всевидящий"},{"id":"d","label":"Всеслышащий"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْمُعِزُّ» (Al-Mu''izz)?', '{"options":[{"id":"a","label":"Принижающий"},{"id":"b","label":"Высший судья"},{"id":"c","label":"Всеслышащий"},{"id":"d","label":"Возвеличиваюший"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Возвеличиваюший»?', '{"options":[{"id":"a","label":"ٱلرَّافِعُ — Ar-Rafi"},{"id":"b","label":"ٱلْمُعِزُّ — Al-Mu''izz"},{"id":"c","label":"ٱلْقَابِضُ — Al-Qabid"},{"id":"d","label":"ٱلْبَصِيرُ — Al-Basir"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْمُذِلُّ» (Al-Mudhill)?', '{"options":[{"id":"a","label":"Высший судья"},{"id":"b","label":"Справедливый"},{"id":"c","label":"Принижающий"},{"id":"d","label":"Всевидящий"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلسَّمِيعُ» (As-Sami)?', '{"options":[{"id":"a","label":"Простирающий, расширяющий"},{"id":"b","label":"Всеслышащий"},{"id":"c","label":"Всевидящий"},{"id":"d","label":"Справедливый"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Всеслышащий»?', '{"options":[{"id":"a","label":"ٱلسَّمِيعُ — As-Sami"},{"id":"b","label":"ٱلْمُذِلُّ — Al-Mudhill"},{"id":"c","label":"ٱلْبَصِيرُ — Al-Basir"},{"id":"d","label":"ٱلْخَافِضُ — Al-Khafid"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 10),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْبَصِيرُ» (Al-Basir)?', '{"options":[{"id":"a","label":"Справедливый"},{"id":"b","label":"Высший судья"},{"id":"c","label":"Всевидящий"},{"id":"d","label":"Всеслышащий"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 11);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = '99 имён · Урок 4 · Имена 31–40'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, '99 имён · Урок 4 · Имена 31–40', 'aqida', 'beginner', 'Детерминированные вопросы по именам Аллаха (из данных приложения)')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Что означает имя «ٱللَّطِيفُ» (Al-Latif)?', '{"options":[{"id":"a","label":"Всеведующий"},{"id":"b","label":"Оказывающий милость"},{"id":"c","label":"Великий"},{"id":"d","label":"Оберегающий"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Оказывающий милость»?', '{"options":[{"id":"a","label":"ٱلْغَفُورُ — Al-Ghafur"},{"id":"b","label":"ٱللَّطِيفُ — Al-Latif"},{"id":"c","label":"ٱلْعَظِيمُ — Al-Azim"},{"id":"d","label":"ٱلْكَبِيرُ — Al-Kabir"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْخَبِيرُ» (Al-Khabir)?', '{"options":[{"id":"a","label":"Всеведующий"},{"id":"b","label":"Величайиший"},{"id":"c","label":"Оказывающий милость"},{"id":"d","label":"Возвышенный"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْحَلِيمُ» (Al-Halim)?', '{"options":[{"id":"a","label":"Великий"},{"id":"b","label":"Всеведующий"},{"id":"c","label":"Возвышенный"},{"id":"d","label":"Снисходительный"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Снисходительный»?', '{"options":[{"id":"a","label":"ٱلْعَظِيمُ — Al-Azim"},{"id":"b","label":"ٱلْحَفِيظُ — Al-Hafiz"},{"id":"c","label":"ٱلْحَلِيمُ — Al-Halim"},{"id":"d","label":"ٱلشَّكُورُ — Ash-Shakur"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْعَظِيمُ» (Al-Azim)?', '{"options":[{"id":"a","label":"Величайиший"},{"id":"b","label":"Вознаграждающий"},{"id":"c","label":"Снисходительный"},{"id":"d","label":"Оберегающий"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْغَفُورُ» (Al-Ghafur)?', '{"options":[{"id":"a","label":"Оберегающий"},{"id":"b","label":"Всепрощающий"},{"id":"c","label":"Всеведующий"},{"id":"d","label":"Великий"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Всепрощающий»?', '{"options":[{"id":"a","label":"ٱلشَّكُورُ — Ash-Shakur"},{"id":"b","label":"ٱلْغَفُورُ — Al-Ghafur"},{"id":"c","label":"ٱلْحَفِيظُ — Al-Hafiz"},{"id":"d","label":"ٱلْعَظِيمُ — Al-Azim"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلشَّكُورُ» (Ash-Shakur)?', '{"options":[{"id":"a","label":"Вознаграждающий"},{"id":"b","label":"Всеведующий"},{"id":"c","label":"Великий"},{"id":"d","label":"Оказывающий милость"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْعَلِيُّ» (Al-Ali)?', '{"options":[{"id":"a","label":"Оказывающий милость"},{"id":"b","label":"Вознаграждающий"},{"id":"c","label":"Всепрощающий"},{"id":"d","label":"Возвышенный"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Возвышенный»?', '{"options":[{"id":"a","label":"ٱلشَّكُورُ — Ash-Shakur"},{"id":"b","label":"ٱلْعَظِيمُ — Al-Azim"},{"id":"c","label":"ٱلْعَلِيُّ — Al-Ali"},{"id":"d","label":"ٱلْحَفِيظُ — Al-Hafiz"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 10),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْكَبِيرُ» (Al-Kabir)?', '{"options":[{"id":"a","label":"Великий"},{"id":"b","label":"Величайиший"},{"id":"c","label":"Оказывающий милость"},{"id":"d","label":"Создатель благ"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 11);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = '99 имён · Урок 5 · Имена 41–50'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, '99 имён · Урок 5 · Имена 41–50', 'aqida', 'beginner', 'Детерминированные вопросы по именам Аллаха (из данных приложения)')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْحَسِيبُ» (Al-Hasib)?', '{"options":[{"id":"a","label":"Принимающий молитвы"},{"id":"b","label":"Берущий отчет"},{"id":"c","label":"Щедрейщий"},{"id":"d","label":"Наблюдающий"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Берущий отчет»?', '{"options":[{"id":"a","label":"ٱلرَّقِيبُ — Ar-Raqib"},{"id":"b","label":"ٱلْحَسِيبُ — Al-Hasib"},{"id":"c","label":"ٱلْجَلِيلُ — Al-Jalil"},{"id":"d","label":"ٱلْمَجِيدُ — Al-Majid"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْجَلِيلُ» (Al-Jalil)?', '{"options":[{"id":"a","label":"Наблюдающий"},{"id":"b","label":"Тот у кого истинное величие"},{"id":"c","label":"Мудрый"},{"id":"d","label":"Любящий"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْكَرِيمُ» (Al-Karim)?', '{"options":[{"id":"a","label":"Тот у кого истинное величие"},{"id":"b","label":"Наблюдающий"},{"id":"c","label":"Самый почетный"},{"id":"d","label":"Щедрейщий"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Щедрейщий»?', '{"options":[{"id":"a","label":"ٱلْكَرِيمُ — Al-Karim"},{"id":"b","label":"ٱلْجَلِيلُ — Al-Jalil"},{"id":"c","label":"ٱلْبَاعِثُ — Al-Ba''ith"},{"id":"d","label":"ٱلْمُجِيبُ — Al-Mujib"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلرَّقِيبُ» (Ar-Raqib)?', '{"options":[{"id":"a","label":"Воскрешающий после смерти"},{"id":"b","label":"Наблюдающий"},{"id":"c","label":"Тот у кого истинное величие"},{"id":"d","label":"Берущий отчет"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْمُجِيبُ» (Al-Mujib)?', '{"options":[{"id":"a","label":"Щедрейщий"},{"id":"b","label":"Наблюдающий"},{"id":"c","label":"Всеобъемлющий"},{"id":"d","label":"Принимающий молитвы"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Принимающий молитвы»?', '{"options":[{"id":"a","label":"ٱلْجَلِيلُ — Al-Jalil"},{"id":"b","label":"ٱلْمُجِيبُ — Al-Mujib"},{"id":"c","label":"ٱلْكَرِيمُ — Al-Karim"},{"id":"d","label":"ٱلْبَاعِثُ — Al-Ba''ith"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْوَٰسِعُ» (Al-Wasi)?', '{"options":[{"id":"a","label":"Всеобъемлющий"},{"id":"b","label":"Тот у кого истинное величие"},{"id":"c","label":"Наблюдающий"},{"id":"d","label":"Любящий"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْحَكِيمُ» (Al-Hakim)?', '{"options":[{"id":"a","label":"Щедрейщий"},{"id":"b","label":"Самый почетный"},{"id":"c","label":"Мудрый"},{"id":"d","label":"Любящий"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Мудрый»?', '{"options":[{"id":"a","label":"ٱلْمَجِيدُ — Al-Majid"},{"id":"b","label":"ٱلْحَكِيمُ — Al-Hakim"},{"id":"c","label":"ٱلْوَدُودُ — Al-Wadud"},{"id":"d","label":"ٱلْوَٰسِعُ — Al-Wasi"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 10),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْوَدُودُ» (Al-Wadud)?', '{"options":[{"id":"a","label":"Мудрый"},{"id":"b","label":"Любящий"},{"id":"c","label":"Всеобъемлющий"},{"id":"d","label":"Самый почетный"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 11);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = '99 имён · Урок 6 · Имена 51–60'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, '99 имён · Урок 6 · Имена 51–60', 'aqida', 'beginner', 'Детерминированные вопросы по именам Аллаха (из данных приложения)')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Что означает имя «ٱلشَّهِيدُ» (Ash-Shahid)?', '{"options":[{"id":"a","label":"Достойный восхваление"},{"id":"b","label":"Все считающий"},{"id":"c","label":"Свидетель всему"},{"id":"d","label":"Создающий"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Свидетель всему»?', '{"options":[{"id":"a","label":"ٱلْمُعِيدُ — Al-Mu''id"},{"id":"b","label":"ٱلْوَلِيُّ — Al-Wali"},{"id":"c","label":"ٱلْقَوِيُّ — Al-Qawiyy"},{"id":"d","label":"ٱلشَّهِيدُ — Ash-Shahid"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْحَقُّ» (Al-Haqq)?', '{"options":[{"id":"a","label":"Создающий"},{"id":"b","label":"Всесильный"},{"id":"c","label":"Истинный"},{"id":"d","label":"Достойный восхваление"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْوَكِيلُ» (Al-Wakil)?', '{"options":[{"id":"a","label":"Создающий"},{"id":"b","label":"Покровитель"},{"id":"c","label":"Истинный"},{"id":"d","label":"Обладатель великой силы"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Покровитель»?', '{"options":[{"id":"a","label":"ٱلْمُحْصِي — Al-Muhsi"},{"id":"b","label":"ٱلْوَكِيلُ — Al-Wakil"},{"id":"c","label":"ٱلْقَوِيُّ — Al-Qawiyy"},{"id":"d","label":"ٱلْحَمِيدُ — Al-Hamid"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْقَوِيُّ» (Al-Qawiyy)?', '{"options":[{"id":"a","label":"Всесильный"},{"id":"b","label":"Создающий"},{"id":"c","label":"Истинный"},{"id":"d","label":"Свидетель всему"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْمَتِينُ» (Al-Matin)?', '{"options":[{"id":"a","label":"Создающий"},{"id":"b","label":"Обладатель великой силы"},{"id":"c","label":"Истинный"},{"id":"d","label":"Помогающий верующим"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Обладатель великой силы»?', '{"options":[{"id":"a","label":"ٱلْوَكِيلُ — Al-Wakil"},{"id":"b","label":"ٱلْمُحْصِي — Al-Muhsi"},{"id":"c","label":"ٱلْمَتِينُ — Al-Matin"},{"id":"d","label":"ٱلْحَقُّ — Al-Haqq"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْوَلِيُّ» (Al-Wali)?', '{"options":[{"id":"a","label":"Помогающий верующим"},{"id":"b","label":"Всесильный"},{"id":"c","label":"Покровитель"},{"id":"d","label":"Свидетель всему"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْحَمِيدُ» (Al-Hamid)?', '{"options":[{"id":"a","label":"Создающий"},{"id":"b","label":"Достойный восхваление"},{"id":"c","label":"Умертвив заново оживляющий"},{"id":"d","label":"Свидетель всему"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Достойный восхваление»?', '{"options":[{"id":"a","label":"ٱلْمُعِيدُ — Al-Mu''id"},{"id":"b","label":"ٱلْوَكِيلُ — Al-Wakil"},{"id":"c","label":"ٱلشَّهِيدُ — Ash-Shahid"},{"id":"d","label":"ٱلْحَمِيدُ — Al-Hamid"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 10),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْمُحْصِي» (Al-Muhsi)?', '{"options":[{"id":"a","label":"Все считающий"},{"id":"b","label":"Умертвив заново оживляющий"},{"id":"c","label":"Обладатель великой силы"},{"id":"d","label":"Свидетель всему"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 11);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = '99 имён · Урок 7 · Имена 61–70'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, '99 имён · Урок 7 · Имена 61–70', 'aqida', 'beginner', 'Детерминированные вопросы по именам Аллаха (из данных приложения)')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْمُحْيِي» (Al-Muhyi)?', '{"options":[{"id":"a","label":"Единственный"},{"id":"b","label":"Вершащий то что пожелает"},{"id":"c","label":"Воскрешающий, дающий жизнь"},{"id":"d","label":"Совершенный"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Воскрешающий, дающий жизнь»?', '{"options":[{"id":"a","label":"ٱلْمَاجِدُ — Al-Majid"},{"id":"b","label":"ٱلصَّمَدُ — As-Samad"},{"id":"c","label":"ٱلْمُحْيِي — Al-Muhyi"},{"id":"d","label":"ٱلْحَيُّ — Al-Hayy"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْمُمِيتُ» (Al-Mumit)?', '{"options":[{"id":"a","label":"Вершащий то что пожелает"},{"id":"b","label":"Вечно живой"},{"id":"c","label":"Единственный"},{"id":"d","label":"Умерщвляющий"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْحَيُّ» (Al-Hayy)?', '{"options":[{"id":"a","label":"Совершенный"},{"id":"b","label":"Вечно живой"},{"id":"c","label":"Воскрешающий, дающий жизнь"},{"id":"d","label":"Единственный"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Вечно живой»?', '{"options":[{"id":"a","label":"ٱلْوَاحِدُ — Al-Wahid"},{"id":"b","label":"ٱلْحَيُّ — Al-Hayy"},{"id":"c","label":"ٱلْمُحْيِي — Al-Muhyi"},{"id":"d","label":"ٱلْوَاجِدُ — Al-Wajid"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْقَيُّومُ» (Al-Qayyum)?', '{"options":[{"id":"a","label":"Единственный"},{"id":"b","label":"Совершенный"},{"id":"c","label":"Самостоятельный"},{"id":"d","label":"Умерщвляющий"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْوَاجِدُ» (Al-Wajid)?', '{"options":[{"id":"a","label":"Вечно живой"},{"id":"b","label":"Совершенный"},{"id":"c","label":"Вершащий то что пожелает"},{"id":"d","label":"Самодостаточный"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Вершащий то что пожелает»?', '{"options":[{"id":"a","label":"ٱلْقَيُّومُ — Al-Qayyum"},{"id":"b","label":"ٱلْوَاجِدُ — Al-Wajid"},{"id":"c","label":"ٱلصَّمَدُ — As-Samad"},{"id":"d","label":"ٱلْوَاحِدُ — Al-Wahid"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْمَاجِدُ» (Al-Majid)?', '{"options":[{"id":"a","label":"Единый"},{"id":"b","label":"Вечно живой"},{"id":"c","label":"Совершенный"},{"id":"d","label":"Вершащий то что пожелает"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْوَاحِدُ» (Al-Wahid)?', '{"options":[{"id":"a","label":"Вершащий то что пожелает"},{"id":"b","label":"Самостоятельный"},{"id":"c","label":"Вечно живой"},{"id":"d","label":"Единый"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Единый»?', '{"options":[{"id":"a","label":"ٱلأحَدٌ — Al-Ahad"},{"id":"b","label":"ٱلْقَيُّومُ — Al-Qayyum"},{"id":"c","label":"ٱلْوَاحِدُ — Al-Wahid"},{"id":"d","label":"ٱلْمُحْيِي — Al-Muhyi"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 10),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلأحَدٌ» (Al-Ahad)?', '{"options":[{"id":"a","label":"Единственный"},{"id":"b","label":"Всемогущий"},{"id":"c","label":"Самостоятельный"},{"id":"d","label":"Совершенный"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 11);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = '99 имён · Урок 8 · Имена 71–80'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, '99 имён · Урок 8 · Имена 71–80', 'aqida', 'beginner', 'Детерминированные вопросы по именам Аллаха (из данных приложения)')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْمُقْتَدِرُ» (Al-Muqtadir)?', '{"options":[{"id":"a","label":"Правящий властвующий над всем"},{"id":"b","label":"Отодвигающий назад"},{"id":"c","label":"Безначальный-первый"},{"id":"d","label":"Могущественный"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Могущественный»?', '{"options":[{"id":"a","label":"ٱلْمُؤَخِّرُ — Al-Mu''akhkhir"},{"id":"b","label":"ٱلْمُقْتَدِرُ — Al-Muqtadir"},{"id":"c","label":"ٱلْوَالِي — Al-Wali"},{"id":"d","label":"ٱلْمُتَعَالِي — Al-Muta''ali"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْمُقَدِّمُ» (Al-Muqaddim)?', '{"options":[{"id":"a","label":"Выдвигающий вперед кого пожелает"},{"id":"b","label":"Явный"},{"id":"c","label":"Безначальный-первый"},{"id":"d","label":"Могущественный"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْمُؤَخِّرُ» (Al-Mu''akhkhir)?', '{"options":[{"id":"a","label":"Отодвигающий назад"},{"id":"b","label":"Скрытый"},{"id":"c","label":"Могущественный"},{"id":"d","label":"Безначальный-первый"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Отодвигающий назад»?', '{"options":[{"id":"a","label":"ٱلْمُقَدِّمُ — Al-Muqaddim"},{"id":"b","label":"ٱلْبَرُّ — Al-Barr"},{"id":"c","label":"ٱلْمُؤَخِّرُ — Al-Mu''akhkhir"},{"id":"d","label":"ٱلْمُتَعَالِي — Al-Muta''ali"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْأَوَّلُ» (Al-Awwal)?', '{"options":[{"id":"a","label":"Могущественный"},{"id":"b","label":"Отодвигающий назад"},{"id":"c","label":"Безначальный-первый"},{"id":"d","label":"Выдвигающий вперед кого пожелает"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْآخِرُ» (Al-Akhir)?', '{"options":[{"id":"a","label":"Явный"},{"id":"b","label":"Могущественный"},{"id":"c","label":"Бесконечный"},{"id":"d","label":"Безначальный-первый"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Бесконечный»?', '{"options":[{"id":"a","label":"ٱلْآخِرُ — Al-Akhir"},{"id":"b","label":"ٱلْمُتَعَالِي — Al-Muta''ali"},{"id":"c","label":"ٱلْمُقْتَدِرُ — Al-Muqtadir"},{"id":"d","label":"ٱلْوَالِي — Al-Wali"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلظَّاهِرُ» (Az-Zahir)?', '{"options":[{"id":"a","label":"Высочайший"},{"id":"b","label":"Выдвигающий вперед кого пожелает"},{"id":"c","label":"Явный"},{"id":"d","label":"Скрытый"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْبَاطِنُ» (Al-Batin)?', '{"options":[{"id":"a","label":"Скрытый"},{"id":"b","label":"Выдвигающий вперед кого пожелает"},{"id":"c","label":"Высочайший"},{"id":"d","label":"Правящий властвующий над всем"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Скрытый»?', '{"options":[{"id":"a","label":"ٱلْمُقَدِّمُ — Al-Muqaddim"},{"id":"b","label":"ٱلْمُتَعَالِي — Al-Muta''ali"},{"id":"c","label":"ٱلْبَاطِنُ — Al-Batin"},{"id":"d","label":"ٱلْمُؤَخِّرُ — Al-Mu''akhkhir"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 10),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْوَالِي» (Al-Wali)?', '{"options":[{"id":"a","label":"Добродетельный, Благостный"},{"id":"b","label":"Правящий властвующий над всем"},{"id":"c","label":"Выдвигающий вперед кого пожелает"},{"id":"d","label":"Скрытый"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 11);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = '99 имён · Урок 9 · Имена 81–90'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, '99 имён · Урок 9 · Имена 81–90', 'aqida', 'beginner', 'Детерминированные вопросы по именам Аллаха (из данных приложения)')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Что означает имя «ٱلتَّوَّابُ» (At-Tawwab)?', '{"options":[{"id":"a","label":"Обогощающий"},{"id":"b","label":"Принимающий покаяния"},{"id":"c","label":"Богатый, не нуждающийся ни в ком"},{"id":"d","label":"Прощающий"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Принимающий покаяния»?', '{"options":[{"id":"a","label":"مَالِكُ الْمُلْكِ — Malik al-Mulk"},{"id":"b","label":"ٱلْجَامِعُ — Al-Jami"},{"id":"c","label":"ٱلْمُقْسِطُ — Al-Muqsit"},{"id":"d","label":"ٱلتَّوَّابُ — At-Tawwab"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْمُنْتَقِمُ» (Al-Muntaqim)?', '{"options":[{"id":"a","label":"Прощающий"},{"id":"b","label":"Богатый, не нуждающийся ни в ком"},{"id":"c","label":"Обогощающий"},{"id":"d","label":"Воздающий не покорным"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْعَفُوُّ» (Al-Afuww)?', '{"options":[{"id":"a","label":"Обладатель особого величия и почёта"},{"id":"b","label":"Прощающий"},{"id":"c","label":"Собирающий"},{"id":"d","label":"Царь царей"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلرَّءُوفُ» (Ar-Ra''uf)?', '{"options":[{"id":"a","label":"Богатый, не нуждающийся ни в ком"},{"id":"b","label":"Сострадательный"},{"id":"c","label":"Принимающий покаяния"},{"id":"d","label":"Обладатель особого величия и почёта"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что означает имя «مَالِكُ الْمُلْكِ» (Malik al-Mulk)?', '{"options":[{"id":"a","label":"Богатый, не нуждающийся ни в ком"},{"id":"b","label":"Обогощающий"},{"id":"c","label":"Справедливый, праведный"},{"id":"d","label":"Царь царей"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Царь царей»?', '{"options":[{"id":"a","label":"ٱلْعَفُوُّ — Al-Afuww"},{"id":"b","label":"مَالِكُ الْمُلْكِ — Malik al-Mulk"},{"id":"c","label":"ٱلْمُنْتَقِمُ — Al-Muntaqim"},{"id":"d","label":"ٱلتَّوَّابُ — At-Tawwab"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Что означает имя «ذُو ٱلْجَلَـٰلِ وَٱلْإِكْرَامِ» (Dhul-Jalali wal-Ikram)?', '{"options":[{"id":"a","label":"Прощающий"},{"id":"b","label":"Воздающий не покорным"},{"id":"c","label":"Богатый, не нуждающийся ни в ком"},{"id":"d","label":"Обладатель особого величия и почёта"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْمُقْسِطُ» (Al-Muqsit)?', '{"options":[{"id":"a","label":"Воздающий не покорным"},{"id":"b","label":"Сострадательный"},{"id":"c","label":"Обладатель особого величия и почёта"},{"id":"d","label":"Справедливый, праведный"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Справедливый, праведный»?', '{"options":[{"id":"a","label":"ٱلْمُغْنِي — Al-Mughni"},{"id":"b","label":"ٱلْمُقْسِطُ — Al-Muqsit"},{"id":"c","label":"ٱلْجَامِعُ — Al-Jami"},{"id":"d","label":"ذُو ٱلْجَلَـٰلِ وَٱلْإِكْرَامِ — Dhul-Jalali wal-Ikram"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْجَامِعُ» (Al-Jami)?', '{"options":[{"id":"a","label":"Сострадательный"},{"id":"b","label":"Обогощающий"},{"id":"c","label":"Воздающий не покорным"},{"id":"d","label":"Собирающий"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 10),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْغَنِيُّ» (Al-Ghani)?', '{"options":[{"id":"a","label":"Прощающий"},{"id":"b","label":"Богатый, не нуждающийся ни в ком"},{"id":"c","label":"Принимающий покаяния"},{"id":"d","label":"Воздающий не покорным"}],"correct_option_id":"b"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 11);
    end if;
    if not exists (
      select 1 from public.academy_lessons l
      where l.owner_id = t.user_id and l.title = '99 имён · Урок 10 · Имена 91–99'
    ) then
      insert into public.academy_lessons (owner_id, title, subject, level, description)
      values (t.user_id, '99 имён · Урок 10 · Имена 91–99', 'aqida', 'beginner', 'Детерминированные вопросы по именам Аллаха (из данных приложения)')
      returning id into lesson_id;
      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْمَانِعُ» (Al-Mani)?', '{"options":[{"id":"a","label":"Удерживающий, запрещающий"},{"id":"b","label":"Высший наследник"},{"id":"c","label":"Создающий нас лучшим образом"},{"id":"d","label":"Направляющий на правильный путь"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 0),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Удерживающий, запрещающий»?', '{"options":[{"id":"a","label":"ٱلصَّبُورُ — As-Sabur"},{"id":"b","label":"ٱلْوَارِثُ — Al-Warith"},{"id":"c","label":"ٱلْمَانِعُ — Al-Mani"},{"id":"d","label":"ٱلضَّارُّ — Ad-Darr"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 1),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلضَّارُّ» (Ad-Darr)?', '{"options":[{"id":"a","label":"Лишающий своих благ тех кого хочет"},{"id":"b","label":"Высший наследник"},{"id":"c","label":"Направляющий на путь истины"},{"id":"d","label":"Дарующий свет веры"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 2),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلنَّافِعُ» (An-Nafi)?', '{"options":[{"id":"a","label":"Создающий нас лучшим образом"},{"id":"b","label":"Направляющий на правильный путь"},{"id":"c","label":"Приносящий пользы тому кому он хочет"},{"id":"d","label":"Терпеливый"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 3),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Приносящий пользы тому кому он хочет»?', '{"options":[{"id":"a","label":"ٱلنُّورُ — An-Nur"},{"id":"b","label":"ٱلصَّبُورُ — As-Sabur"},{"id":"c","label":"ٱلنَّافِعُ — An-Nafi"},{"id":"d","label":"ٱلْبَدِيعُ — Al-Badi"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 4),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلنُّورُ» (An-Nur)?', '{"options":[{"id":"a","label":"Удерживающий, запрещающий"},{"id":"b","label":"Лишающий своих благ тех кого хочет"},{"id":"c","label":"Создающий нас лучшим образом"},{"id":"d","label":"Дарующий свет веры"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 5),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْهَادِي» (Al-Hadi)?', '{"options":[{"id":"a","label":"Приносящий пользы тому кому он хочет"},{"id":"b","label":"Направляющий на правильный путь"},{"id":"c","label":"Направляющий на путь истины"},{"id":"d","label":"Вечный, тот у кого нет конца"}],"correct_option_id":"c"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 6),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Направляющий на путь истины»?', '{"options":[{"id":"a","label":"ٱلْبَدِيعُ — Al-Badi"},{"id":"b","label":"ٱلْمَانِعُ — Al-Mani"},{"id":"c","label":"ٱلضَّارُّ — Ad-Darr"},{"id":"d","label":"ٱلْهَادِي — Al-Hadi"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 7),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْبَدِيعُ» (Al-Badi)?', '{"options":[{"id":"a","label":"Создающий нас лучшим образом"},{"id":"b","label":"Терпеливый"},{"id":"c","label":"Высший наследник"},{"id":"d","label":"Дарующий свет веры"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 8),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْبَاقِي» (Al-Baqi)?', '{"options":[{"id":"a","label":"Дарующий свет веры"},{"id":"b","label":"Приносящий пользы тому кому он хочет"},{"id":"c","label":"Лишающий своих благ тех кого хочет"},{"id":"d","label":"Вечный, тот у кого нет конца"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 9),
      (lesson_id, 'single_choice', 'Какое имя Аллаха означает «Вечный, тот у кого нет конца»?', '{"options":[{"id":"a","label":"ٱلضَّارُّ — Ad-Darr"},{"id":"b","label":"ٱلْهَادِي — Al-Hadi"},{"id":"c","label":"ٱلنُّورُ — An-Nur"},{"id":"d","label":"ٱلْبَاقِي — Al-Baqi"}],"correct_option_id":"d"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 10),
      (lesson_id, 'single_choice', 'Что означает имя «ٱلْوَارِثُ» (Al-Warith)?', '{"options":[{"id":"a","label":"Высший наследник"},{"id":"b","label":"Направляющий на правильный путь"},{"id":"c","label":"Удерживающий, запрещающий"},{"id":"d","label":"Направляющий на путь истины"}],"correct_option_id":"a"}'::jsonb, '{"method":"auto","points":1}'::jsonb, 11);
    end if;
  end loop;
end $$;
