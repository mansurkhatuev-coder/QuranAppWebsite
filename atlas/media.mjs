export const landmarkMedia={
 'sharoi-complex':{
  src:'./assets/landmarks/sharoy-complex-generated.jpg',
  full:'./assets/landmarks/sharoi-complex-1536.webp',
  webpSrcset:'./assets/landmarks/sharoi-complex-480.webp 480w, ./assets/landmarks/sharoi-complex-960.webp 960w, ./assets/landmarks/sharoi-complex-1536.webp 1536w',
  alt:'Башенные и жилые постройки Шаройского комплекса на фоне гор.',
  focalPoint:'52% 56%',width:1536,height:1024
 },
 'khoi-complex':{
  src:'./assets/landmarks/khoy-complex-generated.jpg',
  full:'./assets/landmarks/khoi-complex-1536.webp',
  webpSrcset:'./assets/landmarks/khoi-complex-480.webp 480w, ./assets/landmarks/khoi-complex-960.webp 960w, ./assets/landmarks/khoi-complex-1536.webp 1536w',
  alt:'Террасное каменное поселение Хой в горном ущелье.',
  focalPoint:'52% 58%',width:1536,height:1024
 },
 'ushkaloi':{
  src:'./assets/landmarks/ushkaloy-towers-generated.jpg',
  full:'./assets/landmarks/ushkaloi-1536.webp',
  webpSrcset:'./assets/landmarks/ushkaloi-480.webp 480w, ./assets/landmarks/ushkaloi-960.webp 960w, ./assets/landmarks/ushkaloi-1536.webp 1536w',
  alt:'Ушкалойские башни в нише скалы над рекой Аргун.',
  focalPoint:'50% 56%',width:1536,height:1024
 },
 'nikaroi':{
  src:'./assets/landmarks/nikaroy-tower-generated.jpg',
  full:'./assets/landmarks/nikaroi-1536.webp',
  webpSrcset:'./assets/landmarks/nikaroi-480.webp 480w, ./assets/landmarks/nikaroi-960.webp 960w, ./assets/landmarks/nikaroi-1536.webp 1536w',
  alt:'Боевая башня и каменные руины Никароя среди гор.',
  focalPoint:'50% 52%',width:1536,height:1024
 },
 'phakoch':{
  src:'./assets/landmarks/phakoch-complex-generated.jpg',
  full:'./assets/landmarks/phakoch-1536.webp',
  webpSrcset:'./assets/landmarks/phakoch-480.webp 480w, ./assets/landmarks/phakoch-960.webp 960w, ./assets/landmarks/phakoch-1536.webp 1536w',
  alt:'Каменная стена и башня замкового комплекса Пхакоч.',
  focalPoint:'50% 54%',width:1536,height:1024
 }
};

export function getPlaceMedia(placeId){return landmarkMedia[placeId]??null;}
export function imageFor(media){return media?.src??null;}
