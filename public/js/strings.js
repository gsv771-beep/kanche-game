// The opponent's voice. Tied to events, never random -- a line that does not match what just
// happened is worse than silence. Three characters, three registers.
export const VOCAB = {
  marble: ['kancha', 'goli', 'bante', 'lakhoti', 'golli gundu'],
  skins: { doodh: 'Doodh', kanch: 'Kanch', neeli: 'Neeli', lakhoti: 'Lakhoti', steel: 'Steel' },
};

const L = {
  chotu: {
    win:    ['Arre wah! Dekha?', 'Ho gaya! Ho gaya!', 'Mummy ko batana hai.'],
    big:    ['DO NIKAL GAYE!', 'Itne saare!'],
    miss:   ['Uff.', 'Thoda sa reh gaya…', 'Haath hil gaya.'],
    foul:   ['Meri goli!', 'Arre nahi yaar.'],
    oppWin: ['Accha shot tha.', 'Hmph.'],
    oppMiss:['Tum bhi miss karte ho!', 'Hehe.'],
    start:  ['Chalo khelte hain!', 'Main pehle!'],
  },
  bunty: {
    win:    ['Aur bolo.', 'Bas itna hi tha?', 'Seedha nishana.'],
    big:    ['Dher ho gaya!', 'Ek hi chot mein do.'],
    miss:   ['Hawa thi.', 'Agli baar.', 'Hmm.'],
    foul:   ['Chhod, ek goli hi toh hai.', 'Phans gayi andar.'],
    oppWin: ['Luck hai.', 'Theek hai, theek hai.'],
    oppMiss:['Itna weak flick?', 'Angootha zameen pe rakh, bhai.'],
    start:  ['Paise laaye ho? I mean, goliyan.', 'Line pe aa jao.'],
  },
  ustaad: {
    win:    ['Nishana yaad rakhna.', 'Yeh hota hai chot.', 'Bas.'],
    big:    ['Poora chakra saaf.', 'Dhampar ka kaam hai.'],
    miss:   ['Hmm. Chalo.', 'Ungli thak gayi.'],
    foul:   ['Galti meri.', 'Ho jata hai.'],
    oppWin: ['Accha khela.', 'Seekh rahe ho.'],
    oppMiss:['Jaldi mat karo. Rukna seekho.', 'Angootha uth gaya tha tumhara.'],
    start:  ['Aaram se. Ek ek karke.', 'Kitni goliyan hain jeb mein?'],
  },
};

/** Pick a line, never repeating within a match. */
export function say(level, key, r, used = new Set()) {
  const pool = (L[level] || L.bunty)[key] || [];
  const fresh = pool.filter((s) => !used.has(s));
  const list = fresh.length ? fresh : pool;
  if (!list.length) return '';
  const line = list[r.int(list.length)];
  used.add(line);
  return line;
}

/** What the shot summary should read as in the HUD. */
export function summaryLine(sum, players) {
  if (sum.foul) return sum.note;
  if (sum.chot !== null && sum.chot !== undefined) return sum.note;
  if (sum.gained > 0) return `${players[sum.by].name} takes ${sum.gained}.`;
  return sum.note;
}
