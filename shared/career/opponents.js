/**
 * career/opponents.js
 * 60 AI opponents for Career Mode.
 * Depends on: constants.js (COLORS, NUM_ROWS, NUM_COLS, wallColForColor, FLOOR_PENALTIES)
 */

/* ── Archetype base personalities ─────────────────────────── */
const ARCHETYPE_BASE = {
  perfectionist: { planning:75, risk:10, tile_denial:20, floor_avoidance:90, color_focus:45, row_focus:55, column_focus:55, adaptability:55, mistake_rate:8  },
  collector:     { planning:55, risk:35, tile_denial:20, floor_avoidance:45, color_focus:90, row_focus:30, column_focus:45, adaptability:45, mistake_rate:18 },
  builder:       { planning:85, risk:20, tile_denial:15, floor_avoidance:65, color_focus:45, row_focus:20, column_focus:90, adaptability:50, mistake_rate:10 },
  sprinter:      { planning:40, risk:55, tile_denial:10, floor_avoidance:25, color_focus:20, row_focus:90, column_focus:20, adaptability:30, mistake_rate:22 },
  bully:         { planning:60, risk:45, tile_denial:90, floor_avoidance:50, color_focus:30, row_focus:40, column_focus:40, adaptability:65, mistake_rate:18 },
  opportunist:   { planning:30, risk:60, tile_denial:30, floor_avoidance:35, color_focus:30, row_focus:55, column_focus:30, adaptability:45, mistake_rate:22 },
  gambler:       { planning:20, risk:92, tile_denial:10, floor_avoidance:8,  color_focus:30, row_focus:55, column_focus:30, adaptability:20, mistake_rate:35 },
  veteran:       { planning:70, risk:35, tile_denial:40, floor_avoidance:65, color_focus:50, row_focus:50, column_focus:50, adaptability:70, mistake_rate:10 },
  mimic:         { planning:65, risk:40, tile_denial:50, floor_avoidance:55, color_focus:40, row_focus:40, column_focus:40, adaptability:92, mistake_rate:15 },
  wildcard:      { planning:10, risk:80, tile_denial:10, floor_avoidance:10, color_focus:20, row_focus:30, column_focus:20, adaptability:10, mistake_rate:65 },
  // The champion archetype overrides normal scaling — stats returned directly in derivePersonality.
  // Near-perfect but not infallible — a mistake_rate of 4 means ~1 slip per game.
  champion:      { planning:85, risk:25, tile_denial:85, floor_avoidance:90, color_focus:78, row_focus:78, column_focus:78, adaptability:90, mistake_rate:10 },
};

const ARCHETYPE_COLORS = {
  perfectionist: '#7c3aed', collector: '#059669', builder: '#b45309',
  sprinter: '#ea580c',      bully: '#b91c1c',     opportunist: '#ca8a04',
  gambler: '#be185d',       veteran: '#1e40af',   mimic: '#0e7490',
  wildcard: '#4b5563',      champion: '#8b0000',
};

/**
 * Derive a personality profile from archetype + skill.
 * Higher skill → higher planning, lower mistake_rate.
 */
function derivePersonality(archetype, skill) {
  // Champion bypasses all scaling — stats are absolute peak.
  if (archetype === 'champion') {
    const b = ARCHETYPE_BASE.champion;
    return { planning: b.planning, risk: b.risk, tile_denial: b.tile_denial,
             floor_avoidance: b.floor_avoidance, color_focus: b.color_focus,
             row_focus: b.row_focus, column_focus: b.column_focus,
             adaptability: b.adaptability, mistake_rate: b.mistake_rate };
  }

  const b = ARCHETYPE_BASE[archetype] || ARCHETYPE_BASE.wildcard;
  const t = Math.max(0, Math.min(1, (skill - 100) / 1800)); // 0→1 across skill range

  // planning gets a skill-based flat bonus so even non-strategic archetypes
  // (gamblers, opportunists) still search deeper at high skill levels.
  return {
    planning:        Math.min(95, Math.round(b.planning        * (0.35 + t * 0.75) + t * 20)),
    risk:            b.risk,
    tile_denial:     Math.min(95, Math.round(b.tile_denial     * (0.4  + t * 0.75))),
    floor_avoidance: Math.min(95, Math.round(b.floor_avoidance * (0.4  + t * 0.75))),
    color_focus:     b.color_focus,
    row_focus:       b.row_focus,
    column_focus:    b.column_focus,
    adaptability:    Math.min(95, Math.round(b.adaptability    * (0.4  + t * 0.75))),
    mistake_rate:    Math.min(95, Math.max(2, Math.round(b.mistake_rate * (1.6 - t * 1.3)))),
  };
}

