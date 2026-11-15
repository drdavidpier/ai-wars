// Balance simulator: node sim.js [games]
// Plays AI Wars headlessly with simple bot strategies and prints outcome distributions.
const G = require('./engine.js');
const C = G.C;

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function drain(S, policy) {
  let guard = 0;
  while (S.pending.length && guard++ < 200) {
    const ev = S.pending[0];
    G.resolve(S, policy.choose(S, ev));
  }
}

const POLICIES = {
  idle: {
    act() {},
    choose(S, ev) { const o = ev.options.find(o => o.key === 'run') || ev.options.find(o => o.key === 'no') || ev.options[0]; return o.key; },
  },
  trader: {
    act(S) {
      const last = S.month === C.MONTHS;
      S.cos.forEach((c, i) => {
        const q = S.market.quotes[i];
        if (q && c.own > 0 && (last || q.q / c.v >= 1.05)) G.sell(S, i, G.maxSell(S, i));
      });
      if (last) {
        G.sellCompute(S, S.mw); G.repay(S, S.loan); return;
      }
      for (const l of G.lpsHere(S)) if (l.status === 'open' && !G.lpReq(S, l)) G.pitch(S, l.id);
      if (S.lawyerOffer && S.lawyers.length < 2 && S.cash > S.lawyerOffer.price * 10) G.hireLawyer(S);
      const cp = S.market.cp, base = C.COMPUTE_BASE * S.cidx;
      if (cp && cp > base * 1.15 && S.mw > 20) G.sellCompute(S, S.mw - 20);
      if (cp && cp < base * 0.85 && S.mw < 40) G.buyCompute(S, Math.min(40 - S.mw, Math.floor(S.cash * 0.3 / cp)));
      const deals = S.cos.map((c, i) => ({ i, r: S.market.quotes[i] ? S.market.quotes[i].q / c.v : 9 }))
        .filter(d => d.r <= 0.92).sort((a, b) => a.r - b.r);
      for (const d of deals) G.buy(S, d.i, S.cash * 0.9);
    },
    choose(S, ev) {
      const keys = ev.options.filter(o => !o.disabled).map(o => o.key);
      if (keys.includes('fight')) return 'fight';
      if (keys.includes('run')) return 'run';
      if (ev.title.startsWith('Nuclear')) return 'no';
      if (keys.includes('yes')) return 'yes';
      return keys[0];
    },
  },
};

function play(policyName, seed) {
  G.setRng(mulberry32(seed));
  const P = POLICIES[policyName];
  const S = G.newGame('Sim');
  while (!S.over) {
    drain(S, P);
    if (S.over) break;
    P.act(S);
    if (S.month >= C.MONTHS) break;
    let h; do { h = Math.floor(Math.random() * G.D.HUBS.length); } while (h === S.hub);
    G.travel(S, h);
  }
  const r = G.finalize(S);
  r.lps = S.lps.filter(l => l.status === 'in').length;
  r.regs = S.log.filter(l => /assigned/.test(l.msg)).length;
  return r;
}

const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
function report(name, rs) {
  const t = rs.map(r => r.tvpi).sort((a, b) => a - b);
  const c = rs.map(r => r.carry).sort((a, b) => a - b);
  const raised = rs.map(r => r.raised).sort((a, b) => a - b);
  const titles = {};
  rs.forEach(r => titles[r.title] = (titles[r.title] || 0) + 1);
  const f = x => x.toFixed(2);
  console.log(`\n== ${name} (${rs.length} games)`);
  console.log(`TVPI   p10 ${f(pct(t, .1))}  p50 ${f(pct(t, .5))}  p90 ${f(pct(t, .9))}  p99 ${f(pct(t, .99))}`);
  console.log(`Carry  p10 ${G.fm(pct(c, .1))}  p50 ${G.fm(pct(c, .5))}  p90 ${G.fm(pct(c, .9))}  p99 ${G.fm(pct(c, .99))}`);
  console.log(`Raised p50 ${G.fm(pct(raised, .5))}  p90 ${G.fm(pct(raised, .9))}   LPs in (avg) ${f(rs.reduce((a, r) => a + r.lps, 0) / rs.length)}   regulator cases (avg) ${f(rs.reduce((a, r) => a + r.regs, 0) / rs.length)}`);
  console.log('Titles ' + Object.entries(titles).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / rs.length).toFixed(0)}%`).join(' · '));
}

const N = +process.argv[2] || 3000;
for (const name of Object.keys(POLICIES)) {
  const rs = [];
  for (let i = 0; i < N; i++) rs.push(play(name, i + 1));
  report(name, rs);
}
