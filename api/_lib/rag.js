/**
 * MACK retrieval core - hybrid search (dense embeddings + BM25) over the
 * knowledge base built by scripts/build-kb.js.
 * Shared by the chat API (api/chat.js) and the eval harness (scripts/eval.js).
 */

const EMBED_MODEL = 'gemini-embedding-001';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const STOP = new Set(('a an and are as at be but by can did do does for from has have he his how i if in into is it its me my of on or our she so than that the their them then there these they this to was we what when where which who why will with you your about tell mayur mayurs dokras please give know any some answer question questions explain describe share talk more'.split(' ')));

// light synonym expansion so lexical search copes with recruiter phrasing
const SYN = {
    genai: ['llm', 'llms', 'generative', 'ai'],
    llm: ['llms', 'language', 'model', 'genai'],
    ml: ['machine', 'learning', 'model'],
    mlops: ['ci', 'cd', 'deployment', 'pipeline', 'evaluation', 'kubernetes', 'docker'],
    k8s: ['kubernetes'],
    finetune: ['fine', 'tuning', 'lora'],
    finetuning: ['fine', 'tuning', 'lora'],
    sponsorship: ['visa', 'authorisation'],
    visa: ['sponsorship', 'authorisation'],
    notice: ['immediate', 'joiner', 'availability'],
    relocate: ['relocation', 'location', 'relocate'],
    salary: ['compensation'],
    degree: ['education', 'msc', 'bachelor'],
    university: ['education', 'southampton', 'msc'],
    certificates: ['certifications'],
    ios: ['swift', 'iphone'],
    android: ['kotlin', 'compose'],
    mobile: ['flutter', 'android', 'ios', 'kotlin', 'swift'],
    backend: ['api', 'apis', 'python', 'fastapi', 'server'],
    capgemini: ['gpon', 'telecom'],
    startup: ['malvox'],
    rag: ['retrieval', 'vector', 'chroma', 'embeddings']
};

function stem(w) {
    if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
    if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
    return w;
}

function tokenize(text, expand = false) {
    const raw = String(text || '').toLowerCase()
        .replace(/[’']/g, '')
        .replace(/c\/c\+\+|c\+\+/g, ' cpp ')
        .split(/[^a-z0-9]+/)
        .filter(w => w && w.length > 1 && !STOP.has(w));
    const out = [];
    for (const w of raw) {
        out.push(stem(w));
        if (expand && SYN[w]) for (const s of SYN[w]) out.push(stem(s));
    }
    return out;
}

/* ---------------- BM25 ---------------- */
function buildBM25(chunks) {
    // title and section count extra so broad questions ("his experience", "skills") land on the right file
    const docs = chunks.map(c => tokenize(`${c.title} ${c.title} ${c.section} ${c.section} ${c.text}`));
    const df = new Map();
    docs.forEach(d => new Set(d).forEach(t => df.set(t, (df.get(t) || 0) + 1)));
    const avg = docs.reduce((s, d) => s + d.length, 0) / Math.max(docs.length, 1);
    const tfs = docs.map(d => { const m = new Map(); d.forEach(t => m.set(t, (m.get(t) || 0) + 1)); return m; });
    const N = docs.length, k1 = 1.4, b = 0.75;
    return (query) => {
        const q = tokenize(query, true);
        return tfs.map((tf, i) => {
            let s = 0;
            for (const t of q) {
                const f = tf.get(t); if (!f) continue;
                const n = df.get(t);
                const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
                s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * docs[i].length / avg));
            }
            return s;
        });
    };
}

/* ---------------- dense ---------------- */
function cosine(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s; // vectors are stored L2-normalised
}

function normalise(v) {
    const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map(x => x / n);
}

async function embed(texts, { apiKey, taskType = 'RETRIEVAL_QUERY', dim = 768 } = {}) {
    const url = `${GEMINI_BASE}/${EMBED_MODEL}:batchEmbedContents?key=${apiKey}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            requests: texts.map(t => ({
                model: `models/${EMBED_MODEL}`,
                content: { parts: [{ text: t }] },
                taskType,
                outputDimensionality: dim
            }))
        })
    });
    if (!res.ok) throw new Error(`embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.embeddings.map(e => normalise(e.values));
}

/* ---------------- retriever ---------------- */
function createRetriever(kb) {
    const bm25 = buildBM25(kb.chunks);
    const hasVectors = kb.chunks.length > 0 && Array.isArray(kb.chunks[0].v);

    /**
     * @param {string} query
     * @param {object} opts { k, apiKey, alpha } alpha = weight of dense score
     * @returns {Promise<{chunks: Array, mode: string}>}
     */
    async function retrieve(query, { k = 5, apiKey, alpha = 0.65 } = {}) {
        const lex = bm25(query);
        const lexMax = Math.max(...lex, 1e-9);
        let dense = null, mode = 'bm25';
        if (hasVectors && apiKey) {
            try {
                const [qv] = await embed([query], { apiKey, dim: kb.dim });
                dense = kb.chunks.map(c => cosine(qv, c.v));
                mode = 'hybrid';
            } catch (e) {
                console.warn('[mack] dense retrieval failed, falling back to BM25:', e.message);
            }
        }
        let scored = kb.chunks.map((c, i) => {
            const l = lex[i] / lexMax;
            const d = dense ? Math.max(0, (dense[i] - 0.3) / 0.7) : 0;
            return { i, score: dense ? alpha * d + (1 - alpha) * l : l };
        });
        scored.sort((a, b) => b.score - a.score);
        const top = scored.slice(0, k).filter(s => s.score > 0.05);
        return {
            mode,
            chunks: top.map(s => {
                const c = kb.chunks[s.i];
                return { id: c.id, title: c.title, section: c.section, text: c.text, file: c.file, url: c.url, score: +s.score.toFixed(3) };
            })
        };
    }
    return { retrieve };
}

const MackRAG = { tokenize, buildBM25, createRetriever, embed, normalise, EMBED_MODEL };
// Works in Node (API, scripts) and in the browser (offline fallback in script.js).
if (typeof module !== 'undefined' && module.exports) module.exports = MackRAG;
else if (typeof window !== 'undefined') window.MackRAG = MackRAG;