/* ── Portrait SVG generator ─────────────────────────────── */
const PORTRAIT_SKINS  = ['#fde3c0','#f0bc8a','#d4956a','#a06040','#7d4528'];
const PORTRAIT_HAIRS  = ['#111111','#3b1f0e','#8b5e1a','#c09830','#8b2222','#606060'];

/** Shared list of background colour choices for character creation. */
const PORTRAIT_BG_COLORS = [
  '#7c3aed','#059669','#b45309','#ea580c',
  '#b91c1c','#ca8a04','#be185d','#1e40af',
  '#0e7490','#4b5563',
];

/**
 * Core SVG builder — all params explicit.
 * uid must be unique per page when multiple portraits are inlined.
 */
function generateCustomPortraitSVG(portrait, uid) {
  const bg        = portrait.bgColor   || '#4b5563';
  const skin      = PORTRAIT_SKINS[portrait.skinIdx      ?? 0] || PORTRAIT_SKINS[0];
  const hairColor = PORTRAIT_HAIRS[portrait.hairColorIdx ?? 0] || PORTRAIT_HAIRS[0];
  const hairStyle = portrait.hairStyle  ?? 0;
  const glasses   = portrait.hasGlasses ?? false;
  const curveCY   = 58 + (portrait.mouthVal ?? 0.6) * 14;
  const mouth     = `M 41,66 Q 50,${curveCY} 59,66`;
  const safeUid   = uid ? String(uid).replace(/[^a-z0-9]/g, '') : 'p';

  const hairPaths = [
    `<ellipse cx="50" cy="28" rx="27" ry="15" fill="${hairColor}"/>`,
    `<ellipse cx="50" cy="27" rx="27" ry="14" fill="${hairColor}"/>
     <rect x="23" y="28" width="7" height="20" rx="3.5" fill="${hairColor}"/>
     <rect x="70" y="28" width="7" height="20" rx="3.5" fill="${hairColor}"/>`,
    `<ellipse cx="50" cy="30" rx="25" ry="13" fill="${hairColor}"/>
     <circle cx="50" cy="14" r="10" fill="${hairColor}"/>`,
    `<ellipse cx="50" cy="34" rx="24" ry="9" fill="${hairColor}" opacity="0.55"/>`,
  ];

  const eyeSVG = glasses
    ? `<rect x="30" y="47" width="16" height="11" rx="5" stroke="${hairColor}" stroke-width="2.5" fill="rgba(180,220,255,0.12)"/>
       <rect x="54" y="47" width="16" height="11" rx="5" stroke="${hairColor}" stroke-width="2.5" fill="rgba(180,220,255,0.12)"/>
       <line x1="46" y1="52" x2="54" y2="52" stroke="${hairColor}" stroke-width="2.5"/>`
    : `<circle cx="40" cy="52" r="4.5" fill="#111"/>
       <circle cx="60" cy="52" r="4.5" fill="#111"/>
       <circle cx="41.5" cy="50.5" r="1.8" fill="#fff"/>
       <circle cx="61.5" cy="50.5" r="1.8" fill="#fff"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><clipPath id="cp${safeUid}"><circle cx="50" cy="50" r="49"/></clipPath></defs>
<circle cx="50" cy="50" r="50" fill="${bg}"/>
<g clip-path="url(#cp${safeUid})">
  ${hairPaths[hairStyle]}
  <circle cx="50" cy="62" r="29" fill="${skin}"/>
  ${eyeSVG}
  <path d="${mouth}" stroke="#7a4020" stroke-width="2.5" fill="none" stroke-linecap="round"/>
</g>
</svg>`;
}

/** Generate a portrait from an opponent object (derives params from ID hash). */
function generatePortraitSVG(opponent) {
  const h = Math.abs(opponent.id.split('').reduce((s, c) => (s * 31 + c.charCodeAt(0)) | 0, 7));
  const p = derivePersonality(opponent.archetype, opponent.skills.azul);
  return generateCustomPortraitSVG({
    bgColor:      ARCHETYPE_COLORS[opponent.archetype] || '#4b5563',
    skinIdx:      h % PORTRAIT_SKINS.length,
    hairColorIdx: (h >> 3) % PORTRAIT_HAIRS.length,
    hairStyle:    h % 4,
    hasGlasses:   opponent.archetype === 'perfectionist' || h % 5 === 0,
    mouthVal:     (p.risk - p.floor_avoidance + 100) / 200,
  }, opponent.id.replace(/[^a-z0-9]/g, ''));
}

