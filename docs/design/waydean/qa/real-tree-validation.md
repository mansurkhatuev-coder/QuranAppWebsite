# Waydean «Древо» — локальная проверка реальных данных

Область: локальная проверка `drewo/family-tree.json` и модели read-only preview. В отчёт выведены только агрегаты: без имён, идентификаторов, фотографий, ключей и персональных записей. Данные не отправлялись наружу; production не открывался.

## Результаты

- 157 человек, 14 поколений. Самое широкое — 13-е: 40 человек. Максимум прямых детей у одного человека — 8.
- У 145 человек отсутствует год рождения, у 154 — год смерти. Некорректных значений года нет.
- Ключ фото есть у одного человека, у остальных 156 его нет.
- Нет повторяющихся нормализованных ID, пустых/некорректных ID, неправильных узлов или формата `sons`. Родство в этом файле задано вложенными `sons`; отдельного поля ID родителя для независимой сверки нет.
- Максимальная длина в исходных данных: ID — 26 символов, имя — 14, ключ фото — 13.
- Целевая проверка модели прошла: 3 сценария, 0 ошибок. Проверяются развёртывание дерева, отказ от повторяющегося/пустого ID и загрузка текущего набора.

## Как повторить

Из корня репозитория. Команда обходит локальное дерево и выводит только агрегаты:

```powershell
@'
import fs from 'node:fs';
const root=JSON.parse(fs.readFileSync('drewo/family-tree.json','utf8'));
const rows=[], ids=new Set(), dup=[], bad=[]; const levels=new Map();
const stack=[{node:root,parent:null,generation:1}]; let invalidNodes=0, nonArraySons=0, invalidParentLinks=0;
while(stack.length){const {node,parent,generation}=stack.pop();if(!node||typeof node!=='object'||Array.isArray(node)){invalidNodes++;continue;}const id=String(node.id??'').trim();if(!id)bad.push(1);if(ids.has(id))dup.push(1);ids.add(id);const sons=Array.isArray(node.sons)?node.sons:[];if(node.sons!=null&&!Array.isArray(node.sons))nonArraySons++;rows.push({node,id,parent,generation,children:sons.length});levels.set(generation,(levels.get(generation)||0)+1);for(let i=sons.length-1;i>=0;i--)stack.push({node:sons[i],parent:id,generation:generation+1});}
invalidParentLinks=rows.filter(r=>r.parent!==null&&!ids.has(r.parent)).length;
const max=f=>Math.max(0,...rows.map(f));const year=v=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):'invalid';
console.log(JSON.stringify({people:rows.length,generations:levels.size,maxGeneration:Math.max(...levels.keys()),breadthByGeneration:Object.fromEntries([...levels].sort((a,b)=>a[0]-b[0])),maxDirectChildren:max(r=>r.children),missingBirthYears:rows.filter(r=>year(r.node.born)===null).length,missingDeathYears:rows.filter(r=>year(r.node.died)===null).length,invalidYearValues:rows.filter(r=>year(r.node.born)==='invalid'||year(r.node.died)==='invalid').length,peopleWithPhoto:rows.filter(r=>r.node.photo!=null&&r.node.photo!==false&&r.node.photo!==''&&String(r.node.photo).trim()).length,missingPhotos:rows.filter(r=>!(r.node.photo!=null&&r.node.photo!==false&&r.node.photo!==''&&String(r.node.photo).trim())).length,duplicateNormalizedIds:dup.length,malformedIds:bad.length,invalidNodes,nonArraySons,invalidParentLinks,maxIdLength:max(r=>r.id.length),maxNameLength:max(r=>String(r.node.name??'').length),maxPhotoKeyLength:max(r=>String(r.node.photo??'').length)}));
'@ | node --input-type=module
```

Целевая проверка модели:

```powershell
node --test drewo/waydean-preview-model.test.mjs
```

## Граница проверки и визуальные случаи

Это структурные показатели и быстрая проверка модели. Здесь нет замера рендера, browser profile, памяти, задержки жестов или слабого телефона. Время запуска unit test не является показателем скорости интерфейса.

Случаи для локального screenshot/interaction review:

- Узкий телефон и путь до 14-го поколения: подписи, профиль, управление и нижняя навигация не должны пересекаться или обрезаться.
- Широкое 13-е поколение и плотные 12–14-е: расстояния между карточками, линии, pan, zoom и подгонка.
- Человек без лет и фото, затем единственная запись с фото: пустые поля, силуэт, высота профиля.
- Поиск глубокой ветви, выбор, режим ветви, мини-карта, подгонка, масштаб и фильтры: выбранный человек остаётся доступен на сенсорном экране.
- Сброс фильтра из пустого результата, фокус клавиатуры и видимое выделение на desktop.
