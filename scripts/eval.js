#!/usr/bin/env node
/**
 * MACK evaluation harness.
 *   node scripts/eval.js            -> offline retrieval eval (hit@1, hit@3, MRR)
 *   node scripts/eval.js --live     -> also asks the deployed API and grades answers
 *
 * Env: GEMINI_API_KEY (enables hybrid retrieval), MACK_URL (live endpoint),
 *      EVAL_WRITE=1 (write evals/latest.json for the website badge)
 * Exits 1 when a score falls below the thresholds in evals/golden.json.
 */
const fs = require('fs');
const path = require('path');
const { createRetriever } = require('../api/_lib/rag');

const ROOT = path.join(__dirname, '..');
const kb = JSON.parse(fs.readFileSync(path.join(ROOT, 'api', '_data', 'kb.json'), 'utf8'));
const golden = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', 'golden.json'), 'utf8'));
const LIVE = process.argv.includes('--live');
const URL = process.env.MACK_URL || 'https://mayur-dokras-github-io.vercel.app/api/chat';
const apiKey = process.env.GEMINI_API_KEY;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pct = (x) => (x * 100).toFixed(0) + '%';

function matches(chunk, expect) {
    return expect.some(e => (chunk.title + ' ' + chunk.section).toLowerCase().includes(e.toLowerCase()));
}

async function retrievalEval() {
    const { retrieve } = createRetriever(kb);
    const rows = [];
    let h1 = 0, h3 = 0, mrr = 0, n = 0, mode = 'bm25';
    for (const c of golden.cases.filter(c => c.expect.length)) {
        const r = await retrieve(c.q, { k: 5, apiKey });
        mode = r.mode;
        const rank = r.chunks.findIndex(ch => matches(ch, c.expect)) + 1;
        n++;
        if (rank === 1) h1++;
        if (rank && rank <= 3) h3++;
        if (rank) mrr += 1 / rank;
        rows.push({ q: c.q, rank, top: r.chunks[0] ? `${r.chunks[0].title} › ${r.chunks[0].section}` : '-' });
    }
    return { mode, n, hit1: h1 / n, hit3: h3 / n, mrr: mrr / n, rows };
}

function grade(answer, c) {
    const a = answer.toLowerCase();
    const okMust = (c.must || []).every(group => group.toLowerCase().split('|').some(alt => a.includes(alt)));
    const okNot = (c.mustNot || []).every(bad => !a.includes(bad.toLowerCase()));
    return okMust && okNot;
}

async function liveEval() {
    const health = await fetch(URL).then(r => r.json()).catch(() => null);
    const rows = [];
    let pass = 0, totalMs = 0;
    for (const c of golden.cases) {
        const t = Date.now();
        let answer = '';
        try {
            const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://mayur-dokras.github.io' }, body: JSON.stringify({ message: c.q, mode: 'chat', stream: false }) });
            const d = await r.json();
            answer = d.reply || d.error || '';
        } catch (e) { answer = 'ERROR ' + e.message; }
        const ms = Date.now() - t; totalMs += ms;
        const ok = grade(answer, c);
        if (ok) pass++;
        rows.push({ q: c.q, ok, ms, answer: answer.replace(/\s+/g, ' ').slice(0, 140) });
        await sleep(3500); // stay under the API's per-minute rate limit
    }
    return { health, n: golden.cases.length, pass: pass / golden.cases.length, avgMs: Math.round(totalMs / golden.cases.length), rows };
}

(async () => {
    const t = golden.thresholds;
    const ret = await retrievalEval();
    let md = `### 🧪 MACK evals - kb \`${kb.version}\`\n\n**Retrieval (${ret.mode})** - hit@1 **${pct(ret.hit1)}** · hit@3 **${pct(ret.hit3)}** · MRR **${ret.mrr.toFixed(2)}** (threshold hit@3 ≥ ${pct(t.retrievalHit3)})\n\n| question | rank | top chunk |\n|---|---|---|\n`;
    md += ret.rows.map(r => `| ${r.q} | ${r.rank ? (r.rank <= 3 ? '✅ ' : '⚠️ ') + r.rank : '❌ -'} | ${r.top} |`).join('\n') + '\n';

    let live = null;
    if (LIVE) {
        live = await liveEval();
        md += `\n**Live answers** (${URL}) - pass **${pct(live.pass)}** · avg latency **${live.avgMs} ms** (threshold ≥ ${pct(t.livePass)})${live.health ? ` · deployed kb \`${live.health.kb}\`` : ''}\n\n| question | result | ms | answer |\n|---|---|---|---|\n`;
        md += live.rows.map(r => `| ${r.q} | ${r.ok ? '✅' : '❌'} | ${r.ms} | ${r.answer.replace(/\|/g, '/')} |`).join('\n') + '\n';
    }

    console.log(md);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');

    if (process.env.EVAL_WRITE === '1') {
        const out = {
            kb: kb.version, builtAt: kb.builtAt, evaluatedAt: new Date().toISOString(),
            retrieval: { mode: ret.mode, hit1: +ret.hit1.toFixed(3), hit3: +ret.hit3.toFixed(3), mrr: +ret.mrr.toFixed(3), cases: ret.n },
            chunks: kb.chunks.length, github: kb.stats.github
        };
        if (live) out.live = { pass: +live.pass.toFixed(3), avgMs: live.avgMs, cases: live.n };
        fs.writeFileSync(path.join(ROOT, 'evals', 'latest.json'), JSON.stringify(out, null, 2) + '\n');
    }

    const failed = ret.hit3 < t.retrievalHit3 || (live && live.pass < t.livePass);
    if (failed) { console.error('❌ MACK eval below threshold'); process.exit(1); }
    console.log('✅ MACK eval passed');
})().catch(e => { console.error(e); process.exit(1); });
