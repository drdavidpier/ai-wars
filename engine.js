// AI Wars: game rules. No DOM access, so it can run in the browser or in Node (sim.js).
const AIW_ENGINE = (() => {
const D = typeof AIW_DATA !== 'undefined' ? AIW_DATA : require('./data.js');
const C = D.CONFIG;

// ---------- RNG ----------
let rng = Math.random;
const setRng = f => { rng = f; };
const rnd = (a, b) => a + rng() * (b - a);
const rint = (a, b) => Math.floor(rng() * (b - a + 1)) + a;
const chance = p => rng() < p;
const pick = a => a[Math.floor(rng() * a.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r1 = n => Math.round(n * 10) / 10;
function gauss() { let u = 0; while (!u) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); }
function wpick(items) {
  const tot = items.reduce((a, i) => a + i.w, 0);
  let x = rng() * tot;
  for (const i of items) if ((x -= i.w) < 0) return i;
  return items[items.length - 1];
}

// ---------- FORMATTING ----------
function fm(n) { // $M amount
  const s = n < 0 ? '-' : '', a = Math.abs(n);
  if (a >= 1000) return `${s}$${(a / 1000).toFixed(2)}B`;
  if (a >= 100) return `${s}$${a.toFixed(0)}M`;
  return `${s}$${a.toFixed(1)}M`;
}
function fv(b) { // $B valuation
  if (b >= 10) return `$${b.toFixed(0)}B`;
  if (b >= 1) return `$${b.toFixed(1)}B`;
  return `$${(b * 1000).toFixed(0)}M`;
}

// ---------- STATE HELPERS ----------
const hub = S => D.HUBS[S.hub];
const active = c => c.status === 'private' || c.status === 'public';
const stakeVal = c => (active(c) ? c.own * c.v * 1000 : 0);
const marks = S => S.cos.reduce((a, c) => a + stakeVal(c), 0);
const computeVal = S => S.mw * C.COMPUTE_BASE * S.cidx;
const closeValue = S => S.cash + C.CLOSE_HAIRCUT * (marks(S) + computeVal(S)) - S.loan;
const tvpi = S => closeValue(S) / S.raised;
const holds = (S, id) => S.cos.some(c => c.id === id && c.own > 0 && active(c));
const maxBorrow = S => Math.max(0, C.LOAN_LTV * marks(S) - S.loan);
const scale = S => 1 + S.raised / 200; // deal sizes grow with the fund
const X = { tvpi, holds };

function log(S, msg) { S.log.unshift({ m: S.month, msg }); S.log = S.log.slice(0, 60); }
function headline(S, msg) { S.ticker.unshift(msg); S.ticker = S.ticker.slice(0, 12); log(S, msg); }
function notice(title, text, sfx) { return { title, text, sfx, options: [{ label: 'OK', key: 'ok', primary: true }], resolve: () => ({ done: true }) }; }

// ---------- NEW GAME ----------
function newGame(fund) {
  const S = {
    fund: fund || 'Fund I', month: 1, hub: 0,
    cash: C.START_CASH, raised: C.START_CASH, rep: C.START_REP,
    mw: 0, gridCap: C.GRID_CAP, loan: 0, cidx: 1, smuggle: 0,
    lawyers: [], lawyerOffer: null, pitched: false,
    cos: D.COMPANIES.map(c => ({ ...c, v0: c.v, pv: c.v, status: 'private', lock: 0, own: 0, cost: 0 })),
    lps: D.LPS.map((l, i) => ({ ...l, status: i === 0 ? 'in' : 'open', cool: 0 })),
    market: null, pending: [], log: [], ticker: [], over: false, fired: false, result: null,
  };
  rollMarket(S);
  S.lawyerOffer = makeLawyerOffer(S);
  log(S, `Month 1. ${S.fund} opens on Sand Hill Road with ${fm(S.cash)} from Uncle Barry.`);
  return S;
}

// ---------- MARKET ----------
function quoteFor(S, c, h) {
  if (c.status === 'public') return { q: c.v * rnd(0.97, 1.03), block: Infinity, demand: Infinity };
  if (c.status !== 'private') return null;
  const base = { hot: 0.3, warm: 0.65, penny: 0.8 }[c.tier];
  const p = base * (c.tier === 'hot' ? (h.hotBoost || 1) : 1);
  if (!chance(Math.min(0.95, p))) return null;
  const q = c.v * rnd(0.8, 1.25) * h.quote * ((h.special || {})[c.id] || 1);
  const range = { hot: [2, 10], warm: [3, 25], penny: [0.2, 2] }[c.tier];
  const block = r1(rnd(range[0], range[1]) * scale(S));
  return { q, block, demand: r1(block * rnd(1.5, 3)) };
}
function rollMarket(S) {
  const h = hub(S);
  const cp = h.id === 'singapore' && S.smuggle > 0 ? null : C.COMPUTE_BASE * S.cidx * h.compute * rnd(0.9, 1.1);
  S.market = { quotes: S.cos.map(c => quoteFor(S, c, h)), cp };
}

// ---------- PLAYER ACTIONS ----------
function maxBuy(S, i) {
  const q = S.market.quotes[i];
  if (!q || S.over) return 0;
  return Math.max(0, Math.min(S.cash, q.block));
}
function maxSell(S, i) {
  const c = S.cos[i], q = S.market.quotes[i];
  if (!q || S.over || c.own <= 0 || c.lock > 0) return 0;
  return Math.min(c.own * q.q * 1000, q.demand);
}
function buy(S, i, amt) {
  const c = S.cos[i], q = S.market.quotes[i];
  amt = Math.min(amt, maxBuy(S, i));
  if (amt <= 0) return false;
  c.own += amt / (q.q * 1000); c.cost += amt;
  S.cash -= amt; q.block -= amt;
  log(S, `Bought ${fm(amt)} of ${c.n} at a ${fv(q.q)} valuation.`);
  return true;
}
function sell(S, i, amt) {
  const c = S.cos[i], q = S.market.quotes[i];
  const full = c.own * q.q * 1000;
  amt = Math.min(amt, maxSell(S, i));
  if (amt <= 0) return false;
  const frac = amt >= full - 1e-6 ? 1 : amt / full;
  c.own *= 1 - frac; c.cost *= 1 - frac;
  if (frac === 1) { c.own = 0; c.cost = 0; }
  S.cash += amt; q.demand -= amt;
  log(S, `Sold ${fm(amt)} of ${c.n} at a ${fv(q.q)} valuation.`);
  return true;
}
const maxBuyMW = S => S.market.cp && !S.over ? Math.max(0, Math.min(S.gridCap - S.mw, Math.floor(S.cash / S.market.cp))) : 0;
const computeSellPrice = S => S.market.cp ? S.market.cp * C.COMPUTE_SELL : 0;
function buyCompute(S, mw) {
  mw = Math.min(Math.floor(mw), maxBuyMW(S));
  if (mw <= 0) return false;
  S.cash -= mw * S.market.cp; S.mw += mw;
  log(S, `Bought ${mw} MW of compute for ${fm(mw * S.market.cp)}.`);
  return true;
}
function sellCompute(S, mw) {
  mw = Math.min(Math.floor(mw), S.mw);
  if (mw <= 0 || !S.market.cp) return false;
  S.cash += mw * computeSellPrice(S); S.mw -= mw;
  log(S, `Sold ${mw} MW of compute for ${fm(mw * computeSellPrice(S))}.`);
  return true;
}
function borrow(S, amt) {
  amt = Math.min(amt, maxBorrow(S));
  if (amt <= 0) return false;
  S.loan += amt; S.cash += amt;
  log(S, `Borrowed ${fm(amt)} from Apollyon Credit.`);
  return true;
}
function repay(S, amt) {
  amt = Math.min(amt, S.cash, S.loan);
  if (amt <= 0) return false;
  S.loan -= amt; S.cash -= amt;
  if (S.loan < 0.01) S.loan = 0;
  log(S, `Repaid ${fm(amt)} to Apollyon Credit.`);
  return true;
}
function lpsHere(S) { return S.lps.filter(l => l.hub === hub(S).id && l.status !== 'in'); }
function lpReq(S, l) { return l.req(S, X); }
function pitchChance(S) { return clamp(0.35 + (S.rep - 50) / 100 + (tvpi(S) - 1) * 0.3, 0.1, 0.9); }
function pitch(S, id) {
  const l = S.lps.find(x => x.id === id);
  if (!l || S.pitched || l.status !== 'open' || lpReq(S, l) || S.over) return null;
  S.pitched = true;
  if (chance(pitchChance(S))) {
    l.status = 'in'; S.cash += l.amt; S.raised += l.amt;
    const msg = `${l.n} commits ${fm(l.amt)} to ${S.fund}!`;
    headline(S, msg);
    return { ok: true, msg };
  }
  l.status = 'cool'; l.cool = 3;
  const msg = `${l.n} passes. "Come back when you have more conviction." (Try again in 3 months.)`;
  log(S, msg);
  return { ok: false, msg };
}
function makeLawyerOffer(S) {
  const l = pick(D.LAWYERS);
  return { lawyer: l, price: r1(rnd(l.min, l.max) * scale(S)) };
}
function hireLawyer(S) {
  const o = S.lawyerOffer;
  if (!o || S.cash < o.price) return false;
  S.cash -= o.price; S.lawyers.push(o.lawyer); S.lawyerOffer = null;
  log(S, `Hired a ${o.lawyer.n} for ${fm(o.price)}.`);
  return true;
}

// ---------- MONTHLY TICK ----------
function tick(S) {
  S.month++;
  const ev = [];
  for (const c of S.cos) {
    c.pv = c.v;
    if (active(c)) c.v *= Math.exp(C.DRIFT + c.vol * gauss());
    if (c.lock > 0) c.lock--;
  }
  for (const c of S.cos) if (c.status === 'private') { const e = rollExit(S, c); if (e) ev.push(e); }
  S.cidx = clamp(S.cidx * Math.exp(0.08 * gauss()), 0.4, 4);
  if (S.smuggle > 0) S.smuggle--;
  for (const l of S.lps) if (l.status === 'cool' && --l.cool <= 0) l.status = 'open';
  if (S.loan > 0) S.loan *= 1 + C.LOAN_RATE;
  if (S.mw > 0) S.cash -= S.mw * C.POWER_BILL;

  const dp = S.lps.find(l => l.id === 'diamond');
  if (dp.status === 'in' && S.cash > 0 && chance(0.1)) {
    const amt = Math.min(10, S.cash);
    S.cash -= amt; S.raised -= amt;
    log(S, `0xDiamondPaws pulled ${fm(amt)}.`);
    ev.push(notice('LP needs liquidity', `0xDiamondPaws "needs liquidity" (a memecoin went to zero) and pulls ${fm(amt)} back out of the fund.`, 'hacked'));
  }

  const mk = marks(S);
  if (S.loan > 0 && S.loan > C.COVENANT * mk) {
    const big = S.cos.filter(c => active(c) && c.own > 0).sort((a, b) => stakeVal(b) - stakeVal(a))[0];
    if (big) {
      const val = stakeVal(big), seize = Math.min(val * 0.3, S.loan);
      big.own *= 1 - seize / val; big.cost *= 1 - seize / val;
      S.loan -= seize;
      log(S, `Covenant breach: Apollyon seized ${fm(seize)} of ${big.n}.`);
      ev.push(notice('Covenant breach', `Your NAV loan is over ${C.COVENANT * 100}% of your marks. Apollyon Credit seizes ${fm(seize)} of your ${big.n} stake and knocks it off the loan.`, 'margin'));
    }
  }
  return ev;
}

function rollExit(S, c) {
  const T = D.EXIT_TEXT, E = C.EXIT, held = c.own > 0;
  const tell = (title, text, sfx) => { headline(S, text); return held ? notice(title, text, sfx) : null; };

  if (c.id !== 'clueless' && c.v >= 10 && S.month >= 6 && chance(E.ipo)) {
    const f = rnd(0.7, 2.0);
    c.v *= f; c.status = 'public'; c.lock = 3;
    if (held && f > 1) S.rep = Math.min(100, S.rep + 3);
    const x = Math.round(Math.abs(f - 1) * 100);
    return tell('IPO!', f >= 1 ? T.ipoPop(c, x) : T.ipoFlop(c, x), f >= 1 ? 'win' : 'margin');
  }
  if (c.v < 50 && chance(E.acq)) {
    const buyer = pick(D.ACQUIRERS), mult = rnd(1.0, 1.6);
    c.v *= mult;
    const pay = stakeVal(c);
    let text = T.acquired(c, buyer, c.v >= 1 ? c.v.toFixed(1) : c.v.toFixed(2));
    if (held) { S.cash += pay; text += ` Your stake pays out ${fm(pay)}.`; if (pay > c.cost) S.rep = Math.min(100, S.rep + 3); }
    c.status = 'acquired'; c.own = 0;
    return tell('Acquired', text, 'cash');
  }
  if (c.tier === 'hot' && c.v < 40 && chance(E.acquihire)) {
    const buyer = pick(D.ACQUIHIRERS), f = rnd(0.3, 1.0);
    const pay = stakeVal(c) * f;
    let text = T.acquihire(c, buyer, Math.round(f * 100));
    if (held) { S.cash += pay; text += ` You get ${fm(pay)}.`; }
    c.status = 'acquihired'; c.own = 0;
    return tell('Reverse acqui-hire', text, 'margin');
  }
  const shut = c.id === 'clueless' ? 0.03 : c.id === 'lovabull' ? 0.01 : E.shut;
  if (chance(shut)) {
    c.status = 'dead'; c.v = 0;
    const text = T.dead(c) + (held ? ` Your ${fm(c.cost)} is gone.` : '');
    c.own = 0;
    return tell('Shut down', text, 'dead');
  }
  if (chance(E.down)) {
    const f = rnd(0.4, 0.7);
    c.v *= f;
    return tell('Down round', T.down(c, Math.round((1 - f) * 100)), 'margin');
  }
  if (held && chance(E.tender)) {
    return {
      title: 'Tender offer', sfx: 'cash',
      text: T.tender(c) + ` That's ${fm(stakeVal(c) * 1.1)} for your stake.`,
      options: [{ label: 'Keep it', key: 'no' }, { label: 'Sell everything', key: 'yes', primary: true }],
      resolve: k => {
        if (k === 'yes' && c.own > 0) {
          const pay = stakeVal(c) * 1.1;
          S.cash += pay; c.own = 0; c.cost = 0;
          log(S, `Sold your whole ${c.n} stake in a tender for ${fm(pay)}.`);
        }
        return { done: true };
      },
    };
  }
  return null;
}

// ---------- MONTHLY EVENTS ----------
function fxApi(S) {
  const api = {
    S, rnd,
    mult(id, f) {
      const i = S.cos.findIndex(c => c.id === id), c = S.cos[i];
      if (!c || !active(c)) return;
      c.v *= f;
      const q = S.market.quotes[i]; if (q) q.q *= f;
    },
    all(f) { S.cos.forEach(c => { if (c.status === 'private') api.mult(c.id, f); }); },
    compute(f) { S.cidx = clamp(S.cidx * f, 0.4, 4); if (S.market.cp) S.market.cp *= f; },
    extra: [],
    loseMonth() { api.extra.push(...tick(S)); rollMarket(S); S.pitched = false; },
  };
  return api;
}

function newsEvent(S) {
  const pool = D.NEWS.filter(n => (!n.co || active(S.cos.find(c => c.id === n.co))) && (!n.when || n.when(S, C)));
  if (!pool.length) return [];
  const n = pick(pool), E = fxApi(S);
  n.fx(E);
  headline(S, n.text);
  return [notice('Breaking news', n.text, 'news'), ...E.extra];
}

function encounter(S) {
  const h = hub(S), sc = scale(S);
  const priv = S.cos.filter(c => c.status === 'private');
  const heldPriv = priv.filter(c => c.own > 0);
  const cp = C.COMPUTE_BASE * S.cidx;
  const list = [];
  const add = (w, fn) => list.push({ w, fn });

  if (S.cash > 1) add(1, () => {
    const lost = S.cash * rnd(0.1, 0.3); S.cash -= lost;
    log(S, `Wire fraud: lost ${fm(lost)}.`);
    return notice('Wire fraud', `Someone spoofed a founder's email and redirected your wire. ${fm(lost)} is gone.`, 'hacked');
  });
  if (heldPriv.length) add(1, () => {
    const c = pick(heldPriv), part = c.own * 0.3, pay = part * c.v * 1000 * 0.7;
    c.cost *= 0.7; c.own -= part; S.cash += pay;
    log(S, `Forced to sell 30% of ${c.n} at a discount for ${fm(pay)}.`);
    return notice('LP wants a distribution', `An LP demands "DPI, not TVPI". You dump 30% of your ${c.n} stake at a 30% discount for ${fm(pay)}.`, 'margin');
  });
  if (priv.length) add(1, () => {
    const c = pick(priv), val = r1(rnd(1, 4));
    c.own += val / (c.v * 1000);
    log(S, `Found a forgotten ${c.n} SAFE worth ${fm(val)}.`);
    return notice('Old angel cheque', `A 2019 SAFE you forgot about turns out to be in ${c.n}. It's worth ${fm(val)}.`, 'win');
  });
  const warm = priv.filter(c => c.tier !== 'hot');
  if (warm.length && S.cash >= 2) add(2, () => {
    const c = pick(warm), amt = r1(Math.min(S.cash, rnd(3, 15) * sc)), price = c.v * 0.8;
    return {
      title: 'Founder favour', sfx: 'news',
      text: `The founder of ${c.n} lets you into their round "as a friend": ${fm(amt)} at ${fv(price)}, 20% below the mark.`,
      options: [{ label: 'Pass', key: 'no' }, { label: `Invest ${fm(amt)}`, key: 'yes', primary: true, disabled: S.cash < amt }],
      resolve: k => {
        if (k === 'yes' && S.cash >= amt && active(c)) { S.cash -= amt; c.own += amt / (price * 1000); c.cost += amt; log(S, `Invested ${fm(amt)} in ${c.n} at ${fv(price)}.`); }
        return { done: true };
      },
    };
  });
  const hot = priv.filter(c => c.tier === 'hot');
  if (hot.length) add(h.id === 'sandhill' ? 6 : 3, () => {
    const c = pick(hot), amt = r1(rnd(10, 40) * sc), mw = Math.ceil(amt / 2);
    const ok = S.cash >= amt && S.mw >= mw;
    return {
      title: 'Hot round', sfx: 'news',
      text: `${c.n} is raising at ${fv(c.v)}. They'll give you a ${fm(amt)} allocation, but only if you bring ${mw} MW of compute. You have ${fm(S.cash)} and ${S.mw} MW.`,
      options: [{ label: 'Pass', key: 'no' }, { label: ok ? `Invest + ${mw} MW` : 'Not enough cash/compute', key: 'yes', primary: true, disabled: !ok }],
      resolve: k => {
        if (k === 'yes' && S.cash >= amt && S.mw >= mw && active(c)) {
          S.cash -= amt; S.mw -= mw; c.own += amt / (c.v * 1000); c.cost += amt;
          const step = rnd(1.1, 1.4); fxApi(S).mult(c.id, step);
          S.rep = Math.min(100, S.rep + 2);
          headline(S, `${S.fund} joins ${c.n}'s round. The round closes and the mark jumps ${Math.round((step - 1) * 100)}%.`);
        }
        return { done: true };
      },
    };
  });
  add(1.2, () => {
    const o = makeLawyerOffer(S);
    return {
      title: 'Legal help', sfx: 'news',
      text: `A ${o.lawyer.n} offers to join your legal team for a ${fm(o.price)} retainer.`,
      options: [{ label: 'No thanks', key: 'no' }, { label: 'Hire', key: 'yes', primary: true, disabled: S.cash < o.price }],
      resolve: k => { if (k === 'yes' && S.cash >= o.price) { S.cash -= o.price; S.lawyers.push(o.lawyer); log(S, `Hired a ${o.lawyer.n}.`); } return { done: true }; },
    };
  });
  const nucCost = r1(5 * sc);
  if (S.cash >= nucCost) add(0.7, () => ({
    title: 'Nuclear startup', sfx: 'news',
    text: `A nuclear startup offers your data center a small reactor "by Q3" for ${fm(nucCost)}. It would add 40 MW to your grid cap.`,
    options: [{ label: 'Pass', key: 'no' }, { label: `Pay ${fm(nucCost)}`, key: 'yes', primary: true }],
    resolve: k => {
      if (k !== 'yes' || S.cash < nucCost) return { done: true };
      S.cash -= nucCost;
      if (chance(0.5)) { S.gridCap += 40; log(S, 'The reactor is real. +40 MW grid cap.'); return { done: true, then: [notice('It works!', 'The reactor is real. Your grid cap goes up by 40 MW.', 'win')] }; }
      log(S, 'The reactor was a rendering.');
      return { done: true, then: [notice('About that reactor…', "It was a rendering. A very nice rendering. Your money's gone.", 'margin')] };
    },
  }));
  if (S.mw > 0) add(0.7, () => {
    const lost = Math.max(1, Math.round(S.mw * 0.2)); S.mw -= lost;
    log(S, `Cooling failure: lost ${lost} MW.`);
    return notice('Heatwave', `Your data center's cooling fails during a Texas heatwave. You lose ${lost} MW.`, 'margin');
  });
  add(0.7, () => { S.gridCap += 25; log(S, 'Interconnect approved: +25 MW grid cap.'); return notice('Interconnect approved', 'The utility approves your interconnect. Grid cap +25 MW.', 'win'); });
  const room = S.gridCap - S.mw, half = cp * 0.5;
  if (room >= 5 && S.cash >= half * 5) add(1, () => {
    const mw = Math.min(20, room, Math.floor(S.cash / half));
    return {
      title: 'Starlight fire sale', sfx: 'news',
      text: `Starlight Data Centers over-built (again). They offer you ${mw} MW at half price: ${fm(mw * half)}, payable today.`,
      options: [{ label: 'Pass', key: 'no' }, { label: 'Buy', key: 'yes', primary: true }],
      resolve: k => { if (k === 'yes' && S.cash >= mw * half && S.gridCap - S.mw >= mw) { S.cash -= mw * half; S.mw += mw; log(S, `Bought ${mw} MW from Starlight at half price.`); } return { done: true }; },
    };
  });
  if (holds(S, 'clueless')) add(0.5, () => {
    S.rep = Math.max(1, S.rep - 5);
    return notice('Uncle Barry calls', 'Uncle Barry asks why the fund owns something called "Clueless". Reputation −5.', 'margin');
  });
  if (S.lps.find(l => l.id === 'diamond').status === 'in') add(0.5, () => {
    const amt = r1(5 * sc);
    return {
      title: '0xDiamondPaws', sfx: 'news',
      text: `0xDiamondPaws wants their next distribution paid in memecoins. Pay ${fm(amt)} to "make it right", or refuse and take the reputation hit.`,
      options: [{ label: 'Refuse (−10 rep)', key: 'no' }, { label: `Pay ${fm(amt)}`, key: 'yes', primary: true, disabled: S.cash < amt }],
      resolve: k => { if (k === 'yes' && S.cash >= amt) S.cash -= amt; else S.rep = Math.max(1, S.rep - 10); return { done: true }; },
    };
  });
  if (S.mw >= 40) add(0.7, () => {
    const price = cp * 2;
    return {
      title: 'Strategic partnership', sfx: 'cash',
      text: `Kingdom Vision Fund wants a "strategic data center partnership". They'll buy 30 MW at ${fm(price)} per MW (2× the market).`,
      options: [{ label: 'Decline', key: 'no' }, { label: `Sell 30 MW for ${fm(price * 30)}`, key: 'yes', primary: true }],
      resolve: k => { if (k === 'yes' && S.mw >= 30) { S.mw -= 30; S.cash += price * 30; log(S, `Sold 30 MW to Kingdom Vision for ${fm(price * 30)}.`); } return { done: true }; },
    };
  });
  add(0.3, () => notice('LP request', 'An LP\'s intern asks for your "AI exposure breakdown" as a pie chart. It is one slice.', 'news'));

  return wpick(list).fn();
}

function regChance(S) {
  const hotHeld = S.cos.filter(c => c.tier === 'hot' && c.own > 0 && active(c)).length;
  const gulf = S.lps.some(l => (l.id === 'sandbox' || l.id === 'kingdom') && l.status === 'in');
  return Math.min(0.2, 0.03 + 0.0015 * S.mw + 0.025 * hotHeld + (gulf ? 0.03 : 0));
}

function regulator(S) {
  const R = D.REGULATORS;
  const hotHeld = S.cos.filter(c => c.tier === 'hot' && c.own > 0 && active(c)).length;
  const gulf = S.lps.some(l => (l.id === 'sandbox' || l.id === 'kingdom') && l.status === 'in');
  const ag = gulf && chance(0.5) ? R.cfius : hotHeld >= 2 && chance(0.6) ? R.ftc : pick(Object.values(R));
  let n = 1 + rint(0, Math.min(3, 1 + Math.floor(S.month / 8)));
  const start = n;
  let taken = 0;
  log(S, ag.open(n));
  const ev = {
    title: ag.title, sfx: 'alarm', meter: true,
    lines: [ag.open(n)],
    get text() { return `Reputation <b>${S.rep}</b> · Investigators <b>${n}</b> · Lawyers <b>${S.lawyers.length}</b>`; },
    get options() {
      return [
        { label: 'Go dark', key: 'run', primary: true },
        { label: 'Stall', key: 'stand' },
        { label: 'Lawyer up', key: 'fight', disabled: S.lawyers.length === 0 },
      ];
    },
    resolve(k) {
      const L = [];
      if (k === 'run') {
        if (chance(Math.max(0.25, 0.62 - n * 0.05))) {
          log(S, 'You went dark and the investigation fizzled.');
          return { done: true, then: [notice('Off the hook', 'You go dark: no emails, disappearing messages only. They lose interest.', 'win')] };
        }
        L.push("Too late. They've already subpoenaed your Slack.");
      } else if (k === 'stand') {
        L.push('You say nothing and hope it blows over.');
      } else {
        const power = S.lawyers.reduce((a, l) => a + l.power, 0);
        if (chance(Math.min(0.85, 0.25 + power))) {
          n--;
          if (n === 0) return { done: true, then: won() };
          L.push('Your lawyers get one investigator reassigned!');
        } else L.push('Your lawyers file a motion. Denied.');
      }
      if (chance(Math.min(0.75, 0.28 + n * 0.06))) {
        const d = rint(4, 9) + n;
        S.rep = Math.max(0, S.rep - d); taken += d;
        L.push(`A leak hits the press! (−${d} reputation)`);
        if (S.rep <= 0) {
          S.fired = true; S.over = true;
          log(S, 'Your LPs fired you.');
          return { done: true, then: [notice('Fired', `Your reputation is gone. Your LPs invoke the key-person clause and fire you in month ${S.month}.`, 'dead')] };
        }
      } else L.push('They request more documents. Nothing sticks. Yet.');
      ev.lines = L;
      ev.hit = L.some(x => x.includes('reputation'));
      return { done: false };
    },
  };
  function won() {
    const pay = r1(rnd(1, 3) * start * scale(S));
    S.cash += pay; S.rep = Math.min(100, S.rep + 5);
    headline(S, `Case dismissed. ${S.fund} wins a ${fm(pay)} settlement.`);
    const out = [notice('Case dismissed', `Your lawyers get the case thrown out, and you win a ${fm(pay)} settlement. Reputation +5.`, 'win')];
    if (taken > 0) {
      const cost = r1(taken * rnd(0.1, 0.2) * scale(S));
      out.push({
        title: 'Crisis PR', sfx: 'news',
        text: `A crisis PR firm will win back the ${taken} reputation you lost for ${fm(cost)}.`,
        options: [{ label: 'No thanks', key: 'no' }, { label: `Pay ${fm(cost)}`, key: 'yes', primary: true, disabled: S.cash < cost }],
        resolve: kk => { if (kk === 'yes' && S.cash >= cost) { S.cash -= cost; S.rep = Math.min(100, S.rep + taken); log(S, `Paid a PR firm ${fm(cost)}.`); } return { done: true }; },
      });
    }
    return out;
  }
  return ev;
}

// ---------- TRAVEL ----------
function travel(S, h) {
  if (S.over || S.month >= C.MONTHS || h === S.hub || S.pending.length) return false;
  S.hub = h;
  const ev = tick(S);
  rollMarket(S);
  S.pitched = false;
  S.lawyerOffer = hub(S).id === 'sandhill' ? makeLawyerOffer(S) : null;
  log(S, `Month ${S.month}. You fly to ${hub(S).n}.`);
  if (chance(C.NEWS_CHANCE)) ev.push(...newsEvent(S));
  if (chance(C.ENCOUNTER_CHANCE)) { const e = encounter(S); if (e) ev.push(e); }
  if (chance(regChance(S))) ev.push(regulator(S));
  if (S.month === C.MONTHS) ev.push(notice('Final month',
    `This is your last month. When the fund closes, unexited stakes and compute count at only ${C.CLOSE_HAIRCUT * 100}% of their value. Sell what you can, repay the NAV loan, then close the fund.`, 'warn'));
  S.pending.push(...ev);
  return true;
}

// Resolve the event at the head of the queue with a choice key.
function resolve(S, key) {
  const ev = S.pending[0];
  if (!ev) return;
  const r = ev.resolve ? ev.resolve(key) : { done: true };
  if (!r || r.done !== false) {
    S.pending.shift();
    if (r && r.then) S.pending.unshift(...r.then);
  }
  if (S.over) S.pending = S.pending.filter(e => e.title === 'Fired');
}

// ---------- CLOSE ----------
function finalize(S) {
  S.over = true;
  const value = closeValue(S), t = value / S.raised, hurdle = S.raised * C.HURDLE;
  const carry = S.fired ? 0 : Math.max(0, C.CARRY * (value - hurdle));
  const title = S.fired ? 'Fired by LPs' : D.TITLES.find(x => t >= x.min).t;
  S.result = { value, tvpi: t, carry, title, raised: S.raised, hurdle, month: S.month, fired: S.fired };
  return S.result;
}

return {
  D, C, setRng, fm, fv, hub, active, stakeVal, marks, computeVal, closeValue, tvpi, maxBorrow,
  newGame, travel, resolve, finalize, buy, sell, maxBuy, maxSell, buyCompute, sellCompute, maxBuyMW, computeSellPrice,
  borrow, repay, lpsHere, lpReq, pitch, pitchChance, hireLawyer, regChance,
};
})();

if (typeof module !== 'undefined') module.exports = AIW_ENGINE;
