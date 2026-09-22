// The opponent's mouth.
//
// Tied to events, never random. A line that does not match what just happened is worse than
// silence -- it breaks the illusion that anyone is sitting across from you. So every line below
// belongs to exactly one thing that can occur, and the three characters say different things
// about the same event, because that is where the personality is.
export const VOCAB = {
  marble: ['kancha', 'goli', 'bante', 'lakhoti', 'golli gundu'],
  skins: { doodh: 'Doodh', kanch: 'Kanch', neeli: 'Neeli', lakhoti: 'Lakhoti', steel: 'Steel' },
};

// chotu   -- nine years old, delighted by everything, no filter, not actually taunting you
// bunty   -- the one who thinks he is your senior; needling, cocky, enjoys your misfortune
// ustaad  -- older, quiet, and the worst of the three: he is not needling, he is teaching
const L = {
  chotu: {
    shatter: ["Teri goli toot gayi! Hahaha!", "Kaanch thi na. Ab nayi lo."],
    botShatter: ["Meri goli!! Tooot gayi!", "Nahi nahi nahi! Meri achhi wali thi!"],
    wagerOffer: ["Double karein? Main darta nahi!", "Do guna! Bolo bolo!"],
    wagerYes: ["Haan! Ab maza aayega!"],
    wagerNo: ["Darr gaye? Hehe."],
    wagerWin: ["Double jeeta! Double!"],
    wagerLose: ["Arre… itni saari chali gayi."],
    cry: ["Mummy maaregi mujhe… sab goliyan chali gayin.", "Main ghar kaise jaunga ab? Mummy poochhegi."],
    lendYes: ["Sach mein? Tum achhe ho. Kal wapas kar dunga, pakka.", "Thank you! Mummy ko nahi bataunga."],
    lendNo: ["Theek hai… koi baat nahi.", "Hmph. Main bhi kabhi nahi dunga."],
    payback: ["Ye lo, tumhari goliyan. Aur ek extra!", "Maine bola tha na wapas karunga."],
    jotaMix:  ["Guess karo! Jaldi!", "Meri mutthi mein kitne hain?"],
    jotaRight:["Arre! Kaise pata chala?", "Tum jaadugar ho kya?"],
    jotaWrong:["Hahaha! Galat!", "Maine chhupa diya tha!"],
    start:    ['Chalo khelte hain!', 'Main pehle! Main pehle!', 'Meri goli nayi hai.', 'Tum haar jaoge, dekhna.'],
    lagWin:   ['Dekha! Main pehle!', 'Hehe, meri paas.'],
    lagLose:  ['Arre, phir se karte hain na?', 'Theek hai, tum pehle.'],
    botScore: ['Arre wah! Dekha?', 'Ho gaya! Ho gaya!', 'Mummy ko batana hai.', 'Ek aur, ek aur!'],
    botBig:   ['DO NIKAL GAYE!', 'Itne saare! Maine kiya!', 'Main champion hoon!'],
    botMiss:  ['Uff.', 'Thoda sa reh gaya…', 'Haath hil gaya.', 'Ye to bach gayi.'],
    botFoul:  ['Meri goli! Wapas do!', 'Arre nahi yaar.', 'Ye galat hai.'],
    botDirty: ['Oops. Dono ko maar diya.', 'Arre, doosri kaise aa gayi?'],
    botRun:   ['Main ruk hi nahi raha!', 'Teen! Teen ho gaye!'],
    youScore: ['Accha shot tha.', 'Hmph.', 'Luck se hua.'],
    youBig:   ['Do ek saath?! Kaise?', 'Ye to cheating hai!'],
    youMiss:  ['Tum bhi miss karte ho!', 'Hehe.', 'Dekha? Mushkil hai na.'],
    youNear:  ['Chhu gayi, nikli nahi!', 'Aur zor se maaro na.'],
    youFoul:  ['Tumhari goli gayi!', 'Hahaha! Meri ho gayi ab.'],
    youDirty: ['Do ko chhua! Turn khatam!', 'Galat! Ek hi maarna tha.'],
    youOut:   ['Ab meri baari!', 'Bas? Itni jaldi?'],
    ahead:    ['Main aage hoon!', 'Ginti kar lo.'],
    behind:   ['Ruko, abhi shuru kiya hai.', 'Main wapas aaunga.'],
    matchPoint:['Ek aur aur main jeeta!', 'Bas ek!'],
    win:      ['MAIN JEET GAYA! Sab ko batao!', 'Haar gaye! Haar gaye!'],
    lose:     ['Ek aur baar. Please?', 'Maine jaan bhoojh ke haara.'],
  },
  bunty: {
    shatter: ["Kaanch ki thi, kaanch hi rahi.", "Toot gayi? Achhi goli laao na.", "Ek aur kharcha. Bura din hai."],
    botShatter: ["Arre! Meri favourite thi wo.", "Chhod, aur bhi hain jeb mein."],
    wagerOffer: ["Double ya kuch nahi. Himmat hai?", "Do guna karte hain. Ya darr lag raha hai?"],
    wagerYes: ["Shabash. Ab dekhte hain."],
    wagerNo: ["Pata tha. Chalo aise hi khelte hain."],
    wagerWin: ["Double. Bola tha na himmat mat dikhana."],
    wagerLose: ["Arre yaar. Apni hi baat mein phas gaya."],
    cry: ["Main nahi ro raha. Dhool chali gayi aankh mein."],
    lendYes: ["Udhaar? Main Bunty hoon, bhikhari nahi."],
    lendNo: ["Rakho apni goliyan."],
    payback: ["Hisaab barabar."],
    jotaMix:  ["Ghuma raha hoon… dekh mat.", "Peeche haath hai. Soch lo."],
    jotaRight:["Chalo, aaj tumhara din hai.", "Tukka tha."],
    jotaWrong:["Kali thi, bhai. Kali.", "Seekh lo ginti."],
    start:    ['Paise laaye ho? I mean, goliyan.', 'Line pe aa jao.', 'Ghar se door mat jaana, jaldi khatam hoga.', 'Naya hai kya? Dikh raha hai.'],
    lagWin:   ['Pehli baari meri. Baitho aur dekho.', 'Lag bhi nahi jeet paaye.'],
    lagLose:  ['Theek hai, pehle tum. Farak nahi padta.', 'Ek shot ki baat hai.'],
    botScore: ['Aur bolo.', 'Bas itna hi tha?', 'Seedha nishana.', 'Dekh liya? Aise maarte hain.'],
    botBig:   ['Dher ho gaya!', 'Ek hi chot mein do.', 'Ye wala poster pe lagega.'],
    botMiss:  ['Hawa thi.', 'Agli baar.', 'Hmm.', 'Zameen kharab hai yahan.'],
    botFoul:  ['Chhod, ek goli hi toh hai.', 'Phans gayi andar.', 'Tumhare liye chhod raha hoon.'],
    botDirty: ['Do chhoo gaye. Bekaar.', 'Zyada zor lag gaya.'],
    botRun:   ['Rukne ka naam hi nahi.', 'Ab tumhari jeb khaali karta hoon.'],
    youScore: ['Luck hai.', 'Theek hai, theek hai.', 'Ek se kya hota hai.'],
    youBig:   ['Arre! Wo bhi tumse?', 'Chalo, kismat aaj tumhari.'],
    youMiss:  ['Itna weak flick?', 'Angootha zameen pe rakh, bhai.', 'Nishana lagaya tha ya bas maar diya?', 'Mere dada bhi isse behtar maarte the.'],
    youNear:  ['Chhu ke kya milega? Bahar nikaalo.', 'Halka pad gaya. Taakat lagao.'],
    youFoul:  ['Ek goli meri jeb mein. Shukriya.', 'Angootha uth gaya tumhara.', 'Ye to daan ho gaya.'],
    youDirty: ['Do ko hila diya. Baari meri.', 'Ek maarna tha, poora dher hila diya.'],
    youOut:   ['Khatam? Hato, mujhe dekhne do.', 'Teen shot, kuch nahi. Waah.'],
    ahead:    ['Ginti karoge ya main bataaun?', 'Main aage hoon. Kaafi aage.'],
    behind:   ['Abhi khel shuru hua hai.', 'Aage ho? Do minute ruko.'],
    matchPoint:['Ek aur. Jeb khol ke rakho.', 'Bas ek shot bacha hai tumhara khel.'],
    win:      ['Bola tha na.', 'Goliyan mere paas. Phir aana.'],
    lose:     ['Aaj haath theek nahi tha.', 'Ek aur? Double ya kuch nahi.'],
  },
  ustaad: {
    shatter: ["Kaanch hai. Ek din toot ti hai.", "Zor zyada lagaya. Goli ne keemat chukayi.", "Nayi goli lo. Aur halka maaro."],
    botShatter: ["Meri bhi toot ti hai. Umar ho gayi iski.", "Achha hi hua. Nayi mein line seedhi rehti hai."],
    wagerOffer: ["Double ya kuch nahi. Sochke bolo.", "Daav badha dein? Ab tak to aasan tha."],
    wagerYes: ["Accha. Ab dhyan se khelna."],
    wagerNo: ["Samajhdari hai. Bura nahi."],
    wagerWin: ["Daav tumne maana tha. Yaad rakhna."],
    wagerLose: ["Maine hi kaha tha. Le jao."],
    cry: ["Ustaad rota nahi. Seekhta hai."],
    lendYes: ["Mujhe zarurat nahi. Rakho."],
    lendNo: ["Theek hai."],
    payback: ["Udhaar yaad rehta hai mujhe."],
    jotaMix:  ["Peeche ghuma raha hoon. Aaram se socho.", "Mutthi band hai. Ab bolo."],
    jotaRight:["Sahi. Achha andaaza.", "Ginti aati hai tumhe."],
    jotaWrong:["Galat. Andaaza bhi ek hunar hai.", "Nahi. Phir se socho."],
    start:    ['Aaram se. Ek ek karke.', 'Kitni goliyan hain jeb mein?', 'Jaldi mat karna. Jaldi mein sab galat hota hai.'],
    lagWin:   ['Lag jeet liya. Aadha kaam ho gaya.', 'Pehli baari keemti hoti hai.'],
    lagLose:  ['Accha lag tha. Shuru karo.', 'Theek. Dekhte hain kya karte ho.'],
    botScore: ['Nishana yaad rakhna.', 'Yeh hota hai chot.', 'Bas.', 'Zor nahi, line.'],
    botBig:   ['Poora chakra saaf.', 'Dhampar ka kaam hai.'],
    botMiss:  ['Hmm. Chalo.', 'Ungli thak gayi.', 'Ek galti. Bas ek.'],
    botFoul:  ['Galti meri.', 'Ho jata hai.'],
    botDirty: ['Do chhue. Apni hi galti.', 'Haath bhaari pad gaya.'],
    botRun:   ['Aise chalta hai khel.', 'Jab line mil jaye to rukte nahi.'],
    youScore: ['Accha khela.', 'Seekh rahe ho.', 'Wo sahi tha. Yaad rakho kaise.'],
    youBig:   ['Do ek saath. Achha nishana.', 'Us shot ko yaad rakhna.'],
    youMiss:  ['Jaldi mat karo. Rukna seekho.', 'Angootha uth gaya tha tumhara.', 'Line dekhi thi? Ya sirf goli?', 'Har baar zor lagane se nahi hota.'],
    youNear:  ['Chhuna aasan hai. Nikalna mushkil.', 'Taakat kam thi. Doori naapo.'],
    youFoul:  ['Jaldi ki keemat.', 'Goli gayi. Sabak raha.'],
    youDirty: ['Ek maarna tha. Do hil gaye.', 'Safai bhi khel ka hissa hai.'],
    youOut:   ['Teen mauke the. Chalo, meri baari.', 'Soch ke maarna tha.'],
    ahead:    ['Main aage hoon. Par khel lamba hai.', 'Ginti baad mein. Abhi shot dekho.'],
    behind:   ['Peeche hoon. Koi baat nahi.', 'Lamba khel hai, bachcha.'],
    matchPoint:['Ek aur. Tayyar ho jao.', 'Aakhri. Dekhte hain.'],
    win:      ['Khel khatam. Achha laga.', 'Phir aana. Tab tak practice karo.'],
    lose:     ['Tum behtar the. Aaj.', 'Haar se hi seekhte hain. Main bhi.'],
  },
  guddi: {
    start: ["Baith ke dekhoge ya kheloge?", "Ladkiyan bhi khelti hain. Pata nahi tha?", "Shuru karo. Mere paas time kam hai."],
    lagWin: ["Pehli baari meri.", "Lag mein bhi haar gaye."],
    lagLose: ["Theek hai. Ek shot ka farak hai."],
    botScore: ["Haan.", "Agla.", "Line seedhi thi, bas."],
    botBig: ["Do.", "Ek chot, do goli."],
    botMiss: ["Hm.", "Wo meri galti thi."],
    botFoul: ["Bekaar.", "Kalaai ghoom gayi."],
    botDirty: ["Do chhu gaye. Meri galti."],
    botRun: ["Aise hi chalta rahega.", "Rukna mat kehna."],
    youScore: ["Achha tha.", "Ek. Aur?"],
    youBig: ["Achha shot. Sach mein.", "Wo yaad rakhna."],
    youMiss: ["Zor se maarne se line nahi banti.", "Dekh ke maaro. Goli bhaagti nahi.", "Phir wahi galti."],
    youNear: ["Chhua. Nikla nahi. Farak hai."],
    youFoul: ["Ek goli gayi. Meri.", "Jaldi ka nateeja."],
    youDirty: ["Poora dher hila diya. Baari meri."],
    youOut: ["Teen shot. Kuch nahi.", "Ho gaya? Hato."],
    ahead: ["Ginti mujhe yaad hai.", "Main aage hoon. Pata hai tumhe."],
    behind: ["Abhi lamba hai khel."],
    matchPoint: ["Ek aur.", "Khatam."],
    win: ["Khel khatam. Ustaad se jeete the na? Mujhse nahi.", "Phir aana. Practice karke."],
    lose: ["Aaj tum behtar the. Sirf aaj.", "Maan gayi. Ek baar."],
    shatter: ["Kaanch thi. Toot gayi.", "Nayi lo. Halka maarna seekho."],
    botShatter: ["Toot gayi. Doosri hai paas mein."],
    wagerOffer: ["Double? Ya itna hi kaafi hai?", "Daav badhayein. Dar to nahi?"],
    wagerYes: ["Theek. Ab galti mat karna."],
    wagerNo: ["Samajhdar ho."],
    wagerWin: ["Double. Tumne haan kaha tha."],
    wagerLose: ["Le jao. Aaj tumhara din."],
    cry: ["Main nahi roti."],
    lendYes: ["Nahi chahiye."],
    lendNo: ["Rakho apne paas."],
    payback: ["Hisaab saaf."],
    jotaMix: ["Peeche haath hai. Bolo.", "Ghuma diya. Ab guess karo."],
    jotaRight: ["Bilkul sahi.", "Haan, sahi."],
    jotaWrong: ["Galat.", "Ginti seekho phir se."],
  },
};

