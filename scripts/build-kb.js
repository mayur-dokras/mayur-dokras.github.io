#!/usr/bin/env node
/**
 * Builds MACK's knowledge base: knowledge/*.md + public GitHub repos
 *   -> chunks -> Gemini embeddings (cached by content hash) -> api/_data/kb.json
 *
 * Env:
 *   GEMINI_API_KEY   optional; without it the KB is lexical-only (BM25)
 *   GITHUB_USER      GitHub username to ingest repos from (default: mayur-dokras)
 *   GITHUB_TOKEN     optional; raises the GitHub API rate limit
 *   SKIP_GITHUB=1    skip repo ingestion
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { embed, EMBED_MODEL } = require('../api/_lib/rag');

const ROOT = path.join(__dirname, '..');
const KDIR = path.join(ROOT, 'knowledge');
const OUT = path.join(ROOT, 'api', '_data', 'kb.json');
const DIM = 768;
const MAX_CHUNK = 1100;
const GH_USER = process.env.GITHUB_USER || 'mayur-dokras';

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

function parseFrontMatter(src) {
    const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
    const meta = { title: '', questions: [] };
    if (!m) return { meta, body: src };
    let key = null;
    for (const line of m[1].split('\n')) {
        const kv = line.match(/^(\w+):\s*(.*)$/);
        if (kv) { key = kv[1]; if (kv[2]) meta[key] = kv[2].trim(); else meta[key] = []; continue; }
        const li = line.match(/^\s*-\s+(.*)$/);
        if (li && key && Array.isArray(meta[key])) meta[key].push(li[1].trim());
    }
    return { meta, body: src.slice(m[0].length) };
}

function splitLong(text) {
    if (text.length <= MAX_CHUNK) return [text];
    const parts = text.split(/\n(?=- )|\n\n/);
    const out = []; let cur = '';
    for (const p of parts) {
        if ((cur + '\n' + p).length > MAX_CHUNK && cur) { out.push(cur.trim()); cur = ''; }
        cur += (cur ? '\n' : '') + p;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

function chunkMarkdown(file, src) {
    const { meta, body } = parseFrontMatter(src);
    const title = meta.title || path.basename(file, '.md');
    const sections = body.split(/^## /m).map(s => s.trim()).filter(Boolean);
    const chunks = [];
    for (const sec of sections) {
        const nl = sec.indexOf('\n');
        const section = (nl === -1 ? sec : sec.slice(0, nl)).trim();
        const text = (nl === -1 ? '' : sec.slice(nl + 1)).trim();
        if (!text) continue;
        splitLong(text).forEach((t, i) => chunks.push({ file, title, section: section + (i ? ` (${i + 1})` : ''), text: t }));
    }
    return { meta: { file, title, questions: meta.questions || [] }, chunks };
}

async function ghJSON(url, accept = 'application/vnd.github+json') {
    const headers = { Accept: accept, 'User-Agent': 'mack-kb-builder' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return accept.includes('raw') ? res.text() : res.json();
}

function cleanReadme(md) {
    return md
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')       // images / badges
        .replace(/<img[^>]*>/gi, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')    // links -> text
        .replace(/```[\s\S]*?```/g, '')             // code blocks
        .replace(/<[^>]+>/g, '')
        .replace(/^#+\s*/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

async function githubChunks() {
    if (process.env.SKIP_GITHUB === '1') return [];
    try {
        const repos = await ghJSON(`https://api.github.com/users/${GH_USER}/repos?per_page=100&sort=pushed`);
        const picked = repos.filter(r => !r.fork && !r.archived && !r.private).slice(0, 15);
        const chunks = [];
        for (const r of picked) {
            let readme = '';
            try { readme = cleanReadme(await ghJSON(`https://api.github.com/repos/${GH_USER}/${r.name}/readme`, 'application/vnd.github.raw')).slice(0, 1400); } catch (e) { /* no readme */ }
            const lines = [
                `GitHub repository "${r.name}" by Mayur Dokras.`,
                r.description ? `Description: ${r.description}` : '',
                r.language ? `Main language: ${r.language}.` : '',
                r.topics && r.topics.length ? `Topics: ${r.topics.join(', ')}.` : '',
                `Last updated: ${String(r.pushed_at).slice(0, 10)}.`,
                readme ? `README excerpt:\n${readme}` : ''
            ].filter(Boolean);
            chunks.push({ file: 'github', title: 'GitHub', section: r.name, text: lines.join('\n'), url: r.html_url });
        }
        console.log(`[kb] ingested ${chunks.length} GitHub repos for ${GH_USER}`);
        return chunks;
    } catch (e) {
        console.warn(`[kb] GitHub ingestion skipped: ${e.message}`);
        return [];
    }
}

async function main() {
    const files = fs.readdirSync(KDIR).filter(f => f.endsWith('.md')).sort();
    let chunks = [];
    const docs = [];
    for (const f of files) {
        const { meta, chunks: c } = chunkMarkdown(f, fs.readFileSync(path.join(KDIR, f), 'utf8'));
        docs.push(meta); chunks.push(...c);
    }
    chunks.push(...await githubChunks());
    chunks = chunks.map(c => ({ id: hash(c.file + c.section + c.text), ...c }));

    // reuse embeddings for unchanged chunks
    let prev = {};
    try { const old = JSON.parse(fs.readFileSync(OUT, 'utf8')); if (old.model === EMBED_MODEL && old.dim === DIM) old.chunks.forEach(c => { if (c.v) prev[c.id] = c.v; }); } catch (e) { /* first build */ }

    const apiKey = process.env.GEMINI_API_KEY;
    let embedded = 0, reused = 0;
    if (apiKey) {
        const todo = chunks.filter(c => !prev[c.id]);
        for (let i = 0; i < todo.length; i += 50) {
            const batch = todo.slice(i, i + 50);
            const vecs = await embed(batch.map(c => `title: ${c.title} - ${c.section} | text: ${c.text}`), { apiKey, taskType: 'RETRIEVAL_DOCUMENT', dim: DIM });
            batch.forEach((c, j) => { prev[c.id] = vecs[j]; });
            embedded += batch.length;
        }
        chunks.forEach(c => { if (prev[c.id]) c.v = prev[c.id].map(x => +x.toFixed(5)); });
        reused = chunks.length - embedded;
    } else {
        console.warn('[kb] GEMINI_API_KEY not set: building lexical-only knowledge base (BM25).');
    }

    const kb = {
        version: hash(chunks.map(c => c.id).join()),
        builtAt: new Date().toISOString(),
        model: apiKey ? EMBED_MODEL : null,
        dim: apiKey ? DIM : 0,
        docs,
        stats: { files: files.length, chunks: chunks.length, github: chunks.filter(c => c.file === 'github').length, embedded, reused },
        chunks
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(kb));
    const kbSize = (fs.statSync(OUT).size / 1024).toFixed(1);
    const summary = `### 🧠 MACK knowledge base\n\n| metric | value |\n|---|---|\n| version | \`${kb.version}\` |\n| knowledge files | ${kb.stats.files} |\n| chunks | ${kb.stats.chunks} |\n| GitHub repos | ${kb.stats.github} |\n| newly embedded | ${embedded} |\n| reused from cache | ${reused} |\n| retrieval | ${apiKey ? 'hybrid (dense + BM25)' : 'BM25 only'} |\n| size | ${kbSize} KB |\n`;
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
}

main().catch(e => { console.error(e); process.exit(1); });
