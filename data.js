// AI Wars: game content. Edit jokes, names and numbers here; logic lives in engine.js.
// Parody rules: names visibly altered; parody people get harmless public-persona traits only;
// scandals happen to fictional companies or unnamed people, never to a parody person.

const AIW_DATA = (() => {

const CONFIG = {
  MONTHS: 24,
  START_CASH: 20,        // $M from Uncle Barry
  START_REP: 60,
  GRID_CAP: 60,          // MW
  POWER_BILL: 0.04,      // $M per MW per month
  COMPUTE_BASE: 1.5,     // $M per MW
  COMPUTE_SELL: 0.92,    // you sell compute at 92% of the local price
  LOAN_RATE: 0.03,       // per month
  LOAN_LTV: 0.30,        // max loan as share of marks
  COVENANT: 0.40,        // breach above this
  HURDLE: 1.17,          // 8%/yr over 2 years
  CARRY: 0.20,
  CLOSE_HAIRCUT: 0.5,    // unexited stakes and compute count at 50% at close
  DRIFT: 0.015,          // monthly valuation drift (the AI boom)
  NEWS_CHANCE: 0.30,
  ENCOUNTER_CHANCE: 0.30,
  EXIT: { ipo: 0.015, acq: 0.012, acquihire: 0.01, shut: 0.005, down: 0.02, tender: 0.02 },
};

// v = starting valuation in $B. vol = monthly volatility.
const COMPANIES = [
  { id: 'closedai',     n: 'ClosedAI',                      t: 'CLSD', v: 500, tier: 'hot',   vol: 0.08, line: 'Non-profit. For-profit. Capped-profit. Profit.' },
  { id: 'yai',          n: 'yAI',                           t: 'YAI',  v: 200, tier: 'hot',   vol: 0.25, line: 'Makes Grokk. Founder posts at 3am; valuation moves at 3:01.' },
  { id: 'misanthropic', n: 'Misanthropic',                  t: 'MSNT', v: 180, tier: 'hot',   vol: 0.08, line: 'Builds AI that worries about AI.' },
  { id: 'databrickd',   n: 'Databrickd',                    t: 'DBRK', v: 100, tier: 'warm',  vol: 0.08, line: 'IPO any day now since 2021.' },
  { id: 'figurine',     n: 'Figurine Robotics',             t: 'FIGR', v: 39,  tier: 'warm',  vol: 0.25, line: 'Humanoids that fold laundry. Slowly.' },
  { id: 'pss',          n: 'Pretty Safe Superintelligence', t: 'PSS',  v: 32,  tier: 'hot',   vol: 0.15, line: 'No product. No revenue. No problem.' },
  { id: 'cursr',        n: 'Cursr',                         t: 'CRSR', v: 30,  tier: 'hot',   vol: 0.15, line: 'Vibe-codes your vibe coder.' },
  { id: 'andurwhile',   n: 'Andurwhile',                    t: 'ANDW', v: 30,  tier: 'warm',  vol: 0.15, line: 'Drones that build drones.' },
  { id: 'perplexed',    n: 'Perplexed',                     t: 'PRPX', v: 20,  tier: 'warm',  vol: 0.25, line: 'Offers to buy a browser every quarter.' },
  { id: 'mistrial',     n: 'Mistrial',                      t: 'MSTR', v: 14,  tier: 'warm',  vol: 0.15, line: "Europe's champion. Ask any president." },
  { id: 'overthinking', n: 'Overthinking Machines',         t: 'OVTM', v: 12,  tier: 'hot',   vol: 0.25, line: 'Raised $2B to think about it.' },
  { id: 'harvee',       n: 'Harvée',                        t: 'HRVE', v: 5,   tier: 'warm',  vol: 0.15, line: 'Legal AI. Occasionally cites real cases.' },
  { id: 'lovabull',     n: 'Lovabull',                      t: 'LOVB', v: 2,   tier: 'warm',  vol: 0.35, line: 'Every teenager is now a SaaS founder.' },
  { id: 'clueless',     n: 'Clueless',                      t: 'CLUE', v: 0.2, tier: 'penny', vol: 0.50, line: 'Cheat on everything.' },
];

// quote: multiplier on secondary prices here. compute: multiplier on compute price.
const HUBS = [
  { id: 'sandhill',  n: 'Sand Hill Road', perk: 'More hot rounds. Lawyers on call.',             quote: 1.00, compute: 1.10 },
  { id: 'mission',   n: 'SF Mission',     perk: '"Cerebral Valley." Hot blocks, at a premium.',  quote: 1.10, compute: 1.15, hotBoost: 2 },
  { id: 'nyc',       n: 'New York',       perk: 'Secondaries at a discount. Yarvard.',           quote: 0.92, compute: 1.10 },
  { id: 'london',    n: 'London',         perk: 'Hockey Teachers. Mistrial trades cheap.',       quote: 1.00, compute: 1.25, special: { mistrial: 0.85 } },
  { id: 'dubai',     n: 'Dubai',          perk: 'Sovereign Sandbox. Cheap compute.',             quote: 1.00, compute: 0.80 },
  { id: 'riyadh',    n: 'Riyadh',         perk: 'Kingdom Vision. Giga-projects.',                quote: 1.05, compute: 0.90 },
  { id: 'singapore', n: 'Singapore',      perk: 'Lion City. Pricey compute, odd shipments.',     quote: 1.00, compute: 1.30 },
  { id: 'austin',    n: 'Austin',         perk: 'Cheapest power. Crypto and oil money.',         quote: 0.97, compute: 0.70 },
];

// req(S, X) returns null if the LP can be pitched, otherwise the requirement text.
const LPS = [
  { id: 'barry',    n: "Uncle Barry's Family Office",   hub: null,        amt: 20,  req: () => null },
  { id: 'diamond',  n: '0xDiamondPaws',                 hub: 'austin',    amt: 40,  req: () => null, note: 'Crypto whale. May "need liquidity".' },
  { id: 'oilheir',  n: 'Lone Star Oil Heir',            hub: 'austin',    amt: 50,  req: S => S.rep >= 40 ? null : 'Needs reputation 40+' },
  { id: 'yarvard',  n: 'Yarvard Endowment',             hub: 'nyc',       amt: 80,  req: S => S.rep >= 60 ? null : 'Needs reputation 60+' },
  { id: 'hockey',   n: "Hockey Teachers' Pension Plan", hub: 'london',    amt: 120, req: (S, X) => X.tvpi(S) >= 1.2 ? null : 'Needs TVPI 1.2×+' },
  { id: 'lioncity', n: 'Lion City Holdings',            hub: 'singapore', amt: 150, req: S => S.rep >= 55 ? null : 'Needs reputation 55+' },
  { id: 'sandbox',  n: 'Sovereign Sandbox Fund',        hub: 'dubai',     amt: 250, req: S => S.mw >= 40 ? null : 'Needs 40+ MW of compute ("we want data centers")' },
  { id: 'kingdom',  n: 'Kingdom Vision Fund',           hub: 'riyadh',    amt: 400, req: (S, X) => X.holds(S, 'closedai') || X.holds(S, 'misanthropic') ? null : 'Needs a stake in ClosedAI or Misanthropic' },
];

const LAWYERS = [
  { n: 'Junior Associate',     min: 0.5, max: 0.8, power: 0.08 },
  { n: 'Ex-FTC Staffer',       min: 0.8, max: 1.3, power: 0.10 },
  { n: 'Big Law Partner',      min: 1.2, max: 2.0, power: 0.13 },
  { n: 'Former SEC Chair',     min: 2.0, max: 3.0, power: 0.15 },
];

const REGULATORS = {
  ftc:   { title: 'FTC probe',         open: n => `The FTC is probing your "circular investments". ${n} investigator${n > 1 ? 's' : ''} assigned.` },
  cfius: { title: 'CFIUS review',      open: n => `CFIUS is reviewing your Gulf LPs and "those GPUs". ${n} reviewer${n > 1 ? 's' : ''} assigned.` },
  eu:    { title: 'EU AI Office audit',open: n => `The EU AI Office is auditing your portfolio's risk tier. ${n} auditor${n > 1 ? 's' : ''} assigned, all with clipboards.` },
};

const ACQUIRERS = ['Macrohard', 'Goggle', 'Amazin\'', 'Meta-verse', 'Pear', 'Oracull'];
const ACQUIHIRERS = ['Goggle', 'Macrohard', 'Meta-verse'];

// News. co: only fires while that company is still trading. when(S): optional condition.
// fx(E) applies the effect. E.mult(id, f), E.all(f), E.compute(f), E.loseMonth(), E.rnd(a, b), E.S
const NEWS = [
  // Market-wide
  { text: 'A famous short-seller says the AI bubble is "definitely, probably" about to burst.', fx: E => E.all(E.rnd(0.80, 0.90)) },
  { text: "ClosedAI and NoVidia announce they're each investing $100B in the other. Analysts draw a circle and call it revenue.", fx: E => { E.all(1.10); E.mult('closedai', 1.10); } },
  { text: 'Grid operator: "No new data center hookups until 2031." Compute prices double.', fx: E => E.compute(2) },
  { text: 'A Chinese lab releases an open model that matches the frontier, trained for the price of a used car.', fx: E => { ['closedai', 'yai', 'misanthropic', 'mistrial'].forEach(id => E.mult(id, 0.75)); E.compute(0.7); } },
  { text: 'Rates cut. Tourist VCs flood back into AI.', fx: E => E.all(1.15) },
  { text: 'Pear announces it will "think about" AI next year. Perplexed jumps on acquisition rumours.', co: 'perplexed', fx: E => E.mult('perplexed', 1.25) },
  { text: 'Oracull takes on another $40B of debt for data centers. Its bonds wobble.', fx: E => { E.compute(0.8); E.all(0.95); } },
  { text: 'Starlight Data Centers breaks ground on a $500B Texas campus, with a single shovel. Compute floods the market.', fx: E => E.compute(0.7) },
  { text: 'A shipment of NoVidia GPUs is found in a container labelled "frozen shrimp" at a Singapore port. Export controls tighten.', fx: E => { E.compute(1.5); E.S.smuggle = 2; } },
  { text: '"AI agents will replace all SaaS," says every podcast at once.', fx: E => { E.mult('cursr', 1.3); E.mult('lovabull', 1.3); E.mult('databrickd', 0.9); } },

  // Good news
  { co: 'closedai',     text: 'Sam Altmode posts "agi achieved internally" (week 9 in a row).', fx: E => E.mult('closedai', 1.05) },
  { co: 'cursr',        text: 'Cursr hits $1B ARR with 400 employees, 12 of them human.', fx: E => E.mult('cursr', E.rnd(2, 3)) },
  { co: 'misanthropic', text: "Misanthropic's new model refuses to help write its own IPO prospectus, citing a conflict of interest. Investors love it.", fx: E => E.mult('misanthropic', 1.10) },
  { co: 'figurine',     text: "Figurine's robot folds a shirt on stage. It took 11 minutes.", fx: E => E.mult('figurine', 2) },
  { co: 'andurwhile',   text: 'Andurwhile wins a $20B defence contract for drones that build drones.', fx: E => E.mult('andurwhile', 2) },
  { co: 'pss',          text: 'Pretty Safe Superintelligence ships its first product: a three-sentence blog post.', fx: E => E.mult('pss', 1.5) },
  { co: 'mistrial',     text: 'Mistrial is named "Europe\'s champion" by three presidents in the same week.', fx: E => E.mult('mistrial', 1.8) },
  { co: 'lovabull',     text: 'Lovabull: "Every teenager is now a SaaS founder." ARR doubles.', fx: E => E.mult('lovabull', 3) },
  { co: 'clueless',     text: 'Retail traders discover Clueless.', fx: E => E.mult('clueless', 5) },
  { text: 'Henson Right signs a fan\'s GPU at a keynote. The crowd chants "the more you buy, the more you save." Compute +30%.', fx: E => E.compute(1.3) },
  { text: 'Henson Right debuts a new leather jacket. NoVidia adds $300B in market value, and the jacket gets its own ticker.', fx: E => E.compute(1.2) },
  { co: 'yai',          text: "yAI's founder posts a meme at 3am. Grokk downloads triple.", fx: E => E.mult('yai', 1.3) },

  // Bad news
  { co: 'clueless',     text: "Clueless's AI is caught cheating on its own Series A due diligence.", fx: E => E.mult('clueless', 0.2) },
  { co: 'perplexed',    text: "Benchmark scandal: Perplexed's model turns out to have been trained on the test set.", fx: E => E.mult('perplexed', 0.4) },
  { co: 'yai',          text: 'Grokk posts something unhinged. Advertisers flee (again).', fx: E => E.mult('yai', 0.6) },
  { co: 'overthinking', text: "Mark Zuckerborg offers Overthinking Machines' research team $300M each. Most of them say yes.", fx: E => E.mult('overthinking', 0.4) },
  { co: 'harvee',       text: "Harvée's AI cites six court cases that don't exist. In court.", fx: E => E.mult('harvee', 0.5) },
  { co: 'databrickd',   text: 'Databrickd delays its IPO "until the vibes are right" (fourth time).', fx: E => E.mult('databrickd', 0.85) },
  { co: 'lovabull',     text: 'Every Lovabull app turns out to share one leaked API key.', fx: E => E.mult('lovabull', 0.4) },
  { text: 'Dario Amodayo publishes a 40,000-word essay. Your LPs ask you to summarise it by Monday. You lose a month.', when: (S, C) => S.month <= C.MONTHS - 2, fx: E => E.loseMonth() },
  { text: 'Mark Zuckerborg announces "personal superintelligence". Nobody can define it.', fx: E => { E.mult('overthinking', 0.85); E.mult('pss', 0.85); } },
];

const EXIT_TEXT = {
  ipoPop:    (c, x) => `${c.n} IPOs! Shares open up ${x}%. 3-month lockup before insiders can sell.`,
  ipoFlop:   (c, x) => `${c.n} IPOs… down ${x}%. "Priced to perfection," says the bank. 3-month lockup.`,
  acquired:  (c, buyer, b) => `${buyer} buys ${c.n} for $${b}B.`,
  acquihire: (c, buyer, cents) => `${buyer} hires ${c.n}'s founders and "licenses" the tech. Investors get ${cents}¢ on the dollar.`,
  down:      (c, x) => `${c.n} raises a "structured" round at ${x}% off. Nobody says "down round".`,
  dead:      c => `${c.n} pivots to crypto, then to nothing. Shut down.`,
  tender:    c => `${c.n} is running an employee tender and will buy your whole stake at 10% above the mark.`,
};

const TITLES = [
  { min: 5,   t: 'Generational GP' },
  { min: 3,   t: 'Kingmaker' },
  { min: 2,   t: 'Top Quartile' },
  { min: 1,   t: 'Tourist VC' },
  { min: 0.5, t: 'Zombie Fund' },
  { min: -1e9, t: 'Wiped Out' },
];

return { CONFIG, COMPANIES, HUBS, LPS, LAWYERS, REGULATORS, ACQUIRERS, ACQUIHIRERS, NEWS, EXIT_TEXT, TITLES };
})();

if (typeof module !== 'undefined') module.exports = AIW_DATA;
