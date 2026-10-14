/* =========================================================
   Mayur Dokras - portfolio runtime
   ========================================================= */
(() => {
    'use strict';

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const store = {
        get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
    };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    /* ---------------------------------------------------------
       1. BOOT SEQUENCE
    --------------------------------------------------------- */
    const bootLines = [
        ['> booting <span class="hl">mayur.os</span> v4.0', 0],
        ['> loading model weights ........... <span class="ok">[OK]</span>', 1],
        ['> attaching LoRA adapters ......... <span class="ok">[OK]</span>', 1],
        ['> mounting vector store (chroma) .. <span class="ok">[OK]</span>', 1],
        ['> warming FastAPI workers ......... <span class="ok">[OK]</span>', 1],
        ['> connecting agent <span class="hl">MACK</span> ......... <span class="ok">[OK]</span>', 1],
        ['> all systems nominal. welcome.', 0]
    ];

    function runBoot(onDone) {
        const boot = $('#boot');
        const log = $('#bootLog');
        const bar = $('#bootBar');
        const pct = $('#bootPct');
        const fast = store.get('md_booted') === '1' || reduced;
        const total = fast ? 650 : 2300;
        let finished = false;
        const start = performance.now();

        const finish = () => {
            if (finished) return;
            finished = true;
            store.set('md_booted', '1');
            bar.style.width = '100%';
            pct.textContent = '100%';
            boot.classList.add('done');
            document.body.classList.remove('is-booting');
            setTimeout(onDone, 150);
            setTimeout(() => boot.classList.add('gone'), 1200);
        };

        let shown = 0;
        const tick = (now) => {
            if (finished) return;
            const p = clamp((now - start) / total, 0, 1);
            const eased = 1 - Math.pow(1 - p, 2);
            bar.style.width = (eased * 100).toFixed(1) + '%';
            pct.textContent = Math.round(eased * 100) + '%';
            const target = Math.floor(p * bootLines.length + 0.6);
            while (shown < Math.min(target, bootLines.length)) {
                log.innerHTML += bootLines[shown][0] + '\n';
                shown++;
            }
            if (p >= 1) setTimeout(finish, fast ? 50 : 260);
            else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        boot.addEventListener('click', finish);
        document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape' || e.key === 'Enter') { finish(); document.removeEventListener('keydown', esc); } });
    }

    /* ---------------------------------------------------------
       2. NEURAL SPHERE (hero canvas)
    --------------------------------------------------------- */
    const Neural = (() => {
        const cv = $('#neural');
        if (!cv) return { start() {} };
        const ctx = cv.getContext('2d');
        let W = 0, H = 0, DPR = 1, R = 200, CX = 0, CY = 0;
        let pts = [], edges = [], packets = [], stars = [];
        let rotY = 0, rotX = -0.25, tRotX = -0.25, yOff = 0, tYOff = 0;
        let mx = -9999, my = -9999;
        let assemble = 0, running = false, visible = true, t0 = performance.now(), started = false, tStart = 0;

        function build() {
            const N = W < 720 ? 320 : 560;
            pts = [];
            const golden = Math.PI * (3 - Math.sqrt(5));
            for (let i = 0; i < N; i++) {
                const y = 1 - (i / (N - 1)) * 2;
                const r = Math.sqrt(1 - y * y);
                const th = golden * i;
                pts.push({
                    x: Math.cos(th) * r, y, z: Math.sin(th) * r,
                    sx: (Math.random() - 0.5) * 6, sy: (Math.random() - 0.5) * 4, sz: (Math.random() - 0.5) * 6,
                    ph: Math.random() * Math.PI * 2,
                    d: Math.random() * 0.45,
                    px: 0, py: 0, pz: 0, ps: 0
                });
            }
            // nearest-neighbour edges
            edges = [];
            const seen = new Set();
            for (let i = 0; i < N; i++) {
                const a = pts[i];
                const near = [];
                for (let j = 0; j < N; j++) {
                    if (i === j) continue;
                    const b = pts[j];
                    const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
                    if (near.length < 3) { near.push([d, j]); near.sort((p, q) => p[0] - q[0]); }
                    else if (d < near[2][0]) { near[2] = [d, j]; near.sort((p, q) => p[0] - q[0]); }
                }
                for (const [, j] of near) {
                    const key = i < j ? i + '-' + j : j + '-' + i;
                    if (!seen.has(key)) { seen.add(key); edges.push([i, j]); }
                }
            }
            // adjacency for packets
            const adj = pts.map(() => []);
            edges.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
            packets = [];
            const PK = W < 720 ? 18 : 42;
            for (let k = 0; k < PK; k++) {
                const a = (Math.random() * N) | 0;
                packets.push({ a, b: adj[a][0], p: Math.random(), s: 0.012 + Math.random() * 0.02, adj, hue: Math.random() < 0.5 ? 0 : 1 });
            }
            stars = [];
            const S = W < 720 ? 60 : 140;
            for (let k = 0; k < S; k++) stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.2 + 0.2, v: Math.random() * 0.15 + 0.03, a: Math.random() * 0.5 + 0.1 });
        }

        function resize() {
            const rect = cv.getBoundingClientRect();
            const nw = rect.width, nh = rect.height;
            const rebuild = Math.abs(nw - W) > 80 || !pts.length;
            W = nw; H = nh;
            DPR = Math.min(window.devicePixelRatio || 1, 1.5);
            cv.width = W * DPR; cv.height = H * DPR;
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            CX = W / 2; CY = H * (W < 720 ? 0.42 : 0.44);
            R = Math.min(W, H) * (W < 720 ? 0.44 : 0.36);
            if (rebuild) build();
        }

        function frame(now) {
            if (!running) return;
            const t = (now - t0) / 1000;
            if (started) assemble = clamp((now - tStart) / 2600, 0, 1);

            rotY += 0.0022;
            rotX += (tRotX - rotX) * 0.04;
            yOff += (tYOff - yOff) * 0.04;
            const ry = rotY + yOff;
            const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rotX), sx = Math.sin(rotX);
            const breathe = 1 + Math.sin(t * 0.8) * 0.02;
            const fov = R * 3.2;

            ctx.clearRect(0, 0, W, H);

            // stars
            for (const s of stars) {
                s.y -= s.v; if (s.y < 0) { s.y = H; s.x = Math.random() * W; }
                ctx.fillStyle = `rgba(200,210,255,${s.a})`;
                ctx.fillRect(s.x, s.y, s.r, s.r);
            }

            // project points
            for (const p of pts) {
                const local = clamp((assemble - p.d) / (1 - p.d), 0, 1);
                const e = 1 - Math.pow(1 - local, 3);
                const wob = 1 + Math.sin(t * 1.4 + p.ph) * 0.035;
                let x = (p.sx + (p.x * wob - p.sx) * e);
                let y = (p.sy + (p.y * wob - p.sy) * e);
                let z = (p.sz + (p.z * wob - p.sz) * e);
                // rotate Y then X
                let x1 = x * cy - z * sy, z1 = x * sy + z * cy;
                let y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
                const rr = R * breathe;
                const f = fov / (fov + z2 * rr);
                let px = CX + x1 * rr * f, py = CY + y1 * rr * f;
                // mouse repel
                const dx = px - mx, dy = py - my, dd = dx * dx + dy * dy;
                if (dd < 16900) { const d = Math.sqrt(dd) || 1; const k = (1 - d / 130) * 38; px += dx / d * k; py += dy / d * k; }
                p.px = px; p.py = py; p.pz = z2; p.ps = f;
            }

            // edges (batched by depth bucket)
            const buckets = [[], [], [], []];
            for (const [a, b] of edges) {
                const z = (pts[a].pz + pts[b].pz) / 2; // -1 front .. 1 back
                const k = clamp(Math.floor((z + 1) / 2 * 4), 0, 3);
                buckets[k].push(a, b);
            }
            const edgeCols = ['rgba(103,232,249,0.42)', 'rgba(129,140,248,0.28)', 'rgba(139,92,246,0.16)', 'rgba(139,92,246,0.07)'];
            ctx.lineWidth = 0.7;
            for (let k = 3; k >= 0; k--) {
                const arr = buckets[k];
                if (!arr.length) continue;
                ctx.strokeStyle = edgeCols[k];
                ctx.globalAlpha = 0.25 + assemble * 0.75;
                ctx.beginPath();
                for (let i = 0; i < arr.length; i += 2) {
                    const A = pts[arr[i]], B = pts[arr[i + 1]];
                    ctx.moveTo(A.px, A.py); ctx.lineTo(B.px, B.py);
                }
                ctx.stroke();
            }
            ctx.globalAlpha = 1;

            // nodes
            for (const p of pts) {
                const front = (1 - p.pz) / 2; // 0 back .. 1 front
                const s = (0.8 + front * 2.3) * p.ps;
                ctx.fillStyle = front > 0.62 ? `rgba(220,250,255,${0.35 + front * 0.65})` : `rgba(167,139,250,${0.15 + front * 0.6})`;
                ctx.fillRect(p.px - s / 2, p.py - s / 2, s, s);
            }

            // orbit rings
            for (let ring = 0; ring < 2; ring++) {
                const tilt = ring ? 1.15 : -0.45;
                const rad = ring ? 1.32 : 1.18;
                const spin = t * (ring ? -0.25 : 0.18);
                const ct = Math.cos(tilt), st = Math.sin(tilt);
                for (let i = 0; i < 160; i++) {
                    const a = (i / 160) * Math.PI * 2 + spin;
                    let x = Math.cos(a) * rad, z = Math.sin(a) * rad, y = 0;
                    let y1 = y * ct - z * st, z1 = y * st + z * ct;
                    let x2 = x * cy - z1 * sy, z2 = x * sy + z1 * cy;
                    const f = fov / (fov + z2 * R);
                    const front = (1 - z2 / rad) / 2;
                    const px = CX + x2 * R * f, py = CY + y1 * R * f;
                    const sat = i === 0;
                    if (sat) {
                        ctx.fillStyle = ring ? 'rgba(244,114,182,0.9)' : 'rgba(163,230,53,0.9)';
                        ctx.beginPath(); ctx.arc(px, py, 3.2 * f, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = ring ? 'rgba(244,114,182,0.18)' : 'rgba(163,230,53,0.18)';
                        ctx.beginPath(); ctx.arc(px, py, 10 * f, 0, Math.PI * 2); ctx.fill();
                    } else if (i % 2 === 0) {
                        ctx.fillStyle = `rgba(255,255,255,${(0.04 + front * 0.22) * assemble})`;
                        ctx.fillRect(px, py, 1.2, 1.2);
                    }
                }
            }

            // data packets
            if (assemble > 0.6) {
                for (const k of packets) {
                    k.p += k.s;
                    if (k.p >= 1) { k.p = 0; k.a = k.b; const n = k.adj[k.a]; k.b = n[(Math.random() * n.length) | 0]; }
                    const A = pts[k.a], B = pts[k.b];
                    const x = A.px + (B.px - A.px) * k.p, y = A.py + (B.py - A.py) * k.p;
                    const front = (1 - (A.pz + B.pz) / 2) / 2;
                    const col = k.hue ? '34,211,238' : '244,114,182';
                    ctx.fillStyle = `rgba(${col},${0.12 * front})`;
                    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = `rgba(255,255,255,${0.3 + front * 0.7})`;
                    ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
                }
            }

            if (reduced && assemble >= 1) { running = false; return; }
            requestAnimationFrame(frame);
        }

        function play() { if (!running && visible && !document.hidden) { running = true; requestAnimationFrame(frame); } }

        function init() {
            resize();
            addEventListener('resize', resize);
            addEventListener('pointermove', (e) => {
                const r = cv.getBoundingClientRect();
                mx = e.clientX - r.left; my = e.clientY - r.top;
                tRotX = -0.25 + (my / H - 0.5) * 0.5;
                tYOff = (mx / W - 0.5) * 0.9;
            }, { passive: true });
            document.addEventListener('pointerleave', () => { mx = my = -9999; });
            new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) play(); else running = false; }).observe(cv);
            document.addEventListener('visibilitychange', () => { if (document.hidden) running = false; else play(); });
            play();
        }
        return { init, start() { started = true; tStart = performance.now(); if (reduced) tStart = -1e9; play(); } };
    })();

    /* ---------------------------------------------------------
       3. ROLE SCRAMBLE + HUD
    --------------------------------------------------------- */
    function initRoles() {
        const el = $('#roleText');
        if (!el) return;
        const roles = ['GenAI Engineer', 'Backend Engineer', 'MLOps Engineer', 'LLM fine-tuning · LoRA', 'RAG systems builder', 'Python · FastAPI · Kafka'];
        const glyphs = '!<>-_\\/[]{}~=+*^?#01';
        let i = 0;
        const scramble = (to) => {
            const from = el.textContent;
            const len = Math.max(from.length, to.length);
            const q = [];
            for (let k = 0; k < len; k++) {
                const s = Math.floor(Math.random() * 14), e = s + Math.floor(Math.random() * 14) + 4;
                q.push({ f: from[k] || '', t: to[k] || '', s, e, c: '' });
            }
            let fr = 0;
            const step = () => {
                let out = '', done = 0;
                for (const o of q) {
                    if (fr >= o.e) { done++; out += o.t; }
                    else if (fr >= o.s) { if (!o.c || Math.random() < 0.3) o.c = glyphs[(Math.random() * glyphs.length) | 0]; out += `<span style="color:var(--violet)">${o.c}</span>`; }
                    else out += o.f;
                }
                el.innerHTML = out;
                if (done < q.length) { fr++; requestAnimationFrame(step); }
            };
            step();
        };
        if (!reduced) setInterval(() => { i = (i + 1) % roles.length; scramble(roles[i]); }, 2600);

        const tok = $('#hudTok');
        if (tok) setInterval(() => { tok.textContent = (88 + Math.random() * 60).toFixed(0); }, 700);
    }

    /* ---------------------------------------------------------
       4. PHYSICS PILLS
    --------------------------------------------------------- */
    function initPit() {
        const pit = $('#pit');
        if (!pit) return;
        const all = $$('[data-pill]', pit);
        const M = window.Matter;
        if (!M || reduced) { pit.classList.add('static'); return; }

        const { Engine, Bodies, Composite, Body, Constraint } = M;
        const engine = Engine.create();
        engine.gravity.y = 1.1;
        let W = pit.clientWidth, H = pit.clientHeight;

        // only drop as many pills as comfortably fit
        let area = 0;
        const budget = W * H * 0.5;
        const chosen = [];
        all.forEach((el) => {
            const a = el.offsetWidth * el.offsetHeight;
            if (area + a <= budget && el.offsetWidth < W - 20) { area += a; chosen.push(el); }
            else el.style.display = 'none';
        });

        const T = 200;
        const ground = Bodies.rectangle(W / 2, H + T / 2, W * 3, T, { isStatic: true });
        const left = Bodies.rectangle(-T / 2, H / 2 - 1500, T, H + 3000, { isStatic: true });
        const right = Bodies.rectangle(W + T / 2, H / 2 - 1500, T, H + 3000, { isStatic: true });
        Composite.add(engine.world, [ground, left, right]);

        const items = chosen.map((el) => {
            const w = el.offsetWidth, h = el.offsetHeight;
            const body = Bodies.rectangle(
                w / 2 + 10 + Math.random() * Math.max(1, W - w - 20),
                -120 - Math.random() * 520,
                w, h,
                { chamfer: { radius: h / 2 - 1 }, restitution: 0.38, friction: 0.25, frictionAir: 0.014, density: 0.0018 }
            );
            Body.setAngle(body, (Math.random() - 0.5) * 0.8);
            el.style.touchAction = finePointer ? 'none' : 'auto';
            return { el, body, w, h, added: false };
        });

        const sync = () => {
            for (const it of items) {
                if (!it.added) continue;
                const { x, y } = it.body.position;
                it.el.style.transform = `translate(${x - it.w / 2}px, ${y - it.h / 2}px) rotate(${it.body.angle}rad)`;
            }
        };

        // drag
        let drag = null;
        const local = (e) => { const r = pit.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
        items.forEach((it) => {
            it.el.addEventListener('pointerdown', (e) => {
                const p = local(e);
                if (e.pointerType !== 'mouse') {
                    // touch: flick it up instead of dragging (keeps page scroll free)
                    Body.setVelocity(it.body, { x: (Math.random() - 0.5) * 8, y: -14 });
                    Body.setAngularVelocity(it.body, (Math.random() - 0.5) * 0.3);
                    return;
                }
                e.preventDefault();
                drag = Constraint.create({
                    pointA: p, bodyB: it.body,
                    pointB: { x: p.x - it.body.position.x, y: p.y - it.body.position.y },
                    stiffness: 0.12, damping: 0.08, length: 0
                });
                Composite.add(engine.world, drag);
                document.body.classList.add('cursor-hover');
            });
        });
        addEventListener('pointermove', (e) => { if (drag) drag.pointA = local(e); }, { passive: true });
        const release = () => { if (drag) { Composite.remove(engine.world, drag); drag = null; document.body.classList.remove('cursor-hover'); } };
        addEventListener('pointerup', release);
        addEventListener('blur', release);

        // loop
        let running = false, visible = true, last = performance.now();
        const loop = (now) => {
            if (!running) return;
            const dt = Math.min(now - last, 32); last = now;
            Engine.update(engine, dt);
            sync();
            requestAnimationFrame(loop);
        };
        const play = () => { if (!running && visible) { running = true; last = performance.now(); requestAnimationFrame(loop); } };
        new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) play(); else running = false; }).observe(pit);

        // resize: move walls, keep pills inside
        addEventListener('resize', () => {
            const nW = pit.clientWidth, nH = pit.clientHeight;
            if (nW === W && nH === H) return;
            W = nW; H = nH;
            Body.setPosition(ground, { x: W / 2, y: H + T / 2 });
            Body.setPosition(right, { x: W + T / 2, y: H / 2 - 1500 });
            items.forEach((it) => {
                const p = it.body.position;
                if (p.x > W - 10 || p.y > H) Body.setPosition(it.body, { x: clamp(p.x, it.w / 2, W - it.w / 2), y: -100 });
            });
        });

        return {
            drop() {
                play();
                items.forEach((it, i) => setTimeout(() => {
                    Composite.add(engine.world, it.body);
                    it.added = true;
                    it.el.style.visibility = 'visible';
                }, 500 + i * 110));
            }
        };
    }

    /* ---------------------------------------------------------
       5. CURSOR, MAGNETIC, SPOTLIGHT, TILT
    --------------------------------------------------------- */
    function initPointer() {
        // spotlight (works everywhere)
        document.addEventListener('pointermove', (e) => {
            const el = e.target.closest && e.target.closest('.spot');
            if (!el) return;
            const r = el.getBoundingClientRect();
            el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
            el.style.setProperty('--my', (e.clientY - r.top) + 'px');
        }, { passive: true });

        if (!finePointer || reduced) return;
        document.body.classList.add('has-cursor');
        const dot = $('#cursorDot'), ring = $('#cursorRing');
        let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y;
        addEventListener('pointermove', (e) => { x = e.clientX; y = e.clientY; dot.style.transform = `translate(${x}px, ${y}px)`; }, { passive: true });
        (function follow() {
            rx += (x - rx) * 0.38; ry += (y - ry) * 0.38;
            ring.style.transform = `translate(${rx}px, ${ry}px)`;
            requestAnimationFrame(follow);
        })();
        document.addEventListener('pointerover', (e) => {
            if (e.target.closest('a, button, .pill, .proj, input, .cmdk li')) document.body.classList.add('cursor-hover');
        });
        document.addEventListener('pointerout', (e) => {
            if (e.target.closest('a, button, .pill, .proj, input, .cmdk li')) document.body.classList.remove('cursor-hover');
        });

        // magnetic
        $$('.magnetic').forEach((el) => {
            el.addEventListener('pointermove', (e) => {
                const r = el.getBoundingClientRect();
                const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
                el.style.transform = `translate(${dx * 0.25}px, ${dy * 0.3}px)`;
            });
            el.addEventListener('pointerleave', () => { el.style.transform = ''; });
        });

        // tilt
        $$('.tilt').forEach((el) => {
            el.addEventListener('pointermove', (e) => {
                const r = el.getBoundingClientRect();
                const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
                el.style.transform = `rotateY(${px * 8}deg) rotateX(${-py * 8}deg) translateZ(0)`;
            });
            el.addEventListener('pointerleave', () => { el.style.transform = ''; });
        });
    }

    /* ---------------------------------------------------------
       6. SCROLL: reveal, counters, progress, nav, timeline
    --------------------------------------------------------- */
    function initScroll() {
        const counters = new WeakSet();
        const countUp = (el) => {
            if (counters.has(el)) return; counters.add(el);
            const to = +el.dataset.count, dur = 1600, s = performance.now();
            const step = (n) => {
                const p = clamp((n - s) / dur, 0, 1);
                el.textContent = Math.round(to * (1 - Math.pow(1 - p, 4)));
                if (p < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        };
        const io = new IntersectionObserver((ents) => {
            ents.forEach((en) => {
                if (!en.isIntersecting) return;
                en.target.classList.add('in');
                $$('[data-count]', en.target).forEach(countUp);
                if (en.target.id === 'terminal') Terminal.start();
                io.unobserve(en.target);
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        $$('.reveal').forEach((el, i) => {
            // stagger siblings in grids
            const parent = el.parentElement;
            const idx = [...parent.children].filter(c => c.classList.contains('reveal')).indexOf(el);
            el.style.transitionDelay = Math.min(idx, 6) * 70 + 'ms';
            io.observe(el);
        });

        const bar = $('#scrollProgress'), nav = $('#nav'), fill = $('#tlFill'), tl = $('#timeline');
        const links = $$('.nav-link');
        const sections = links.map(l => $(l.getAttribute('href'))).filter(Boolean);
        let lastY = scrollY, ticking = false;
        const onScroll = () => {
            ticking = false;
            const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
            bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
            if (y > 400 && y > lastY + 4) nav.classList.add('hide');
            else if (y < lastY - 4 || y < 400) nav.classList.remove('hide');
            lastY = y;
            if (tl) {
                const r = tl.getBoundingClientRect();
                fill.style.height = clamp((innerHeight * 0.65 - r.top) / r.height, 0, 1) * 100 + '%';
            }
            let cur = null;
            sections.forEach(s => { if (s.getBoundingClientRect().top < innerHeight * 0.4) cur = s.id; });
            links.forEach(l => l.classList.toggle('active', cur && l.getAttribute('href') === '#' + cur));
        };
        addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
        onScroll();
    }

    /* ---------------------------------------------------------
       7. TERMINAL
    --------------------------------------------------------- */
    const Terminal = (() => {
        const body = $('#termBody');
        let started = false;
        const json = [
            '{',
            '  "name": "Mayur Dokras",',
            '  "role": ["GenAI Engineer", "Backend Engineer"],',
            '  "focus": ["LLMs", "RAG", "LoRA", "SLMs", "MLOps"],',
            '  "stack": {',
            '    "ai": ["PyTorch", "Hugging Face", "Chroma"],',
            '    "backend": ["Python", "FastAPI", "Kafka", "PostgreSQL"],',
            '    "infra": ["Docker", "Kubernetes", "AWS"]',
            '  },',
            '  "experience_years": 4,',
            '  "msc": "University of Southampton",',
            '  "open_to": ["UK", "EU", "Global"],',
            '  "joining": "immediate"',
            '}'
        ];
        const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        const hl = (line) => esc(line)
            .replace(/("[^"]+")(\s*:)/g, '<span class="c-n">$1</span>$2')
            .replace(/(:\s*|\[|,\s*)("[^"]*")/g, '$1<span class="c-s">$2</span>')
            .replace(/(:\s*)(\d+)/g, '$1<span class="c-b">$2</span>');

        const script = [
            { cmd: 'python -m mack.serve --model slm-voice --port 8000' },
            { out: [
                '<span class="c-d">INFO</span>  loading LoRA adapters ........ <span class="c-p">done</span>',
                '<span class="c-d">INFO</span>  vector store: <span class="c-n">chroma</span> · <span class="c-p">ready</span>',
                '<span class="c-d">INFO</span>  uvicorn running on <span class="c-s">localhost:8000</span> <span class="c-p">✓</span>'
            ] },
            { cmd: 'curl -s localhost:8000/v1/whoami | jq' },
            { out: json.map(hl) }
        ];
        const prompt = '<span class="c-p">➜</span> <span class="c-k">~/api</span> ';
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        async function run() {
            let html = '';
            const render = (extra = '') => { body.innerHTML = html + extra + '<span class="cur"></span>'; };
            for (const step of script) {
                if (step.cmd) {
                    html += prompt;
                    for (let i = 1; i <= step.cmd.length; i++) {
                        render(esc(step.cmd.slice(0, i)));
                        await sleep(reduced ? 0 : 22 + Math.random() * 40);
                    }
                    html += esc(step.cmd) + '\n';
                    render(); await sleep(reduced ? 0 : 380);
                } else {
                    for (const l of step.out) { html += l + '\n'; render(); await sleep(reduced ? 0 : 55); }
                    await sleep(reduced ? 0 : 500);
                }
            }
            html += prompt; render();
        }
        return { start() { if (started || !body) return; started = true; run(); } };
    })();

    /* ---------------------------------------------------------
       8. SPARKLINE
    --------------------------------------------------------- */
    function initSpark() {
        const cv = $('#spark'), lbl = $('#p95');
        if (!cv) return;
        const ctx = cv.getContext('2d');
        const data = Array.from({ length: 60 }, (_, i) => 140 + Math.sin(i / 4) * 18 + Math.random() * 14);
        const draw = () => {
            const dpr = Math.min(devicePixelRatio || 1, 2), w = cv.clientWidth, h = 90;
            if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);
            const min = 90, max = 200;
            const pts = data.map((v, i) => [i / (data.length - 1) * w, h - (v - min) / (max - min) * h]);
            const g = ctx.createLinearGradient(0, 0, w, 0);
            g.addColorStop(0, '#22d3ee'); g.addColorStop(.5, '#8b5cf6'); g.addColorStop(1, '#f472b6');
            ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
            ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.stroke();
            ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
            const f = ctx.createLinearGradient(0, 0, 0, h);
            f.addColorStop(0, 'rgba(139,92,246,.28)'); f.addColorStop(1, 'rgba(139,92,246,0)');
            ctx.fillStyle = f; ctx.fill();
            const [lx, ly] = pts[pts.length - 1];
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(lx - 3, ly, 3.5, 0, Math.PI * 2); ctx.fill();
        };
        draw();
        addEventListener('resize', draw);
        if (reduced) return;
        setInterval(() => {
            const last = data[data.length - 1];
            data.push(clamp(last + (Math.random() - 0.5) * 22 + (140 - last) * 0.15, 100, 190));
            data.shift();
            if (lbl) lbl.textContent = Math.round(Math.max(...data.slice(-20)) * 0.93) + 'ms';
            draw();
        }, 700);
    }

    /* ---------------------------------------------------------
       9. CHAT (MACK)
    --------------------------------------------------------- */
    function initChat() {
        const CHAT_API_URL = 'https://mayur-dokras-github-io.vercel.app/api/chat';
        const toggle = $('#chatToggle'), panel = $('#chatPanel'), close = $('#chatClose');
        const msgs = $('#chatMessages'), input = $('#chatInput'), send = $('#chatSend');
        const popup = $('.chat-popup-msg'), sugg = $('#chatSuggestions');
        const micBtn = $('#chatMic'), voiceBtn = $('#chatVoice'), meta = $('#chatMeta');
        const history = [];
        let mode = 'chat', busy = false, speakOn = false;

        const open = () => { panel.classList.add('open'); popup && popup.classList.add('hidden'); setTimeout(() => input.focus(), 250); };
        const shut = () => { panel.classList.remove('open'); popup && popup.classList.remove('hidden'); };
        toggle.addEventListener('click', () => panel.classList.contains('open') ? shut() : open());
        close.addEventListener('click', shut);
        $$('[data-open-chat]').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); open(); }));
        window.__openChat = open;

        /* ---- helpers ---- */
        const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const fmt = (text) => {
            let s = esc(text);
            s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
            return s.replace(/(^|<br>)\s*[\*\-]\s+/g, '$1• ');
        };
        const scroll = () => { msgs.scrollTop = msgs.scrollHeight; };
        const bubble = (cls, html) => {
            const d = document.createElement('div');
            d.className = 'chat-message ' + cls;
            d.innerHTML = html;
            msgs.appendChild(d); scroll();
            return d;
        };
        const plain = (md) => String(md || '').replace(/\*\*/g, '').replace(/^\s*[\*\-]\s+/gm, '').replace(/\s+/g, ' ');
        // Text-to-speech: pick a natural English voice, speak sentence by sentence
        // (Chrome cuts off long utterances) and wait a tick after cancel() (Chrome drops
        // an utterance queued in the same tick).
        let voice = null;
        const pickVoice = () => {
            try {
                const vs = speechSynthesis.getVoices();
                voice = vs.find(v => /^en[-_](GB|US)/i.test(v.lang) && /natural|google|samantha|daniel|serena|aria|jenny/i.test(v.name))
                    || vs.find(v => /^en[-_]GB/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
            } catch (e) { voice = null; }
        };
        if ('speechSynthesis' in window) { pickVoice(); try { speechSynthesis.addEventListener('voiceschanged', pickVoice); } catch (e) { /* ignore */ } }
        const say = (txt) => {
            if (!('speechSynthesis' in window) || !txt) return;
            try {
                speechSynthesis.cancel();
                const parts = txt.match(/[^.!?]+[.!?]*/g) || [txt];
                setTimeout(() => parts.forEach(p => {
                    const u = new SpeechSynthesisUtterance(p.trim());
                    u.rate = 1.02; u.lang = (voice && voice.lang) || 'en-GB';
                    if (voice) u.voice = voice;
                    speechSynthesis.speak(u);
                }), 80);
            } catch (e) { /* ignore */ }
        };
        const speak = (text) => {
            if (!speakOn || !('speechSynthesis' in window)) return;
            say(plain(text));
        };

        /* ---- mode tabs ---- */
        const setMode = (m) => {
            mode = m;
            panel.dataset.mode = m;
            $$('.chat-mode', panel).forEach(b => { const on = b.dataset.mode === m; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
            input.placeholder = m === 'jd' ? 'Paste a job description and MACK will score Mayur’s fit…' : 'Ask MACK anything about Mayur…';
            input.rows = m === 'jd' ? 4 : 1; autosize(); input.focus();
        };
        $$('.chat-mode', panel).forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

        /* ---- textarea ---- */
        function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, mode === 'jd' ? 180 : 120) + 'px'; }
        input.addEventListener('input', autosize);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } });
        send.addEventListener('click', () => ask());

        /* ---- chips (suggestions, follow-ups, mode switch) ---- */
        msgs.addEventListener('click', (e) => {
            const chip = e.target.closest('[data-question], [data-switch-mode], [data-copy]');
            if (!chip) return;
            if (chip.dataset.switchMode) return setMode(chip.dataset.switchMode);
            if (chip.dataset.copy !== undefined) {
                const txt = chip.closest('.jd-card').querySelector('.jd-pitch').textContent;
                navigator.clipboard.writeText(txt).then(() => { chip.textContent = 'Copied ✓'; }).catch(() => { chip.textContent = 'Select & copy'; });
                return;
            }
            if (mode !== 'chat') setMode('chat');
            ask(chip.dataset.question);
        });

        /* ---- renderers ---- */
        const renderSources = (el, sources, retrieval) => {
            if (!sources || !sources.length || el.dataset.nosrc) return;
            const s = document.createElement('div');
            s.className = 'chat-sources';
            s.innerHTML = `<span class="src-label">${retrieval === 'hybrid' ? 'Hybrid RAG' : retrieval === 'local' ? 'From Mayur\'s profile' : 'Retrieved'} · sources</span>` + sources.map(x =>
                x.url ? `<a class="src" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.section)} ↗</a>` : `<span class="src">${esc(x.title)} › ${esc(x.section)}</span>`).join('');
            el.appendChild(s);
        };
        const renderFollowups = (items) => {
            if (!items || !items.length) return;
            const f = document.createElement('div');
            f.className = 'chat-suggestions followups';
            f.innerHTML = items.map(q => `<button class="suggestion-chip" data-question="${esc(q)}">${esc(q)}</button>`).join('');
            msgs.appendChild(f); scroll();
        };
        const renderJD = (el, r) => {
            if (r.lowFit) {
                el.classList.add('jd');
                el.dataset.nosrc = '1';
                el.innerHTML = `<div class="jd-card tone-redirect">
                    <div class="jd-top"><div><span class="jd-kicker">About this role</span><h4>${esc(r.role || 'This role')}</h4></div></div>
                    <p class="jd-redirect">${esc(r.message)}</p>
                    <span class="jd-h">Where Mayur fits best</span>
                    <ul>${(r.highlights || []).map(h => `<li>${esc(h)}</li>`).join('')}</ul>
                    <div class="jd-tags ok"><button class="jd-copy" data-question="What kind of roles is Mayur looking for?">See the roles he is targeting</button></div>
                </div>`;
                scroll();
                speak(r.message);
                return;
            }
            const score = Math.max(0, Math.min(100, r.score | 0));
            const tone = score >= 85 ? 'strong' : score >= 70 ? 'good' : score >= 50 ? 'partial' : 'weak';
            el.classList.add('jd');
            el.innerHTML = `<div class="jd-card tone-${tone}">
                <div class="jd-top">
                    <div class="jd-ring" style="--p:${score}"><span>${score}<small>%</small></span></div>
                    <div><span class="jd-kicker">Fit for</span><h4>${esc(r.role || 'This role')}</h4><p class="jd-verdict">${esc(r.verdict)}</p></div>
                </div>
                ${r.matched && r.matched.length ? `<span class="jd-h">Matches</span><div class="jd-tags ok">${r.matched.map(m => `<span>✓ ${esc(m)}</span>`).join('')}</div>` : ''}
                ${r.gaps && r.gaps.length ? `<span class="jd-h">Gaps to discuss</span><div class="jd-tags gap">${r.gaps.map(m => `<span>△ ${esc(m)}</span>`).join('')}</div>` : ''}
                ${r.highlights && r.highlights.length ? `<span class="jd-h">Evidence</span><ul>${r.highlights.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
                <span class="jd-h">Recruiter pitch</span>
                <p class="jd-pitch">${esc(r.pitch)}</p>
                <button class="jd-copy" data-copy>Copy pitch</button>
            </div>`;
            scroll();
            speak(`Fit score ${score} percent. ${r.verdict}. ${r.pitch}`);
        };

        /* ---- offline fallback: answer from the local knowledge base ---- */
        let localKB = null;
        const loadKB = () => localKB || (localKB = fetch('api/_data/kb.json').then(r => r.ok ? r.json() : null).then(kb => {
            if (!kb || !window.MackRAG) return null;
            const skills = new Set();
            kb.chunks.filter(c => c.title === 'Skills').forEach(c => c.text.split(/[,.;]/).forEach(t => {
                const inner = (t.match(/\(([^)]+)\)/) || [])[1]; if (inner && inner.length < 12) skills.add(inner.trim());
                t = t.replace(/\(.*?\)/g, '').trim(); if (t && t.length < 40) skills.add(t);
            }));
            return { kb, retriever: window.MackRAG.createRetriever(kb), skills: [...skills] };
        }).catch(() => null));
        loadKB();
        async function offlineAnswer(message, askMode) {
            const L = await loadKB();
            if (!L) return null;
            if (askMode === 'jd') {
                const jd = message.toLowerCase();
                const hit = L.skills.filter(sk => {
                    const k = sk.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    return new RegExp('(^|[^a-z])' + k + '([^a-z]|$)').test(jd);
                }).slice(0, 10);
                if (hit.length >= 3) return { text: `**Skills in this job that match Mayur's profile:**\n${hit.map(h => '* ' + h).join('\n')}\n\nFull fit scoring is reconnecting, so this is a keyword match only.`, sources: [{ title: 'Skills', section: 'Matched from Mayur\'s skills' }] };
                return { text: "This role leans on a stack that isn't Mayur's focus and expertise. He's strongest in GenAI, RAG and Python backend roles.", sources: [] };
            }
            if (/^\s*(hi|hello|hey|hii+|good (morning|afternoon|evening))\b/i.test(message) && message.length < 25) {
                return { text: "Hi! Ask me about Mayur's experience, GenAI projects, skills or availability. You can also paste a job description in **Match a job**.", sources: [] };
            }
            const r = await L.retriever.retrieve(message, { k: 3 });
            if (!r.chunks.length) return { text: "I couldn't find that in Mayur's profile. You can email him at mayurdokras@gmail.com.", sources: [] };
            const c = r.chunks[0];
            // broad question ("his experience", "skills"): summarise every section of that topic
            if (window.MackRAG.tokenize(message).length <= 2) {
                const all = L.kb.chunks.filter(x => x.file === c.file && !/\(\d+\)$/.test(x.section));
                const first = (t) => (t.replace(/^- /, '').split(/(?<=\.)\s|\n/)[0] || '').slice(0, 170);
                return { text: `**${c.title}**\n${all.map(x => `* **${x.section}**: ${first(x.text)}`).join('\n')}`, sources: all.slice(0, 3).map(x => ({ title: x.title, section: x.section })) };
            }
            const body = c.text.length > 700 ? c.text.slice(0, 700).replace(/\s+\S*$/, '') + '…' : c.text;
            return { text: `**${c.section}**\n${body}`, sources: r.chunks.map(x => ({ title: x.title, section: x.section, url: x.url || null })), offline: true };
        }

        /* ---- ask ---- */
        async function ask(preset) {
            const message = (preset || input.value).trim();
            if (!message || busy) return;
            busy = true; send.disabled = true;
            const askMode = mode;
            bubble('user', `<p>${askMode === 'jd' ? '<span class="jd-badge">Job description</span> ' + esc(message.slice(0, 220)) + (message.length > 220 ? '…' : '') : esc(message)}</p>`);
            input.value = ''; autosize();
            sugg && sugg.remove();
            $$('.followups', msgs).forEach(f => f.remove());

            const bot = bubble('bot typing', `<div class="chat-status"><span class="spin"></span>${askMode === 'jd' ? 'Retrieving evidence & scoring fit…' : 'Searching knowledge base…'}</div><p class="chat-text"></p>`);
            const status = $('.chat-status', bot), textEl = $('.chat-text', bot);
            let answer = '', sources = null, retrieval = 'bm25', followups = null, gotJD = false;

            try {
                const res = await fetch(CHAT_API_URL, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message, mode: askMode, stream: true, history: history.slice(-8) })
                });
                const ctype = res.headers.get('content-type') || '';
                if (!res.ok || ctype.includes('application/json')) {
                    const data = await res.json().catch(() => ({}));
                    if (data.jd) { gotJD = true; renderJD(bot, data.jd); }
                    else answer = data.reply || data.error || `Server error (${res.status}). Please try again shortly.`;
                    sources = data.sources; followups = data.followups;
                } else {
                    const reader = res.body.getReader(), dec = new TextDecoder();
                    let buf = '';
                    for (;;) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        buf += dec.decode(value, { stream: true });
                        let nl;
                        while ((nl = buf.indexOf('\n')) >= 0) {
                            const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
                            if (!line) continue;
                            let ev; try { ev = JSON.parse(line); } catch (e) { continue; }
                            if (ev.t === 'meta') {
                                sources = ev.sources; retrieval = ev.retrieval;
                                if (status) status.innerHTML = `<span class="spin"></span>${ev.sources.length} sources retrieved · ${ev.retrieval === 'hybrid' ? 'hybrid search' : 'keyword search'} · ${askMode === 'jd' ? 'scoring…' : 'generating…'}`;
                            } else if (ev.t === 'token') {
                                if (status && status.isConnected) status.remove();
                                answer += ev.v; textEl.innerHTML = fmt(answer) + '<span class="tcur"></span>'; scroll();
                            } else if (ev.t === 'jd') {
                                gotJD = true; renderJD(bot, ev.result);
                            } else if (ev.t === 'followups') {
                                followups = ev.items;
                            } else if (ev.t === 'error') {
                                answer = answer || ev.message;
                            }
                        }
                    }
                }
            } catch (err) {
                answer = '';
            }

            // live AI unreachable or failed: answer from the local knowledge base instead
            const failed = !gotJD && (!answer || /^(Server error|The AI service is unavailable|AI service unavailable|Too many questions)/.test(answer));
            if (failed) {
                const off = await offlineAnswer(message, askMode).catch(() => null);
                if (off) {
                    answer = off.text; sources = off.sources; retrieval = 'local';
                    followups = followups || ["What is Mayur's experience with LLMs and GenAI?", 'What are Mayur\'s technical skills?', 'Is Mayur an immediate joiner and open to relocation?'];
                } else if (!answer) {
                    answer = 'I can\'t reach my AI service right now. You can email Mayur at mayurdokras@gmail.com.';
                }
            }

            bot.classList.remove('typing');
            if (!gotJD) {
                if (status && status.isConnected) status.remove();
                textEl.innerHTML = fmt(answer || 'Sorry, I could not generate a response.');
                speak(answer);
            }
            renderSources(bot, sources, retrieval);
            history.push({ role: 'user', text: askMode === 'jd' ? 'Job description: ' + message.slice(0, 1200) : message });
            history.push({ role: 'bot', text: gotJD ? '(scored the job description)' : answer });
            renderFollowups(followups);
            if (askMode === 'jd') setMode('chat');
            busy = false; send.disabled = false; scroll();
        }

        /* ---- voice in (speech recognition) ---- */
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SR && micBtn) {
            micBtn.hidden = false;
            let rec = null;
            micBtn.addEventListener('click', () => {
                if (rec) { rec.stop(); return; }
                try {
                    rec = new SR(); rec.lang = 'en-GB'; rec.interimResults = true;
                    micBtn.classList.add('listening');
                    rec.onresult = (e) => {
                        const t = [...e.results].map(r => r[0].transcript).join('');
                        input.value = t; autosize();
                        if (e.results[e.results.length - 1].isFinal) { rec.stop(); ask(); }
                    };
                    rec.onend = rec.onerror = () => { micBtn.classList.remove('listening'); rec = null; };
                    rec.start();
                } catch (e) { micBtn.classList.remove('listening'); rec = null; }
            });
        }

        /* ---- voice out ---- */
        if (voiceBtn) {
            if (!('speechSynthesis' in window)) voiceBtn.hidden = true;
            voiceBtn.addEventListener('click', () => {
                speakOn = !speakOn;
                voiceBtn.setAttribute('aria-pressed', speakOn);
                voiceBtn.classList.toggle('on', speakOn);
                voiceBtn.title = speakOn ? 'Read aloud is on' : 'Read answers aloud';
                if (!speakOn) { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } return; }
                // speak right away inside the click, which also unlocks audio in strict browsers
                const last = $$('.chat-message.bot .chat-text, .chat-message.bot > p', msgs).pop();
                say(last && last.textContent.trim() ? plain(last.textContent) : 'Read aloud is on.');
            });
        }

        /* ---- CI eval badge (written by the GitHub Actions pipeline) ---- */
        fetch('evals/latest.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => {
            if (!d || !meta) return;
            const when = new Date(d.evaluatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            const parts = [`kb ${d.kb.slice(0, 7)}`, `${d.chunks} chunks`, `retrieval hit@3 ${Math.round(d.retrieval.hit3 * 100)}%`];
            if (d.live) parts.push(`answers ${Math.round(d.live.pass * 100)}% pass`);
            parts.push(`evaluated ${when}`);
            meta.innerHTML = `<span class="ok-dot"></span>${parts.map(esc).join(' · ')}`;
        }).catch(() => { /* keep default text */ });
    }

    /* ---------------------------------------------------------
       10. COMMAND PALETTE
    --------------------------------------------------------- */
    function initCmdk() {
        const box = $('#cmdk'), input = $('#cmdkInput'), items = $$('#cmdkList li');
        let sel = 0;
        const visibleItems = () => items.filter(i => i.style.display !== 'none');
        const paint = () => { const v = visibleItems(); items.forEach(i => i.classList.remove('sel')); if (v[sel]) v[sel].classList.add('sel'); };
        const open = () => { box.classList.add('open'); box.setAttribute('aria-hidden', 'false'); input.value = ''; filter(); setTimeout(() => input.focus(), 30); };
        const shut = () => { box.classList.remove('open'); box.setAttribute('aria-hidden', 'true'); };
        const filter = () => { const q = input.value.toLowerCase(); items.forEach(i => { i.style.display = i.textContent.toLowerCase().includes(q) ? '' : 'none'; }); sel = 0; paint(); };
        const exec = (li) => {
            if (!li) return; shut();
            if (li.dataset.go) $(li.dataset.go).scrollIntoView({ behavior: 'smooth' });
            const a = li.dataset.act;
            if (a === 'chat') window.__openChat && window.__openChat();
            if (a === 'cv') window.__downloadCV && window.__downloadCV();
            if (a === 'mail') location.href = 'mailto:mayurdokras@gmail.com';
            if (a === 'linkedin') window.open('https://www.linkedin.com/in/mayur-dokras-92ab67146', '_blank', 'noopener');
        };
        $('#cmdOpen').addEventListener('click', open);
        box.addEventListener('click', (e) => { if (e.target === box) shut(); });
        input.addEventListener('input', filter);
        items.forEach(li => li.addEventListener('click', () => exec(li)));
        document.addEventListener('keydown', (e) => {
            const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement !== input;
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); box.classList.contains('open') ? shut() : open(); return; }
            if (e.key === '/' && !typing && !box.classList.contains('open')) { e.preventDefault(); open(); return; }
            if (!box.classList.contains('open')) return;
            const v = visibleItems();
            if (e.key === 'Escape') shut();
            else if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(v.length, 1); paint(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + v.length) % Math.max(v.length, 1); paint(); }
            else if (e.key === 'Enter') { e.preventDefault(); exec(v[sel]); }
        });
    }

    /* ---------------------------------------------------------
       10b. CV DOWNLOAD
       Fetches the PDF and saves it as a file, so it downloads even where the
       plain download attribute is ignored. Falls back to opening the PDF.
    --------------------------------------------------------- */
    function initDownloads() {
        const save = async (href, name) => {
            try {
                const r = await fetch(href, { cache: 'no-store' });
                if (!r.ok) throw new Error(r.status);
                const url = URL.createObjectURL(await r.blob());
                const a = document.createElement('a');
                a.href = url; a.download = name; a.rel = 'noopener';
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 5000);
            } catch (e) {
                window.open(href, '_blank', 'noopener');
            }
        };
        $$('a[download]').forEach(a => a.addEventListener('click', (e) => {
            e.preventDefault();
            save(a.getAttribute('href'), a.getAttribute('download') || 'Mayur_Dokras_CV.pdf');
        }));
        window.__downloadCV = () => save('Mayur_Dokras_CV.pdf', 'Mayur_Dokras_CV.pdf');
    }

    /* ---------------------------------------------------------
       11. CLOCK
    --------------------------------------------------------- */
    function initClock() {
        const el = $('#clock');
        if (!el) return;
        const tick = () => { try { el.textContent = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata' }) + ' IST'; } catch (e) { /* ignore */ } };
        tick(); setInterval(tick, 1000);
    }

    /* ---------------------------------------------------------
       BOOTSTRAP
    --------------------------------------------------------- */
    function main() {
        Neural.init && Neural.init();
        initRoles();
        initPointer();
        initScroll();
        initSpark();
        initChat();
        initCmdk();
        initClock();
        initDownloads();
        $$('.hero-title .word').forEach((w, i) => { w.style.transitionDelay = (0.08 + i * 0.06) + 's'; });
        const fontsReady = (document.fonts && document.fonts.ready) ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]) : Promise.resolve();
        const pitReady = fontsReady.then(() => initPit());
        runBoot(() => {
            document.body.classList.add('ready');
            Neural.start();
            pitReady.then(pit => pit && pit.drop && pit.drop());
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
    else main();
})();
