import {settlements} from './settlements.mjs';
import {rivers} from './rivers.mjs';
const legacyTeipIds=Object.freeze({
 'nokhch:Беной':'benoy','nokhch:Аллерой':'alleroi','nokhch:Гендаргеной':'gendargenoy','nokhch:Сонтарой':'tsent',
 'cheber:Хой':'khoi','cheber:Макажой':'makazhoi','cheber:Кезеной':'kezenoi',
 'sharoi:Химой':'khimoi','sharoi:Кенхой':'kenkhoi','sharoi:Хакмадой':'khakmadoi',
 'shatoi:Варандой':'varand','shatoi:Вашиндарой':'washand',
});
const transliteration=Object.freeze({а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'});
const teipId=(groupId,name)=>legacyTeipIds[`${groupId}:${name}`]??`${groupId}-${Array.from(name.toLocaleLowerCase('ru')).map(char=>transliteration[char]??char).join('').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`;
const sourceTeips=(groupId,names)=>names.map(name=>({id:teipId(groupId,name),name,status:legacyTeipIds[`${groupId}:${name}`]&&['benoy','alleroi','gendargenoy'].includes(legacyTeipIds[`${groupId}:${name}`])?'user-provided':'source-listed'}));
// Names are transcribed from a public list; memberships remain provisional pending local review.
export const groups=[
 {id:'akki',name:'Аккий',subtitle:'Названия и связи на проверке',center:[45.24,43.02],teips:sourceTeips('akki',['Барчахой','Вяппий','Жевой','Зогой','Ноккхой','Пхарчахой','Пхарчой'])},
 {id:'melkhiy',name:'Мелхий',subtitle:'Названия и связи на проверке',center:null,teips:sourceTeips('melkhiy',['Амхой-Бястий','Амхой','Бястий','Барчахой','Бенастхой','Джархой','Италчхой','Камалхой','Кеганхой','Коратхой','Меший','Саканхой','Тератхой','Чархой','Эрхой','Юеганхой'])},
 {id:'nokhch',name:'Нохчмахкахой',subtitle:'Названия и связи на проверке',center:[46.12,43.08],teips:sourceTeips('nokhch',['Аллерой','Айткхалой','Белгатой','Беной','Билттой','Гордалой','Гендаргеной','Гуной','Даттыхой','Дышни','Зандакъой','Ихирхой','Ишхой','Курчалой','Сесанхой','Сингалхой','Харачой','Сонтарой','Чартой','Чермой','Ширди','Шуоной','Эгашбатой','Элистанжхой','Энакхалой','Энганой','Эрсеной','Ялхой'])},
 {id:'orst',name:'Орстхой',subtitle:'Названия и связи на проверке',center:null,legacyDemoCenter:[45.12,43.15],geographyStatus:'unverified',teips:sourceTeips('orst',['Алхой','Андалой','Белхарой','Бокой','Булгучхой','Виелха-некъи','ГIарчой','Галай','Гандалой','Мержой','Мужахой','Мужгахой','Оьргхой','Фергхой','Хевхарай','Хьевхахарой','Цечой'])},
 {id:'terloy',name:'Терлой',subtitle:'Названия и связи на проверке',center:null,teips:sourceTeips('terloy',['Бавлой','Бешни','Жерахой','Кенахой','Мацархой','Никарой','Ошний','Санахой','Шюидий','Элтпархой'])},
 {id:'chantiy',name:'Чантий',subtitle:'Названия и связи на проверке',center:null,teips:sourceTeips('chantiy',['Бугарой','Дерахой','Дышни','Кхокадой','Хачарой','Хилдехарой'])},
 {id:'cheber',name:'Чебарлой',subtitle:'Названия и связи на проверке',center:[46.04,42.76],teips:sourceTeips('cheber',['Арстхой','Ачелой','Басой','Бегачерхой','Босой','Буни','Гулатхой','Дай','Желашкхой','Зуьрхой','Ихарой','Кезеной','Кири','Кулой','Лашкарой','Макажой','Нижелой','Нохчи-келой','Нуйхой','Осхарой','Ригахой','Садой','Салбюрой','Сандахой','Сиккхой','Сирхой','Тундухой','Харкалой','Хиндой','Хой','Цикарой','Чебяхкинхой','Черемахкхой'])},
 {id:'sharoi',name:'Шарой',subtitle:'Названия и связи на проверке',center:[45.83,42.68],teips:sourceTeips('sharoi',['Бути','Дунархой','Жогалдой','Икъарой','Качехой','Кевасхой','Кинхой','Кири','Мазухой','Серчихой','Хашалхой','Химой','Хиндухой','Хихой','Хуландой','Хьакмадой','Чейрой','Шикарой','Цеси'])},
 {id:'shatoi',name:'Шатой',subtitle:'Названия и связи на проверке',center:[45.69,42.88],teips:sourceTeips('shatoi',['Варандой','Вашиндарой','Гаттой','Горгачхой','Дехестой','Келой','Мускулхой','Мяршой','Нихалой','Памятой','Рядухой','Саной','Саттой','Тумсой','Урдюхой','Хаккой','Халкелой','Харсеной'])},
].map(g=>({...g,status:'draft-demo'}));

// Positions are approximate settlement-level locations for visual evaluation, not a travel guide.
export const sites=[
 {id:'sharoi-complex',name:'Шарой',fullName:'Шаройский башенный комплекс',area:'Шаройский район',center:[45.826,42.674],kind:'Башенный комплекс',source:'https://argmz.ru/',group:'sharoi',description:'Каменная архитектура горной Чечни. Карточка показывает, как будут собраны история места, фотографии, источники и связанные родословные.'},
 {id:'khoi-complex',name:'Хой',fullName:'Хойский историко-архитектурный комплекс',area:'Веденский район',center:[46.147,42.771],kind:'Историческое селение',source:'https://argmz.ru/',group:'cheber',description:'Место, в котором история возвращает себе голос. В будущем здесь появятся проверенные сведения о комплексе и ссылки на материалы хранителей.'},
 {id:'ushkaloi',name:'Ушкалой',fullName:'Ушкалойские башни',area:'Итум-Калинский район',center:[45.566,42.87],kind:'Башенный комплекс',source:'https://argmz.ru/',group:'shatoi',description:'Карточка архитектурного памятника: источник, сохранность, уточнённая география и история исследований. Координаты в концепте приблизительные.'},
 {id:'nikaroi',name:'Никарой',fullName:'Никаройский башенный комплекс',area:'Итум-Калинский район',center:[45.53,42.755],kind:'Башенный комплекс',source:'https://argmz.ru/',group:null,description:'Образец карточки места. Принадлежность к роду или тейпу появится только после проверки источников.'},
 {id:'phakoch',name:'Пхакоч',fullName:'Историко-архитектурный комплекс «Пхакоч»',area:'Итум-Калинский район',center:[45.577,42.731],kind:'Крепостной комплекс',source:'https://argmz.ru/',group:null,description:'Образец того, как музейные и архивные материалы могут быть связаны с географией. Точка предназначена для оценки интерфейса.'}
].map(s=>({...s,coordinateAccuracy:'approximate',catalogStatus:'draft-demo'}));
export function searchCatalog(query){
 const q=query.trim().toLocaleLowerCase('ru');
 if(!q)return [];
 return [...groups.map(g=>({type:'Тухум',id:g.id,label:g.name,group:g.id})),...groups.flatMap(g=>g.teips.map(t=>({type:'Тейп',id:t.id,label:t.name,group:g.id}))),...sites.map(s=>({type:'Место',id:s.id,label:s.fullName})),...settlements.map(s=>({type:'Город',id:s.id,label:s.name})),...rivers.map(r=>({type:'Река',id:r.id,label:r.name}))].filter(x=>x.label.toLocaleLowerCase('ru').includes(q)).slice(0,8);
}
