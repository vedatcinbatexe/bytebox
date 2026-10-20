// No React here: the root layout (a server component) imports this

export const THEME_STORAGE_KEY = 'bytebox:theme';

// Runs before the page is painted, so there's no flash of the wrong theme
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t)document.documentElement.dataset.theme=t}catch(e){}`;