/** Generate portrait for the player's career character. */
function getPlayerPortraitSVG(careerState, uid) {
  if (careerState.portrait) {
    return generateCustomPortraitSVG(careerState.portrait, uid || 'player');
  }
  // Fallback: generate from old avatar index
  const fallbackId = 'pa' + (careerState.playerAvatarIdx ?? 0);
  const archetypes = Object.keys(ARCHETYPE_COLORS);
  return generateCustomPortraitSVG({
    bgColor:   PORTRAIT_BG_COLORS[careerState.playerAvatarIdx ?? 0],
    skinIdx:   0, hairColorIdx: 0, hairStyle: 0, hasGlasses: false, mouthVal: 0.6,
  }, uid || 'player');
}

/* ── 60 opponents ───────────────────────────────────────── */
const OPPONENTS = [
  /* ── Tier 1: skill 110–340 (very easy) ── */
  { id:'tommy-chen',  name:'Tommy Chen',  archetype:'wildcard',    skills: { azul: 110, harmonies: 100 }, minRating:1,   maxRating:360,
    bio:'Picked up Azul at a yard sale last week. Everything is new and exciting.',
    quotes:{ intro:"I think I know how this works... maybe?", win:"No way. No way that just happened!", loss:"Yeah, that makes total sense." } },

  { id:'daisy-king',  name:'Daisy King',  archetype:'gambler',     skills: { azul: 145, harmonies: 116 }, minRating:1,   maxRating:390,
    bio:'Plays every game like a slot machine. Absolutely chaotic energy.',
    quotes:{ intro:"Let\'s spin the wheel and see!", win:"Chaos wins again!", loss:"Worth the risk, no regrets." } },

  { id:'ben-walsh',   name:'Ben Walsh',   archetype:'opportunist', skills: { azul: 178, harmonies: 169 }, minRating:1,   maxRating:420,
    bio:'Takes whatever looks best in the moment. Long-term planning is not his thing.',
    quotes:{ intro:"I\'ll grab what I can.", win:"Points are points!", loss:"Hm. Maybe I should plan a bit more." } },

  { id:'lily-park',   name:'Lily Park',   archetype:'sprinter',    skills: { azul: 208, harmonies: 187 }, minRating:1,   maxRating:450,
    bio:'Obsessed with finishing rows as fast as possible, even when it backfires.',
    quotes:{ intro:"First row wins. Let\'s go.", win:"Speed is everything!", loss:"I was so close to that row..." } },

  { id:'rosa-diaz',   name:'Rosa Diaz',   archetype:'gambler',     skills: { azul: 238, harmonies: 190 }, minRating:40,  maxRating:480,
    bio:'The floor line is just extra storage, as far as she\'s concerned.',
    quotes:{ intro:"Big risks, big rewards. You\'ll see.", win:"Told you the floor doesn\'t matter!", loss:"The floor finally got me. Annoying." } },

  { id:'nate-ford',   name:'Nate Ford',   archetype:'wildcard',    skills: { azul: 262, harmonies: 231 }, minRating:65,  maxRating:505,
    bio:'His moves defy logic. Even he can\'t explain his strategy afterward.',
    quotes:{ intro:"I have a system. Probably.", win:"My system works!", loss:"The system needs... adjustment." } },

  { id:'chloe-sun',   name:'Chloe Sun',   archetype:'sprinter',    skills: { azul: 285, harmonies: 257 }, minRating:88,  maxRating:530,
    bio:'Competitive runner who applies "sprint to the finish" to every game she plays.',
    quotes:{ intro:"I finish first. Always.", win:"Row complete. Match over.", loss:"You slowed me down. It won\'t happen twice." } },

  { id:'marco-lima',  name:'Marco Lima',  archetype:'opportunist', skills: { azul: 308, harmonies: 293 }, minRating:110, maxRating:558,
    bio:'A pragmatic player who chases immediate value over long-term strategy.',
    quotes:{ intro:"Points now. Bonuses later. Maybe.", win:"Worked out just fine.", loss:"I needed one more round." } },

  { id:'pete-davis',  name:'Pete Davis',  archetype:'wildcard',    skills: { azul: 328, harmonies: 289 }, minRating:130, maxRating:578,
    bio:'Treats every game as an improv show. The moves come from somewhere deep and unknowable.',
    quotes:{ intro:"I\'m just going to feel it out.", win:"Improvised my way to a win!", loss:"Even I don\'t know what went wrong." } },

  { id:'mia-santos',  name:'Mia Santos',  archetype:'collector',   skills: { azul: 345, harmonies: 380 }, minRating:148, maxRating:595,
    bio:'Passionate about completing color sets, even if the timing is off.',
    quotes:{ intro:"I\'m going for all five colors today.", win:"Five colors, first place!", loss:"I was one tile short of my blue set. One tile." } },

  /* ── Tier 2: skill 360–540 (easy) ── */
  { id:'derek-stone', name:'Derek Stone', archetype:'perfectionist', skills: { azul: 362, harmonies: 380 }, minRating:162, maxRating:612,
    bio:'An accountant who applies spreadsheet thinking to every move. Hates wasted tiles.',
    quotes:{ intro:"Every tile has exactly one correct destination.", win:"Efficiency wins.", loss:"One suboptimal move. That\'s all it was." } },

  { id:'tyler-ross',  name:'Tyler Ross',  archetype:'builder',     skills: { azul: 390, harmonies: 390 }, minRating:190, maxRating:640,
    bio:'Plays the long game. He\'s thinking about column bonuses before the first tile is placed.',
    quotes:{ intro:"I\'m building something. You\'ll see it at the end.", win:"The foundation was solid.", loss:"Didn\'t have enough time to finish what I started." } },

  { id:'priya-nair',  name:'Priya Nair',  archetype:'collector',   skills: { azul: 415, harmonies: 457 }, minRating:215, maxRating:665,
    bio:'An art collector in real life. On the game board, she applies the same obsessive eye.',
    quotes:{ intro:"I collect beautiful things. This game is no different.", win:"My collection is complete.", loss:"Missing pieces. I hate missing pieces." } },

  { id:'yuki-hara',   name:'Yuki Hara',   archetype:'sprinter',    skills: { azul: 438, harmonies: 394 }, minRating:238, maxRating:688,
    bio:'Plays Azul like it\'s a time trial. Every second counts.',
    quotes:{ intro:"Row by row. Let\'s go.", win:"Clean sweep!", loss:"I needed that one tile earlier." } },

  { id:'carlos-vega', name:'Carlos Vega', archetype:'bully',       skills: { azul: 462, harmonies: 393 }, minRating:262, maxRating:712,
    bio:'Watches your board more than his own. Taking what you need is half the strategy.',
    quotes:{ intro:"I see what you\'re building. Shame if something interrupted it.", win:"Took what I needed. And what you needed.", loss:"You grabbed everything before I could deny it. Well played." } },

  { id:'amy-zhou',    name:'Amy Zhou',    archetype:'perfectionist', skills: { azul: 482, harmonies: 506 }, minRating:282, maxRating:732,
    bio:'A detail-oriented designer who finds joy in a perfectly filled wall.',
    quotes:{ intro:"Precision above all else.", win:"Not a single wasted move.", loss:"There was a flaw in my pattern. I see it now." } },

  { id:'fiona-blake', name:'Fiona Blake', archetype:'veteran',     skills: { azul: 498, harmonies: 498 }, minRating:298, maxRating:748,
    bio:'Played the physical Azul board game for years before switching to this version.',
    quotes:{ intro:"I know this game well. Let\'s see what you\'ve got.", win:"Steady wins it.", loss:"You read the board better than expected. Good game." } },

  { id:'jake-burns',  name:'Jake Burns',  archetype:'opportunist', skills: { azul: 518, harmonies: 492 }, minRating:318, maxRating:768,
    bio:'A day trader who plays Azul the same way: maximize immediate return.',
    quotes:{ intro:"High value picks only.", win:"ROI: excellent.", loss:"I overextended. Classic mistake." } },

  { id:'lea-marsh',   name:'Lea Marsh',   archetype:'gambler',     skills: { azul: 532, harmonies: 426 }, minRating:332, maxRating:782,
    bio:'Never met a risky move she didn\'t like. The floor line is just part of the plan.',
    quotes:{ intro:"Fortune favors the bold, and I am very bold.", win:"The gamble paid off!", loss:"Variance hit me today. Tomorrow it won\'t." } },

  { id:'nick-carr',   name:'Nick Carr',   archetype:'mimic',       skills: { azul: 548, harmonies: 548 }, minRating:348, maxRating:798,
    bio:'A quiet observer who learns and adapts faster than almost anyone.',
    quotes:{ intro:"I\'m watching. Don\'t mind me.", win:"Learned everything I needed in the first two rounds.", loss:"You adapted faster. Rare. I\'ll remember this." } },

  /* ── Tier 3: skill 560–745 (medium-easy) ── */
  { id:'raj-patel',   name:'Raj Patel',   archetype:'builder',     skills: { azul: 562, harmonies: 562 }, minRating:362, maxRating:812,
    bio:'An architect who literally designs board strategies like building plans.',
    quotes:{ intro:"I\'ve blueprinted this entire match in my head.", win:"Architecture always wins.", loss:"My plans were sound. The execution had cracks." } },

  { id:'sara-kim',    name:'Sara Kim',    archetype:'collector',   skills: { azul: 582, harmonies: 640 }, minRating:382, maxRating:832,
    bio:'Keeps a journal of every game. Her notes on color set timing are meticulous.',
    quotes:{ intro:"Five of a kind. Every time.", win:"The complete set. Beautiful.", loss:"Wrong color at the wrong time. Story of today." } },

  { id:'will-hart',   name:'Will Hart',   archetype:'veteran',     skills: { azul: 602, harmonies: 602 }, minRating:402, maxRating:852,
    bio:'Regular at his local board game cafe. Has taught Azul to hundreds of newcomers.',
    quotes:{ intro:"Welcome to the actual game.", win:"Experience is the best teacher.", loss:"You played well. Genuinely." } },

  { id:'elena-cruz',  name:'Elena Cruz',  archetype:'perfectionist', skills: { azul: 625, harmonies: 656 }, minRating:425, maxRating:875,
    bio:'A surgical resident who applies OR-level precision to every tile placement.',
    quotes:{ intro:"No wasted moves. No unnecessary risks.", win:"Clean. Methodical. Correct.", loss:"One error cascaded into everything. Frustrating." } },

  { id:'owen-mills',  name:'Owen Mills',  archetype:'bully',       skills: { azul: 648, harmonies: 551 }, minRating:448, maxRating:898,
    bio:'A chess player who discovered Azul and immediately started denying tiles.',
    quotes:{ intro:"I\'ll take what you need before you know you need it.", win:"You never had that color. And now you never will.", loss:"You out-denied me. I respect it, reluctantly." } },

  { id:'julia-tran',  name:'Julia Tran',  archetype:'sprinter',    skills: { azul: 668, harmonies: 601 }, minRating:468, maxRating:918,
    bio:'Runs marathons and plays Azul the same way: relentless forward momentum.',
    quotes:{ intro:"Racing to the first complete row.", win:"Crossed the finish line!", loss:"You pulled ahead on the final stretch." } },

  { id:'max-cole',    name:'Max Cole',    archetype:'mimic',       skills: { azul: 692, harmonies: 692 }, minRating:492, maxRating:942,
    bio:'A programmer who treats the opponent\'s board as a live data feed to exploit.',
    quotes:{ intro:"Watching your patterns. Already adapting.", win:"I became the better version of your strategy.", loss:"Your adaptations exceeded my model. Impressive." } },

  { id:'tara-bell',   name:'Tara Bell',   archetype:'opportunist', skills: { azul: 712, harmonies: 676 }, minRating:512, maxRating:962,
    bio:'A commodities broker. She knows how to extract maximum value from any situation.',
    quotes:{ intro:"Maximum value every single pick.", win:"Profit.", loss:"Sub-optimal day. Won\'t happen again." } },

  { id:'phil-stone',  name:'Phil Stone',  archetype:'gambler',     skills: { azul: 728, harmonies: 582 }, minRating:528, maxRating:978,
    bio:'Played poker professionally. The floor line is just calling a bluff.',
    quotes:{ intro:"No guts, no glory.", win:"The read was right. It always is.", loss:"Variance. Just variance." } },

  { id:'nora-west',   name:'Nora West',   archetype:'builder',     skills: { azul: 745, harmonies: 745 }, minRating:545, maxRating:995,
    bio:'A civil engineer. She sees columns where others see just tiles.',
    quotes:{ intro:"Slow and precise. Every tile load-bearing.", win:"The structure holds.", loss:"Fundamental error in the foundation. Back to the drawing board." } },

  /* ── Tier 4: skill 760–955 (medium) ── */
  { id:'aaron-park',  name:'Aaron Park',  archetype:'veteran',     skills: { azul: 762, harmonies: 762 }, minRating:562, maxRating:1012,
    bio:'A retired teacher who plays in three different Azul leagues.',
    quotes:{ intro:"I\'ve seen every strategy. Show me something new.", win:"Fundamentals win. Every time.", loss:"Well played. You read the board better than I expected." } },

  { id:'mei-liu',     name:'Mei Liu',     archetype:'collector',   skills: { azul: 782, harmonies: 860 }, minRating:582, maxRating:1032,
    bio:'A museum curator with an obsessive eye for pattern and completeness.',
    quotes:{ intro:"I\'m here for the complete set.", win:"A perfect collection.", loss:"One piece missing from the set. Unbearable." } },

  { id:'sam-moore',   name:'Sam Moore',   archetype:'bully',       skills: { azul: 808, harmonies: 687 }, minRating:608, maxRating:1058,
    bio:'A poker player turned Azul obsessive. Denial is his love language.',
    quotes:{ intro:"You can\'t build what I won\'t let you have.", win:"Controlled every color you needed.", loss:"You got what you needed despite everything. Hat\'s off." } },

  { id:'kate-ward',   name:'Kate Ward',   archetype:'perfectionist', skills: { azul: 832, harmonies: 874 }, minRating:632, maxRating:1082,
    bio:'A software QA engineer. She finds and eliminates errors before they happen.',
    quotes:{ intro:"I\'ve already identified the ten mistakes you\'re going to make.", win:"Zero defects.", loss:"Unexpected behavior detected. Reviewing the logs." } },

  { id:'chris-fox',   name:'Chris Fox',   archetype:'sprinter',    skills: { azul: 855, harmonies: 770 }, minRating:655, maxRating:1105,
    bio:'Competitive speedrunner who optimizes every game to its fastest possible completion.',
    quotes:{ intro:"Any% row completion. Let\'s go.", win:"Row finished. Match effectively over.", loss:"Couldn\'t optimize fast enough today." } },

  { id:'leila-hassan', name:'Leila Hassan', archetype:'mimic',     skills: { azul: 878, harmonies: 878 }, minRating:678, maxRating:1128,
    bio:'A behavioral scientist. She studies what you\'re doing and does it better.',
    quotes:{ intro:"I become what I observe.", win:"Your strategy, perfected.", loss:"You deviated from the observable pattern. Clever." } },

  { id:'brad-sims',   name:'Brad Sims',   archetype:'opportunist', skills: { azul: 902, harmonies: 857 }, minRating:702, maxRating:1152,
    bio:'An options trader. He compounds small advantages into decisive wins.',
    quotes:{ intro:"Points compound. I\'ll be very far ahead by round three.", win:"Compounded perfectly.", loss:"The compounding failed me at a critical moment." } },

  { id:'diana-cole',  name:'Diana Cole',  archetype:'builder',     skills: { azul: 925, harmonies: 925 }, minRating:725, maxRating:1175,
    bio:'An urban planner. She drafts column strategies before the round begins.',
    quotes:{ intro:"My columns will outlast your rows.", win:"The long-term plan prevailed.", loss:"The timeline was disrupted. I\'ll adjust." } },

  { id:'evan-sharp',  name:'Evan Sharp',  archetype:'gambler',     skills: { azul: 948, harmonies: 758 }, minRating:748, maxRating:1198,
    bio:'An extreme sports photographer. The riskier the shot, the better the result.',
    quotes:{ intro:"I live in the danger zone. Join me.", win:"The big bet paid off.", loss:"Pushed too far today. Worth it though." } },

  { id:'mila-santos', name:'Mila Santos', archetype:'veteran',     skills: { azul: 958, harmonies: 958 }, minRating:758, maxRating:1208,
    bio:'Has played over 2,000 rated Azul games online. Seen it all.',
    quotes:{ intro:"I know what you\'re planning before you do.", win:"Consistent pressure wins.", loss:"You were better prepared than I anticipated." } },

  /* ── Tier 5: skill 972–1238 (medium-hard) ── */
  { id:'hugo-diaz',   name:'Hugo Diaz',   archetype:'perfectionist', skills: { azul: 972, harmonies: 1021 }, minRating:772, maxRating:1222,
    bio:'A watchmaker. His tolerance for imprecision is exactly zero.',
    quotes:{ intro:"Every tile in its place. Every move timed perfectly.", win:"Perfection, as expected.", loss:"A mechanism failure. Unacceptable." } },

  { id:'iris-chen',   name:'Iris Chen',   archetype:'collector',   skills: { azul: 998, harmonies: 1098 }, minRating:798, maxRating:1248,
    bio:'A textile designer with a deep appreciation for the harmony of the five color sets.',
    quotes:{ intro:"Five colors, one perfect board.", win:"All colors completed. My work here is done.", loss:"The palette was incomplete today. I\'ll fix that." } },

  { id:'leo-burns',   name:'Leo Burns',   archetype:'bully',       skills: { azul: 1025, harmonies: 871 }, minRating:825, maxRating:1275,
    bio:'A chess grandmaster who discovered Azul and immediately went full denial mode.',
    quotes:{ intro:"I\'ve already calculated what you need. And I\'m taking it.", win:"You never had a path. I closed them all.", loss:"You found a line I didn\'t calculate. Well played." } },

  { id:'tina-walsh',  name:'Tina Walsh',  archetype:'sprinter',    skills: { azul: 1052, harmonies: 947 }, minRating:852, maxRating:1302,
    bio:'A competitive cyclist. First row completed is the finish line.',
    quotes:{ intro:"Rows. Fast.", win:"First across the line.", loss:"Lost the sprint today. The training continues." } },

  { id:'omar-nassar', name:'Omar Nassar', archetype:'veteran',     skills: { azul: 1088, harmonies: 1088 }, minRating:888, maxRating:1338,
    bio:'A former military strategist turned board game competitor. Methodical and unflappable.',
    quotes:{ intro:"Discipline separates winners from everyone else.", win:"Execution was precise.", loss:"You outmaneuvered me tactically. Respect." } },

  { id:'vera-drake',  name:'Vera Drake',  archetype:'mimic',       skills: { azul: 1122, harmonies: 1122 }, minRating:922, maxRating:1372,
    bio:'A method actor who brings character study to competitive Azul.',
    quotes:{ intro:"I\'ve been watching you all season. Your habits become my weapons.", win:"I became the superior version of you.", loss:"You broke character. I couldn\'t predict it." } },

  { id:'cole-nash',   name:'Cole Nash',   archetype:'builder',     skills: { azul: 1158, harmonies: 1158 }, minRating:958, maxRating:1408,
    bio:'A structural engineer with a 40-game undefeated streak built on column bonuses.',
    quotes:{ intro:"Columns first, always.", win:"Seven completed columns. Game over.", loss:"You disrupted the structural integrity of my plan." } },

  { id:'zoe-pham',    name:'Zoe Pham',    archetype:'opportunist', skills: { azul: 1192, harmonies: 1132 }, minRating:992, maxRating:1442,
    bio:'A venture capitalist. She identifies and extracts value faster than anyone in the room.',
    quotes:{ intro:"I see the value before you do.", win:"Exit strategy: perfect.", loss:"Missed a high-value opportunity. Recalibrating." } },

  { id:'ivan-petrov', name:'Ivan Petrov', archetype:'veteran',     skills: { azul: 1225, harmonies: 1225 }, minRating:1025, maxRating:1475,
    bio:'A former chess champion who uses Azul as his daily mental exercise.',
    quotes:{ intro:"Every game is a lesson. Today I am the teacher.", win:"Solid, as expected.", loss:"A student has outgrown their lessons. Good." } },

  { id:'aisha-brooks', name:'Aisha Brooks', archetype:'collector', skills: { azul: 1255, harmonies: 1381 }, minRating:1055, maxRating:1505,
    bio:'An ornithologist who identifies patterns the way she identifies birds: instantly.',
    quotes:{ intro:"I can see the entire pattern from the first move.", win:"Five species. Complete.", loss:"A rare sighting I wasn\'t prepared for." } },

  /* ── Tier 6: skill 1272–1855 (hard/elite) ── */
  { id:'finn-carter', name:'Finn Carter', archetype:'gambler',     skills: { azul: 1272, harmonies: 1018 }, minRating:1072, maxRating:1522,
    bio:'A derivatives trader who plays Azul with the same controlled aggression.',
    quotes:{ intro:"The expected value on this play is wild. I love it.", win:"The position resolved in my favor.", loss:"Tail risk materialized. It happens." } },

  { id:'suki-tanaka', name:'Suki Tanaka', archetype:'perfectionist', skills: { azul: 1322, harmonies: 1388 }, minRating:1122, maxRating:1572,
    bio:'A Michelin-starred chef who applies kitchen discipline to every tile.',
    quotes:{ intro:"No waste. No errors. No exceptions.", win:"Immaculate.", loss:"One misfire. I\'ll spend a week reviewing it." } },

  { id:'rex-morgan',  name:'Rex Morgan',  archetype:'bully',       skills: { azul: 1372, harmonies: 1166 }, minRating:1172, maxRating:1622,
    bio:'A litigation attorney. Denying resources is literally his job.',
    quotes:{ intro:"I\'ve reviewed the board. You have no viable claim.", win:"Objection sustained. On every count.", loss:"Unusual ruling. I\'ll appeal in the rematch." } },

  { id:'dani-reyes',  name:'Dani Reyes',  archetype:'builder',     skills: { azul: 1422, harmonies: 1422 }, minRating:1222, maxRating:1672,
    bio:'An aerospace engineer. Her column strategies are designed to precise tolerances.',
    quotes:{ intro:"My architecture doesn\'t fail.", win:"Nominal. All systems green.", loss:"Unexpected turbulence. Adjusting the trajectory." } },

  { id:'victor-cross', name:'Victor Cross', archetype:'veteran',   skills: { azul: 1478, harmonies: 1478 }, minRating:1278, maxRating:1728,
    bio:'A professional Azul player with fifteen national tournament wins.',
    quotes:{ intro:"I\'ve stood across from the best. Where do you rank?", win:"Cold. Calculated. Correct.", loss:"You have the instincts of a champion. Keep going." } },

  { id:'yuna-kwon',   name:'Yuna Kwon',   archetype:'mimic',       skills: { azul: 1535, harmonies: 1535 }, minRating:1335, maxRating:1785,
    bio:'A data scientist who models opponent behavior in real time.',
    quotes:{ intro:"I have a predictive model of your play style. It\'s 94% accurate.", win:"Model confirmed.", loss:"A six-percent event. I\'ll update the priors." } },

  { id:'ash-mercer',  name:'Ash Mercer',  archetype:'perfectionist', skills: { azul: 1588, harmonies: 1667 }, minRating:1388, maxRating:1838,
    bio:'Obsessively studies game theory between matches. Never takes a suboptimal line.',
    quotes:{ intro:"There is exactly one correct move sequence in this game. I know it.", win:"As expected.", loss:"You played a non-standard line. Irritatingly effective." } },

  { id:'riku-yamada', name:'Riku Yamada', archetype:'sprinter',    skills: { azul: 1645, harmonies: 1481 }, minRating:1445, maxRating:1895,
    bio:'The fastest row-completer in competitive play. Once finished three rows before round four.',
    quotes:{ intro:"Rows fall before me. All of them.", win:"Row. Row. Row. Done.", loss:"You blocked my lines. Bold and effective." } },

  { id:'bianca-stone', name:'Bianca Stone', archetype:'collector', skills: { azul: 1702, harmonies: 1872 }, minRating:1502, maxRating:1952,
    bio:'A gemologist. She identifies color set completion paths like precious stone cuts.',
    quotes:{ intro:"Five colors. Five completed sets. This is what I do.", win:"The collection is flawless.", loss:"You broke the symmetry. I won\'t let it happen again." } },

  { id:'otto-klein',  name:'Otto Klein',  archetype:'builder',     skills: { azul: 1758, harmonies: 1758 }, minRating:1558, maxRating:2000,
    bio:'A structural architect whose column-first strategies have a 78% win rate.',
    quotes:{ intro:"You cannot stop what I have planned.", win:"The wall stands.", loss:"Unexpected load on the structure. I\'ll reinforce." } },

  { id:'serena-vale', name:'Serena Vale', archetype:'veteran',     skills: { azul: 1812, harmonies: 1812 }, minRating:1612, maxRating:2000,
    bio:'Retired Azul world champion. Coaches the next generation between matches.',
    quotes:{ intro:"I\'ve played ten thousand games. Show me something I haven\'t seen.", win:"Good match. You have the foundation of a champion.", loss:"You\'re the real deal. Remember this win." } },

  { id:'kai-nakamura', name:'Kai Nakamura', archetype:'mimic',    skills: { azul: 1872, harmonies: 1872 }, minRating:1672, maxRating:2000,
    bio:'Undefeated in career mode. Studies opponents with almost supernatural precision.',
    quotes:{ intro:"I already know how this ends.", win:"You played well. You just played into my hand.", loss:"A genuinely unpredictable opponent. You earned this." } },

  { id:'marcus-knight', name:'Marcus Knight', archetype:'champion', skills: { azul: 1940, harmonies: 1940 }, minRating:1740, maxRating:2000,
    bio:'The reigning Career Mode champion. No one has beaten him in recorded history. They say he doesn\'t play the board — he plays you.',
    quotes:{ intro:"You made it this far. I\'ll make sure it ends here.", win:"There\'s no disgrace in losing to the best. But there\'s no second chance either.", loss:"...I didn\'t see that coming. You\'re something else." } },
];

/* ── Lookup helpers ─────────────────────────────────────── */
function getOpponentById(id) {
  return OPPONENTS.find(o => o.id === id) || null;
}

function getOpponentPersonality(opponent, game) {
  const skill = (game && opponent.skills[game]) ? opponent.skills[game] : opponent.skills.azul;
  return derivePersonality(opponent.archetype, skill);
}
