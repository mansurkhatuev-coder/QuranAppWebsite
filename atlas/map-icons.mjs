const shapes={
 ushkaloi:'<path d="M4 20V8l3-3 3 3v12M14 20V8l3-3 3 3v12M2 20h20M6 11h2m-2 4h2m8-4h2m-2 4h2M10 17h4"/>',
 phakoch:'<path d="M3 20V7h4v4h10V7h4v13H3ZM3 7V4m4 3V4m10 3V4m4 3V4M10 20v-5h4v5M5 14v2m14-2v2"/>',
 'sharoi-complex':'<path d="M2 20h20M3 20V10l3-3 3 3v10M9 20V6l3-4 3 4v14M15 20v-9l3-3 3 3v9M5 13h2m-2 3h2m4-8h2m-2 4h2m-2 4h2m4-2h2"/>',
 nikaroi:'<path d="M5 20V7l4-5 4 5v13M13 20V11l3-4 3 4v9M3 20h18M8 7h2m-2 4h2m-2 4h2m5-2h2m-2 3h2"/>',
 'khoi-complex':'<path d="M2 20h20M3 20v-7l4-4 4 4v7M13 20V6l3-4 3 4v14M5 15h3m-3 3h3m6-10h3m-3 4h3m-3 4h3M2 13h10"/>',
};
export function landmarkIcon(id){
 return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[id]??shapes.nikaroi}</svg>`;
}