let lastSaid = '';
/**
 * Pick a line, not repeating one inside a match. When an event's pool is exhausted it reopens --
 * a long match should not go silent -- but never straight back to the line just said, which is
 * the one repeat a listener actually notices.
 */
export function say(level, key, r, used = new Set()) {
  const pool = (L[level] || L.bunty)[key] || [];
  const fresh = pool.filter((x) => !used.has(x));
  let list = fresh.length ? fresh : pool.filter((x) => x !== lastSaid);
  if (!list.length) list = pool;
  if (!list.length) return '';
  const line = list[r.int(list.length)];
  used.add(line); lastSaid = line;
  return line;
}
/** Every line the three of them have, for tests and for counting. */
export const allLines = () => Object.entries(L).map(([k, v]) => [k, Object.values(v).flat()]);

/**
 * What just happened, as one word, most specific first. Keeping this in one place means the
 * opponent never says two things about one shot, and never comments on the wrong one.
 */
export function eventFor(sum, ctx) {
  const mine = sum.by === 0;                       // 0 is always the human
  if (mine) {
    if (sum.dirty) return 'youDirty';
    if (sum.foul) return 'youFoul';
    if (sum.gained >= 20 || sum.gained > 1) return 'youBig';
    if (sum.gained > 0) return 'youScore';
    if (!sum.continues) return 'youOut';
    if (ctx.touched) return 'youNear';
    return 'youMiss';
  }
  if (sum.dirty) return 'botDirty';
  if (sum.foul) return 'botFoul';
  if (ctx.botStreak >= 3) return 'botRun';
  if (sum.gained >= 20 || sum.gained > 1) return 'botBig';
  if (sum.gained > 0) return 'botScore';
  return 'botMiss';
}

/** What the shot summary should read as in the HUD. */
export function summaryLine(sum, players) {
  if (sum.foul || sum.dirty) return sum.note;
  if (sum.chot !== null && sum.chot !== undefined) return sum.note;
  if (sum.gained > 0) return `${players[sum.by].name} takes ${sum.gained}.`;
  return sum.note;
}
