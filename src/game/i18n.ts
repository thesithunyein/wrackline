/**
 * Two shores, one game. English is the source language, so the English dictionary is
 * the keys themselves and a missing Burmese entry falls back to the English words
 * rather than to a blank label.
 *
 * Placeholders are written {like_this} and are filled in at render time, which keeps
 * word order free: Burmese puts the number in a different place in several of these
 * sentences, and a concatenated string could not express that.
 */

export type Lang = 'en' | 'my';

export const LANG_KEY = 'wrackline_lang';

export const LANGUAGES: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'my', label: 'မြန်မာ' }
];

export function loadLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'my' ? 'my' : 'en';
  } catch {
    return 'en';
  }
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {}
}

export function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'my';
}

const MY: Record<string, string> = {
  // Title and menu
  'SURVIVE THE TIDE · HARVEST THE SHORE': 'ဒီရေကို ရှင်သန်ပါ · ကမ်းခြေကို ရိတ်သိမ်းပါ',
  SEASON: 'ရာသီ',
  'DAILY TIDE': 'နေ့စဉ်ဒီရေ',
  PLAY: 'ကစား',
  'TIDE INTENSITY': 'ဒီရေပြင်းအား',
  CALM: 'ငြိမ်',
  SURF: 'လှိုင်း',
  STORM: 'မုန်တိုင်း',
  "TODAY'S TIDE": 'ယနေ့ဒီရေ',
  'NO STREAK': 'ဆက်တိုက်မရှိ',
  '{n} DAY STREAK': '{n} ရက်ဆက်တိုက်',
  '{done}/{total} MISSIONS': 'မစ်ရှင် {done}/{total}',
  "Open today's tide, missions and shells": 'ယနေ့ဒီရေ၊ မစ်ရှင်နှင့် ခွံများကို ဖွင့်ပါ',

  // HUD
  SCORE: 'အမှတ်',
  BEST: 'အကောင်းဆုံး',
  WAVE: 'လှိုင်း',
  'KING TIDE · 2X': 'ဘုရင်ဒီရေ · 2X',
  'WAVE {wave} · {tier} · {tide}{mod}': 'လှိုင်း {wave} · {tier} · {tide}{mod}',
  'Dug in · safe, and empty clawed': 'မြေတူးထားသည် · ဘေးကင်း၊ လက်ဗလာ',
  'HOLD HAUL TO LOOT': 'ပစ္စည်းဆွဲရန် HAUL ကို ဖိထားပါ',
  'HOLD [SPACE] TO HAUL': '[SPACE] ကို ဖိထားပြီး ဆွဲပါ',
  HAUL: 'ဆွဲ',
  DIG: 'တူး',
  PAUSED: 'ရပ်ထားသည်',
  'the tide is holding its breath · wave {wave} of {total}':
    'ဒီရေက အသက်ကို ထိန်းထားသည် · လှိုင်း {wave}/{total}',
  RESUME: 'ဆက်ကစား',
  'ESC or P to pause · switching tabs pauses for you':
    'ESC သို့မဟုတ် P ဖြင့် ရပ်နိုင်သည် · တဘ်ပြောင်းလျှင် အလိုအလျောက် ရပ်သည်',
  'switching tabs pauses for you': 'တဘ်ပြောင်းလျှင် အလိုအလျောက် ရပ်သည်',
  'Move down the shore (A or Left Arrow)': 'ကမ်းအောက်သို့ ရွှေ့ (A သို့မဟုတ် ဘယ်မြှား)',
  'Move up the shore (D or Right Arrow)': 'ကမ်းပေါ်သို့ ရွှေ့ (D သို့မဟုတ် ညာမြှား)',
  'Hold to haul loot in, release to bank it (Space)':
    'ပစ္စည်းဆွဲရန် ဖိထားပါ၊ လွှတ်လိုက်လျှင် သိမ်းမည် (Space)',
  'Hold to dig into the sand and ride out the surge (B or Shift)':
    'သဲထဲတူးပြီး ရေလှိုင်းကို ဖြတ်ရန် ဖိထားပါ (B သို့မဟုတ် Shift)',
  '{hearts} of {total} hearts left': 'နှလုံး {hearts}/{total} ကျန်သည်',
  'Resume playing': 'ဆက်ကစားရန်',

  // Guide
  'HOW TO PLAY': 'ကစားနည်း',
  MOVE: 'ရွှေ့',
  BANK: 'သိမ်း',
  "DON'T GET CAUGHT HOLDING": 'ပစ္စည်းကိုင်ထားရင်း မမိပါစေနှင့်',
  'DIG IN': 'မြေတူး',
  'OUTLAST THE SEASON': 'ရာသီကို ဖြတ်ကျော်',
  "WHAT'S WORTH WHAT": 'ဘယ်ပစ္စည်း ဘယ်လောက်',
  'GOT IT': 'နားလည်ပါပြီ',
  'Hold the ◀ and ▶ buttons to walk the shore.':
    '◀ နှင့် ▶ ခလုတ်များကို ဖိထားပြီး ကမ်းခြေတစ်လျှောက် လမ်းလျှောက်ပါ။',
  'Hold [A] / [D], the arrow keys, or the buttons on screen.':
    '[A] / [D]၊ မြှားခလုတ်များ သို့မဟုတ် မျက်နှာပြင်ပေါ်ရှိ ခလုတ်များကို ဖိထားပါ။',
  'Hold the HAUL button to pull in wrack within claw reach. Walk the wrack line to take the far, fatter pieces.':
    'လက်လှမ်းမီအတွင်းရှိ ပစ္စည်းများကို ဆွဲယူရန် HAUL ခလုတ်ကို ဖိထားပါ။ ဝေးပြီး တန်ဖိုးကြီးသော ပစ္စည်းများအတွက် ရေစပ်အထိ လမ်းလျှောက်ပါ။',
  'Hold [SPACE] or Click to pull in wrack within claw reach. Walk the wrack line to take the far, fatter pieces.':
    '[SPACE] သို့မဟုတ် ကလစ်ကို ဖိထားပြီး လက်လှမ်းမီအတွင်းရှိ ပစ္စည်းများကို ဆွဲယူပါ။ ဝေးပြီး တန်ဖိုးကြီးသော ပစ္စည်းများအတွက် ရေစပ်အထိ လမ်းလျှောက်ပါ။',
  'Release to deposit score safely.': 'လွှတ်လိုက်တာနှင့် အမှတ်များ ဘေးကင်းစွာ သိမ်းဆည်းပါမည်။',
  'A surge that hits you while you still hold loot costs a heart ♥. Bank first, wade through with empty claws, or dig in and lose the haul. You can still haul while the water is on the shore, and the surge carries the wrack up the beach with it, so the wave is a window rather than a wall: just expect the water to claw pieces back as you go.':
    'ပစ္စည်းကိုင်ထားစဉ် ရေလှိုင်းနှင့် တွေ့ပါက နှလုံး ♥ တစ်ခု ဆုံးရှုံးမည်။ အရင်သိမ်းပါ၊ လက်ဗလာနှင့် ဖြတ်ကူးပါ၊ သို့မဟုတ် မြေတူးပြီး ဆွဲထားသမျှကို စွန့်လိုက်ပါ။ ရေကမ်းပေါ်ရှိစဉ်လည်း ဆွဲနိုင်ပြီး ရေလှိုင်းက ပစ္စည်းများကို ကမ်းပေါ်သို့ တင်ပေးမည်။ ဒါကြောင့် လှိုင်းသည် အတားအဆီးမဟုတ်ဘဲ အခန်းတစ်ခု ဖြစ်သည် — ရေက ပစ္စည်းတချို့ကို ပြန်ဆွဲယူမည်ကို မျှော်လင့်ထားပါ။',
  'Hold the DIG button to bury yourself. The surge rolls over you and costs nothing, but everything in your claws spills onto the sand and the water takes it. You cannot move or haul while you are under.':
    'မြေတူးရန် DIG ခလုတ်ကို ဖိထားပါ။ ရေလှိုင်းက သင့်အပေါ် ဖြတ်သွားပြီး ထိခိုက်မှု မရှိပါ၊ ဒါပေမဲ့ လက်ထဲရှိ ပစ္စည်းအားလုံး သဲပေါ်ကျပြီး ရေက ယူသွားမည်။ မြေအောက်ရှိစဉ် မရွှေ့နိုင်၊ မဆွဲနိုင်ပါ။',
  'Hold [B] or [SHIFT], or hold the DIG button, to bury yourself. The surge rolls over you and costs nothing, but everything in your claws spills onto the sand and the water takes it. You cannot move or haul while you are under.':
    '[B] သို့မဟုတ် [SHIFT]၊ သို့မဟုတ် DIG ခလုတ်ကို ဖိထားပြီး မြေတူးပါ။ ရေလှိုင်းက သင့်အပေါ် ဖြတ်သွားပြီး ထိခိုက်မှု မရှိပါ၊ ဒါပေမဲ့ လက်ထဲရှိ ပစ္စည်းအားလုံး သဲပေါ်ကျပြီး ရေက ယူသွားမည်။ မြေအောက်ရှိစဉ် မရွှေ့နိုင်၊ မဆွဲနိုင်ပါ။',
  "Survive all {n} waves, from the Shallows to the Season's End. The calm between surges keeps shrinking as you go. Lose your last heart and the surge takes you.":
    'ရေတိမ်မှ ရာသီအဆုံးအထိ လှိုင်း {n} ခုလုံးကို ရှင်သန်ပါ။ လှိုင်းကြား အနားယူချိန် တဖြည်းဖြည်း လျော့နည်းလာမည်။ နှလုံးအားလုံး ကုန်ပါက ရေလှိုင်းက သင့်ကို ယူသွားမည်။',
  'Base values. Your tide multiplies them, and the further up the shore you pull a piece from, the more it pays.':
    'အခြေခံတန်ဖိုးများ။ ဒီရေက မြှောက်ပေးပြီး ကမ်းပေါ် ပိုဝေးသောနေရာမှ ဆွဲယူလေ တန်ဖိုး ပိုရလေဖြစ်သည်။',
  'Taken off moving water, while the surge is on the shore: {mult}, and the grab says SURGE. That is the payment for the heart it can cost.':
    'ရေလှိုင်း ကမ်းပေါ်ရှိစဉ် ရွေ့လျားနေသောရေမှ ယူပါက {mult} ရပြီး အမှတ်ပြတွင် SURGE ဟု ပြမည်။ ၎င်းသည် နှလုံးတစ်ခု ဆုံးရှုံးနိုင်သည့် အန္တရာယ်အတွက် အခကြေးငွေ ဖြစ်သည်။',
  AMMONITE: 'အမ်မိုနိုက်',
  CLAM: 'ကမာ',
  BOTTLE: 'ပုလင်း',
  'SEA GLASS': 'ပင်လယ်ဖန်',
  DOUBLOON: 'ရွှေဒင်္ဂါး',
  DRIFTWOOD: 'မျောသစ်သား',

  // End of run
  'OUTLASTED THE TIDE': 'ဒီရေကို ဖြတ်ကျော်နိုင်ခဲ့သည်',
  'THE SURGE TOOK YOU': 'ရေလှိုင်းက သင့်ကို ယူသွားသည်',
  'all {n} waves survived · {tide} tide': 'လှိုင်း {n} ခုလုံး ရှင်သန်ခဲ့သည် · {tide} ဒီရေ',
  'caught holding loot on wave {wave}': 'လှိုင်း {wave} တွင် ပစ္စည်းကိုင်ထားရင်း မိခဲ့သည်',
  'FINAL SCORE': 'နောက်ဆုံးအမှတ်',
  'FILING YOUR TIDE…': 'သင့်ဒီရေကို မှတ်တမ်းတင်နေသည်…',
  'TIDE RANK #{rank}': 'ဒီရေအဆင့် #{rank}',
  'THIS DEVICE #{rank}': 'ဤစက်ပစ္စည်း #{rank}',
  'NEW RECORD!': 'စံချိန်သစ်!',
  'BEST: {n}': 'အကောင်းဆုံး: {n}',
  'WAVES: {n}': 'လှိုင်း: {n}',
  '{n} TO BEAT YOUR BEST': 'သင့်စံချိန်ကို ကျော်ရန် {n}',
  'MISSION CLEARED · {list}': 'မစ်ရှင် ၁ ခု ပြီးမြောက် · {list}',
  'MISSIONS CLEARED · {list}': 'မစ်ရှင်များ ပြီးမြောက် · {list}',
  'HARDER TIDE': 'ပိုပြင်းသော ဒီရေ',
  'PLAY AGAIN': 'ထပ်ကစား',
  MENU: 'မီနူး',
  BOARD: 'အဆင့်ဇယား',
  SHARE: 'မျှဝေ',
  'MAKING CARD...': 'ကတ် ဖန်တီးနေသည်...',
  'IMAGE SAVED': 'ပုံ သိမ်းပြီး',
  COPIED: 'ကူးယူပြီး',
  'the card signs as {name}': 'ကတ်တွင် {name} ဟု ပါမည်',
  'the card signs as': 'ကတ်တွင် လက်မှတ်ထိုးသူ —',
  'Save a share card of this run': 'ဤကစားပွဲ၏ မျှဝေကတ်ကို သိမ်းပါ',
  'Change the name on your share card': 'မျှဝေကတ်ပေါ်ရှိ အမည်ကို ပြောင်းပါ',
  'share asks for a name the first time, and keeps it on this device':
    'မျှဝေရန် ပထမအကြိမ်တွင် အမည်တောင်းပြီး ဤစက်တွင်သာ သိမ်းထားမည်',
  'Press R to go again': 'ထပ်ကစားရန် R နှိပ်ပါ',
  'Tap PLAY AGAIN for another run': 'နောက်တစ်ခေါက် ကစားရန် PLAY AGAIN ကို နှိပ်ပါ',

  // Boards
  'TIDE BOARDS': 'ဒီရေအဆင့်ဇယား',
  'LIVE · EVERY PLAYER': 'တိုက်ရိုက် · ကစားသမားအားလုံး',
  'ON THIS DEVICE': 'ဤစက်ပစ္စည်းပေါ်တွင်',
  'BEST RUNS': 'အကောင်းဆုံး ကစားပွဲများ',
  'READING THE WRACK…': 'မှတ်တမ်း ဖတ်နေသည်…',
  'No runs filed yet.': 'မှတ်တမ်း မရှိသေးပါ။',
  'Be the first on this shore.': 'ဤကမ်းခြေတွင် ပထမဆုံး ဖြစ်ပါ။',
  YOU: 'သင်',
  'wave {wave} · {tide} · {date}': 'လှိုင်း {wave} · {tide} · {date}',
  'world board unreachable — showing the best run kept here':
    'ကမ္ဘာ့ဇယားနှင့် မချိတ်ဆက်နိုင်ပါ — ဤစက်တွင် သိမ်းထားသော အကောင်းဆုံး ကစားပွဲကို ပြထားသည်',
  'Close the tide boards': 'ဒီရေအဆင့်ဇယားကို ပိတ်ပါ',
  'Open the tide boards': 'ဒီရေအဆင့်ဇယားကို ဖွင့်ပါ',
  'Tide boards': 'ဒီရေအဆင့်ဇယား',

  // Daily sheet
  "TODAY'S SHORE": 'ယနေ့ ကမ်းခြေ',
  '{date} · resets in {time}': '{date} · {time} အတွင်း အသစ်ပြန်စမည်',
  'a moment': 'မကြာမီ',
  'PLAY DAILY TO START A STREAK': 'ဆက်တိုက် စတင်ရန် နေ့စဉ် ကစားပါ',
  'MISSIONS · {done}/{total}': 'မစ်ရှင် · {done}/{total}',
  CLEARED: 'ပြီးမြောက်',
  'SHELLS · {n} SHORE PTS': 'ခွံ · ကမ်းရိုးတန်းအမှတ် {n}',
  'EARNED BY BANKING': 'သိမ်းဆည်းခြင်းဖြင့် ရရှိ',
  WORN: 'ဝတ်ဆင်ထား',
  WEAR: 'ဝတ်ဆင်',
  '{n} PTS': '{n} အမှတ်',
  "Close today's shore": 'ယနေ့ ကမ်းခြေကို ပိတ်ပါ',
  // (the menu's aria-label for the daily sheet lives in the daily sheet block)

  // Shell names
  'TIDE GLASS': 'ဒီရေဖန်',
  EMBER: 'မီးကျီး',
  BONE: 'အရိုး',
  ABYSS: 'ချောက်နက်',

  // Mission labels
  'Bank 2,000 in a single tide': 'ဒီရေတစ်ခုအတွင်း 2,000 သိမ်းပါ',
  'Reach wave 7': 'လှိုင်း 7 အထိ ရောက်ပါ',
  'Take 4 pieces off the surge': 'ရေလှိုင်းထဲမှ ပစ္စည်း 4 ခု ယူပါ',
  'Bank during 2 King Tides': 'ဘုရင်ဒီရေ 2 ခုအတွင်း သိမ်းပါ',
  'Outlast the whole season': 'ရာသီတစ်ခုလုံး ဖြတ်ကျော်ပါ',
  'Haul 30 pieces in a single tide': 'ဒီရေတစ်ခုအတွင်း ပစ္စည်း 30 ခု ဆွဲပါ',

  // Daily tide modifiers
  'OPEN SEASON': 'ပွင့်လင်းရာသီ',
  'The shore as it always is.': 'အမြဲတမ်းကဲ့သို့ ကမ်းခြေ။',
  'RICH WRACK': 'ကြွယ်ဝသော ပစ္စည်းများ',
  'Every piece on the sand pays 1.4x.': 'သဲပေါ်ရှိ ပစ္စည်းတိုင်း 1.4 ဆ ရမည်။',
  'THIN SHORE': 'ပါးလွှာသော ကမ်း',
  'Fewer pieces land, and each one pays double.': 'ပစ္စည်းနည်းကျပြီး တစ်ခုချင်းစီက နှစ်ဆ ရမည်။',
  'LONG DRAW': 'ရှည်လျားသော ရေဆုတ်ချိန်',
  'The low tide holds 30% longer. More time, more greed.':
    'ဒီရေနိမ့်ချိန် 30% ပိုကြာမည်။ အချိန်ပိုရ၊ လောဘပိုရ။',
  'KING SEASON': 'ဘုရင်ရာသီ',
  'King Tides roll twice as often.': 'ဘုရင်ဒီရေ နှစ်ဆ ပိုများစွာ ဖြစ်မည်။',
  'SHORT FUSE': 'တိုတောင်းသော အချိန်',
  'The sea draws back for a quarter less time before the surge.':
    'ရေလှိုင်းမတိုင်မီ ရေဆုတ်ချိန် လေးပုံတစ်ပုံ လျော့မည်။',

  // Season tiers
  SHALLOWS: 'ရေတိမ်',
  'THE WRACK': 'ပစ္စည်းတန်း',
  'DEEP DRAW': 'နက်ရှိုင်းသော ဆုတ်ချိန်',
  'BLACK TIDE': 'ဒီရေမည်း',
  "SEASON'S END": 'ရာသီအဆုံး',

  // Name prompt
  'WHO IS HAULING?': 'ဘယ်သူ ဆွဲနေတာလဲ?',
  'Your name goes on the card. It stays on this device, like your best score: no account, no server.':
    'သင့်အမည်က ကတ်ပေါ်တွင် ပါမည်။ အကောင်းဆုံးအမှတ်လိုပဲ ဤစက်တွင်သာ သိမ်းထားမည် — အကောင့်မလို၊ ဆာဗာမလို။',
  SCUTTLER: 'ကဏန်းလေး',
  'MAKE MY CARD': 'ကတ် ဖန်တီး',
  'NOT NOW': 'နောက်မှ',
  'Name to sign your share card with': 'မျှဝေကတ် လက်မှတ်ထိုးမည့် အမည်',

  // Loading, errors
  'LOADING WORLD': 'ကမ္ဘာ ဖွင့်နေသည်',
  'THIS BROWSER CANNOT RUN THE SHORE': 'ဤဘရောက်ဇာတွင် ကမ်းခြေကို ဖွင့်မရပါ',
  'WRACKLINE draws its beach with WebGL, and this browser either does not support it or has it switched off. Another browser, or hardware acceleration turned back on, will do it.':
    'WRACKLINE သည် ကမ်းခြေကို WebGL ဖြင့် ရေးဆွဲသည်။ ဤဘရောက်ဇာတွင် WebGL မပံ့ပိုးခြင်း သို့မဟုတ် ပိတ်ထားခြင်း ဖြစ်နိုင်သည်။ အခြားဘရောက်ဇာ တစ်ခု သို့မဟုတ် ဟာ့ဒ်ဝဲ အရှိန်မြှင့်ခြင်းကို ပြန်ဖွင့်ခြင်းဖြင့် ရနိုင်သည်။',
  'Something stopped the shore from loading. A reload usually fixes it.':
    'ကမ်းခြေ ဖွင့်ခြင်းကို တစ်ခုခုက ရပ်တန့်စေခဲ့သည်။ ပြန်ဖွင့်လိုက်ရင် အများအားဖြင့် ပြေလည်သည်။',

  // Settings
  SETTINGS: 'ဆက်တင်',
  SOUND: 'အသံ',
  'Waves, clicks and the shore. M toggles it anywhere.':
    'လှိုင်း၊ ကလစ်နှင့် ကမ်းခြေအသံများ။ မည်သည့်နေရာတွင်မဆို M ဖြင့် ဖွင့်/ပိတ်နိုင်သည်။',
  ON: 'ဖွင့်',
  OFF: 'ပိတ်',
  LANGUAGE: 'ဘာသာစကား',
  'The whole shore, labels and guide.':
    'ကမ်းခြေတစ်ခုလုံး၊ အညွှန်းများနှင့် လမ်းညွှန်များ။',
  FULLSCREEN: 'မျက်နှာပြင် အပြည့်',
  'Fill the screen. F toggles it anywhere.':
    'မျက်နှာပြင် အပြည့် ကြည့်ရန်။ မည်သည့်နေရာတွင်မဆို F ဖြင့် ဖွင့်/ပိတ်နိုင်သည်။',
  'ENTER FULLSCREEN': 'အပြည့် ဖွင့်',
  'EXIT FULLSCREEN': 'ပုံမှန် ပြန်',
  'Close settings': 'ဆက်တင်ကို ပိတ်ပါ',
  'Sound and language are saved on this device.': 'အသံနှင့် ဘာသာစကားကို ဤစက်တွင် သိမ်းထားသည်။',
  'Open settings': 'ဆက်တင်ကို ဖွင့်ပါ',
  'How to play': 'ကစားနည်း',
  'Close the guide': 'လမ်းညွှန်ကို ပိတ်ပါ',

  // Floating callouts
  'SNUCK IT +{n}': 'ချော်ထွက်ပြီး +{n}',
  'WASHED IN +{n}': 'ရေတင်လာသည် +{n}',
  'SURGE +{n}': 'SURGE +{n}',
  '+{n} (2X)': '+{n} (2X)',

  // Share text
  'I OUTLASTED THE TIDE in WRACKLINE · {score}': 'WRACKLINE တွင် ဒီရေကို ဖြတ်ကျော်နိုင်ခဲ့သည် · {score}',
  'The surge took me on wave {wave} · {score} in WRACKLINE':
    'ငါ့ကို လှိုင်း {wave} မှာ ရေလှိုင်းက ယူသွားတယ် · WRACKLINE တွင် {score}',
  '{headline} · {tide} tide': '{headline} · {tide} ဒီရေ'
};

const PLACEHOLDER = /\{(\w+)\}/g;

export type Vars = Record<string, string | number>;

export function placeholders(text: string): string[] {
  return Array.from(text.matchAll(PLACEHOLDER), match => match[1]).sort();
}

export function translate(lang: Lang, text: string, vars?: Vars): string {
  const template = lang === 'my' ? MY[text] ?? text : text;
  if (!vars) return template;
  return template.replace(PLACEHOLDER, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole
  );
}

/** The dictionary, for tests and for anything that needs to audit coverage. */
export const MY_TRANSLATIONS: Readonly<Record<string, string>> = MY;
