const demoPeople = [
  { id: "p01", name: "Персона 01", born: 2100, died: 2168, gender: "male", generation: 1, parent: null, branch: "north", place: "Сектор А", note: "Синтетическая запись 01.", photo: "../assets/demo/waydean-demo-elder-portrait.jpg" },
  { id: "p02", name: "Персона 02", born: 2132, died: 2197, gender: "male", generation: 2, parent: "p01", branch: "north-west", place: "Сектор Б" },
  { id: "p03", name: "Персона 03", born: 2137, died: 2204, gender: "male", generation: 2, parent: "p01", branch: "south", place: "Сектор В", photo: "../assets/demo/waydean-demo-middle-aged-portrait.jpg" },
  { id: "p04", name: "Персона 04", born: 2138, died: 2202, gender: "female", generation: 2, parent: "p01", branch: "north-east", place: "Сектор Г" },
  { id: "p05", name: "Персона 05", born: 2166, died: 2230, gender: "male", generation: 3, parent: "p02", branch: "north-east", place: "Сектор Д" },
  { id: "p06", name: "Персона 06", born: 2170, died: 2238, gender: "female", generation: 3, parent: "p03", branch: "south", place: "Сектор Е", note: "Синтетическая запись 06." },
  { id: "p07", name: "Персона 07", born: 2175, died: 2241, gender: "male", generation: 3, parent: "p04", branch: "north-east", place: "Сектор Ж" },
  { id: "p08", name: "Персона 08", born: 2201, died: 2268, gender: "female", generation: 4, parent: "p05", branch: "north-west", place: "Сектор З" },
  { id: "p09", name: "Персона 06", born: 2204, died: 2269, gender: "male", generation: 4, parent: "p06", branch: "south", place: "Сектор И" },
  { id: "p10", name: "Персона 10", born: 2208, died: 2271, gender: "female", generation: 4, parent: "p07", branch: "north-east", place: "Сектор К" },
  { id: "p11", name: "Демо-персона с длинной подписью", born: 2236, died: null, gender: "male", generation: 5, parent: "p10", branch: "south-east", place: "Сектор Л" },
  { id: "p12", name: "Персона 12", born: 2179, died: 2250, gender: "female", generation: 3, parent: "p02", branch: "north-west", place: "Сектор М" }
];

export const PROTOTYPE_PEOPLE = Object.freeze(demoPeople.map(person => Object.freeze({ ...person, hasPhoto: Boolean(person.photo) })));
