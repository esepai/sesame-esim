/* Чат поддержки «Сезам eSIM»: виджет на сайте. Отвечает ИИ-ассистент через сервер-посредник (support-worker).
   Настройка на странице: window.SEZAM_SUPPORT = { endpoint: 'https://…/chat', page: 'main' | 'partners' }
   Без endpoint чат работает в демо-режиме с заготовленными ответами. */
(function () {
  const CFG = window.SEZAM_SUPPORT || {};
  const ENDPOINT = CFG.endpoint || '';
  const PAGE = CFG.page || 'main';
  const STORE = 'sezam-chat-' + PAGE;
  const TG = 'https://t.me/'; // замените на ссылку вашего Telegram поддержки

  const T = {
    ru: {
      fab: 'Чат поддержки', title: 'Ассистент Сезама', sub: 'ИИ-ассистент · отвечает сразу', close: 'Закрыть чат', reset: 'Начать заново',
      hello: 'Здравствуйте! Я ИИ-ассистент Сезама. Помогу подобрать eSIM, проверить телефон или разобраться с установкой. Если понадобится — подключу сотрудника.',
      helloBiz: 'Здравствуйте! Я ИИ-ассистент Сезама. Расскажу о партнёрстве для бизнеса и передам вашу заявку менеджеру.',
      ph: 'Напишите вопрос…', send: 'Отправить', typing: 'Ассистент печатает',
      chips: ['Подойдёт ли мой телефон?', 'Как установить eSIM?', 'Какой тариф выбрать?', 'Позвать сотрудника'],
      chipsBiz: ['Какие условия для партнёров?', 'Как подключиться по API?', 'Связаться с менеджером'],
      handed: 'Вопрос передан сотруднику — он свяжется с вами по указанному контакту.',
      demo: 'Демо-режим: ИИ ещё не подключён, отвечают заготовки.',
      fine: 'Отвечает ИИ — он может ошибаться. По заказам и возвратам помогает сотрудник.',
      err: 'Связь прервалась. Попробуйте ещё раз или напишите нам в Telegram.',
    },
    en: {
      fab: 'Support chat', title: 'Sesame Assistant', sub: 'AI assistant · instant replies', close: 'Close chat', reset: 'Start over',
      hello: 'Hi! I’m Sesame’s AI assistant. I can help you pick an eSIM, check your phone or set things up. If needed, I’ll bring in a team member.',
      helloBiz: 'Hi! I’m Sesame’s AI assistant. I can walk you through our business partnership and pass your request to a manager.',
      ph: 'Type your question…', send: 'Send', typing: 'Assistant is typing',
      chips: ['Will my phone work?', 'How do I install the eSIM?', 'Which plan should I choose?', 'Talk to a person'],
      chipsBiz: ['What are the partner terms?', 'How does the API work?', 'Contact a manager'],
      handed: 'Your question has been passed to a team member — they’ll contact you shortly.',
      demo: 'Demo mode: AI isn’t connected yet, replies are canned.',
      fine: 'Replies are AI-generated and may contain mistakes. Orders and refunds are handled by our team.',
      err: 'Connection lost. Please try again or message us on Telegram.',
    },
  };
  const lang = () => (document.documentElement.lang === 'en' ? 'en' : 'ru');
  const L = (k) => T[lang()][k];

  /* ── стили ── */
  const css = `
.sp-fab{position:fixed;z-index:75;right:18px;bottom:calc(18px + env(safe-area-inset-bottom,0px));width:60px;height:60px;border:0;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:#0A0A0A;
  background:radial-gradient(70% 70% at 30% 20%,#FFE08A,transparent 70%),linear-gradient(160deg,#F8C547,#F0AA1C);
  box-shadow:inset 0 1.5px 1px rgba(255,255,255,.8),inset 0 -2px 6px rgba(150,90,0,.25),0 10px 28px rgba(245,184,46,.45),0 2px 6px rgba(0,0,0,.2);transition:bottom .4s cubic-bezier(.2,.9,.2,1),transform .3s,opacity .3s}
.sp-fab svg{width:27px;height:27px}
.sp-fab .dot{position:absolute;top:9px;right:10px;width:11px;height:11px;border-radius:50%;background:#1A9E5C;box-shadow:0 0 0 2px #F5B82E}
.sp-fab.hide{transform:scale(.6);opacity:0;pointer-events:none}
body:has(.abar.on) .sp-fab{bottom:calc(96px + env(safe-area-inset-bottom,0px))}
.sp-panel{position:fixed;z-index:95;margin:0;right:18px;bottom:calc(18px + env(safe-area-inset-bottom,0px));width:min(390px,calc(100vw - 24px));height:min(620px,calc(100vh - 110px));display:flex;flex-direction:column;overflow:hidden;border-radius:28px;color:var(--ink);
  background:var(--glass-sheen),color-mix(in srgb,var(--bg) 62%,transparent);-webkit-backdrop-filter:blur(40px) saturate(2.1);backdrop-filter:blur(40px) saturate(2.1);
  box-shadow:var(--glass-ring),0 30px 80px rgba(0,0,0,.3);transform-origin:calc(100% - 30px) calc(100% - 30px);transform:scale(.4);opacity:0;pointer-events:none;transition:transform .45s cubic-bezier(.3,1.3,.5,1),opacity .25s}
.sp-panel.on{transform:none;opacity:1;pointer-events:auto}
.sp-h{display:flex;align-items:center;gap:11px;padding:14px 14px 12px 16px;border-bottom:1px solid color-mix(in srgb,var(--line) 70%,transparent)}
.sp-av{position:relative;width:40px;height:40px;border-radius:50%;background:#0A0A0A;display:grid;place-items:center;flex:none;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.sp-av svg{width:24px;height:24px;color:#fff}
.sp-av::after{content:"";position:absolute;right:0;bottom:0;width:10px;height:10px;border-radius:50%;background:#1A9E5C;box-shadow:0 0 0 2px var(--bg)}
.sp-h b{display:block;font-weight:600;font-size:15.5px;line-height:1.2}
.sp-h small{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted)}
.sp-h small i{font-style:normal;font-size:10.5px;font-weight:700;letter-spacing:.04em;background:var(--gold);color:#0A0A0A;border-radius:5px;padding:1px 5px}
.sp-h .sp-ib{margin-left:auto}
.sp-ib{border:0;background:color-mix(in srgb,var(--soft) 70%,transparent);width:34px;height:34px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:var(--ink);flex:none}
.sp-ib svg{width:17px;height:17px}
.sp-ib+.sp-ib{margin-left:6px}
.sp-demo{font-size:12px;color:var(--muted);text-align:center;padding:6px 12px;background:color-mix(in srgb,var(--gold) 16%,transparent)}
.sp-list{flex:1;overflow-y:auto;padding:14px 14px 8px;display:flex;flex-direction:column;gap:8px;overscroll-behavior:contain}
.sp-m{max-width:86%;padding:10px 13px;border-radius:18px;font-size:15px;line-height:1.45;white-space:normal;word-wrap:break-word;animation:spIn .35s cubic-bezier(.3,1.3,.5,1)}
.sp-m.a{align-self:flex-start;border-bottom-left-radius:6px;background:var(--glass-sheen),color-mix(in srgb,var(--soft) 75%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--line) 60%,transparent)}
.sp-m.u{align-self:flex-end;border-bottom-right-radius:6px;background:var(--ink);color:var(--bg)}
.sp-m.sys{align-self:center;max-width:94%;font-size:13px;color:var(--muted);background:none;padding:4px 8px;text-align:center}
.sp-m a{color:inherit;text-decoration:underline}
@keyframes spIn{from{opacity:0;transform:translateY(8px) scale(.97)}}
.sp-typing{align-self:flex-start;display:flex;gap:4px;padding:13px 15px;border-radius:18px;border-bottom-left-radius:6px;background:color-mix(in srgb,var(--soft) 75%,transparent)}
.sp-typing i{width:7px;height:7px;border-radius:50%;background:var(--muted);animation:spDot 1.2s infinite}
.sp-typing i:nth-child(2){animation-delay:.15s}.sp-typing i:nth-child(3){animation-delay:.3s}
@keyframes spDot{0%,60%,100%{opacity:.3;transform:none}30%{opacity:1;transform:translateY(-3px)}}
.sp-chips{display:flex;flex-wrap:wrap;gap:6px;padding:2px 14px 10px}
.sp-chip{border:0;cursor:pointer;font:inherit;font-size:13.5px;font-weight:500;padding:8px 12px;border-radius:999px;color:var(--ink);background:var(--glass-sheen),color-mix(in srgb,var(--soft) 70%,transparent);box-shadow:var(--glass-ring)}
.sp-f{display:flex;align-items:flex-end;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid color-mix(in srgb,var(--line) 70%,transparent)}
.sp-f textarea{flex:1;resize:none;border:0;outline:none;font:inherit;font-size:16px;line-height:1.4;max-height:120px;padding:10px 14px;border-radius:20px;color:var(--ink);background:color-mix(in srgb,var(--soft) 80%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--line) 70%,transparent)}
.sp-f textarea:focus{box-shadow:inset 0 0 0 1.5px var(--ink)}
.sp-send{width:42px;height:42px;flex:none;border:0;border-radius:50%;cursor:pointer;display:grid;place-items:center;background:var(--gold);color:#0A0A0A;box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 4px 12px rgba(245,184,46,.35)}
.sp-send:disabled{opacity:.45;cursor:default}
.sp-send svg{width:19px;height:19px}
.sp-fine{font-size:11.5px;color:var(--muted);text-align:center;padding:0 14px 8px;margin-top:-4px}
@media (max-width:560px){
  .sp-fab{right:14px;width:56px;height:56px}
  .sp-panel{inset:0;width:auto;height:auto;border-radius:0;transform-origin:calc(100% - 42px) calc(100% - 42px);padding-top:env(safe-area-inset-top,0px)}
}
@media (prefers-reduced-motion:reduce){.sp-panel,.sp-fab,.sp-m{transition:none!important;animation:none!important}}`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ── разметка ── */
  const ICON = {
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.6A8.5 8.5 0 1 1 21 12Z"/><path d="M8.5 10.5h7M8.5 14h4.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    arch: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M27 9A23 23 0 0 0 27 55" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M37 9A23 23 0 0 1 37 55" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><circle cx="32" cy="32" r="7.5" fill="#F5B82E"/></svg>',
  };
  const fab = document.createElement('button');
  fab.className = 'sp-fab';
  fab.type = 'button';
  fab.innerHTML = ICON.chat + '<span class="dot" aria-hidden="true"></span>';
  const panel = document.createElement('div');
  panel.className = 'sp-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `<div class="sp-h"><span class="sp-av">${ICON.arch}</span><div><b id="spTitle"></b><small><i>AI</i><span id="spSub"></span></small></div>
    <button class="sp-ib" type="button" id="spReset">${ICON.reset}</button><button class="sp-ib" type="button" id="spClose">${ICON.x}</button></div>
    ${ENDPOINT ? '' : '<div class="sp-demo" id="spDemo"></div>'}
    <div class="sp-list" id="spList" aria-live="polite"></div>
    <div class="sp-chips" id="spChips"></div>
    <p class="sp-fine" id="spFine"></p>
    <form class="sp-f" id="spForm"><textarea id="spIn" rows="1" maxlength="2000"></textarea><button class="sp-send" id="spSend" type="submit">${ICON.send}</button></form>`;
  document.body.append(fab, panel);
  panel.setAttribute('aria-labelledby', 'spTitle');
  const $ = (id) => panel.querySelector('#' + id);
  const list = $('spList'), input = $('spIn'), sendBtn = $('spSend'), chipsEl = $('spChips');

  /* ── состояние ── */
  let msgs = [];
  let busy = false;
  try { msgs = JSON.parse(sessionStorage.getItem(STORE) || '[]'); } catch (e) { msgs = []; }
  const save = () => { try { sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-40))); } catch (e) {} };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\bpartners\.html\b/g, '<a href="partners.html">partners.html</a>')
    .replace(/\n/g, '<br>');

  function bubble(role, text, html) {
    const d = document.createElement('div');
    d.className = 'sp-m ' + role;
    d.innerHTML = html ? text : fmt(text);
    list.appendChild(d);
    list.scrollTop = list.scrollHeight;
    return d;
  }
  function render() {
    $('spTitle').textContent = L('title');
    $('spSub').textContent = L('sub');
    $('spReset').setAttribute('aria-label', L('reset')); $('spReset').title = L('reset');
    $('spClose').setAttribute('aria-label', L('close'));
    $('spFine').textContent = L('fine');
    if ($('spDemo')) $('spDemo').textContent = L('demo');
    input.placeholder = L('ph');
    sendBtn.setAttribute('aria-label', L('send'));
    fab.setAttribute('aria-label', L('fab')); fab.title = L('fab');
    list.innerHTML = '';
    bubble('a', PAGE === 'partners' ? L('helloBiz') : L('hello'));
    msgs.forEach((m) => bubble(m.role === 'user' ? 'u' : m.role === 'sys' ? 'sys' : 'a', m.content));
    chipsEl.innerHTML = '';
    if (!msgs.some((m) => m.role === 'user')) {
      (PAGE === 'partners' ? L('chipsBiz') : L('chips')).forEach((c) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'sp-chip'; b.textContent = c;
        b.onclick = () => send(c);
        chipsEl.appendChild(b);
      });
    }
  }

  /* ── отправка ── */
  async function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true; chipsEl.innerHTML = '';
    msgs.push({ role: 'user', content: text }); save();
    bubble('u', text);
    input.value = ''; autosize();
    const typing = document.createElement('div');
    typing.className = 'sp-typing'; typing.setAttribute('aria-label', L('typing'));
    typing.innerHTML = '<i></i><i></i><i></i>';
    list.appendChild(typing); list.scrollTop = list.scrollHeight;
    try {
      const history = msgs.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-30);
      const res = ENDPOINT ? await ask(history) : await demo(text);
      typing.remove();
      msgs.push({ role: 'assistant', content: res.reply }); bubble('a', res.reply);
      if (res.handoff) { msgs.push({ role: 'sys', content: L('handed') }); bubble('sys', L('handed')); }
      save();
    } catch (e) {
      typing.remove();
      bubble('sys', L('err') + ` <a href="${TG}" target="_blank" rel="noopener">Telegram</a>`, true);
    } finally {
      busy = false; sendBtn.disabled = false; input.focus({ preventScroll: true });
    }
  }
  async function ask(history) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 45000);
    try {
      const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history, page: PAGE, lang: lang() }), signal: ctrl.signal });
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      if (!j.reply) throw new Error('empty');
      return j;
    } finally { clearTimeout(t); }
  }

  /* ── демо-режим: простые заготовки, пока ИИ не подключён ── */
  const DEMO = {
    ru: [
      [/телефон|подойд|поддерж|модел|iphone|samsung|pixel|xiaomi/i, 'Большинство смартфонов с 2019 года поддерживают eSIM: **iPhone XS/XR и новее**, Samsung Galaxy S20 и новее, Pixel 4 и новее. Самый надёжный способ — наберите **\\*#06#**: если на экране есть строка EID, eSIM поддерживается.'],
      [/установ|qr|настро|подключ/i, 'После оплаты QR-код придёт на почту. Установите eSIM дома по Wi‑Fi: **Настройки → Сотовая связь → Добавить eSIM** и отсканируйте код. По прилёте выберите eSIM для мобильных данных и включите для неё «Роуминг данных».'],
      [/тариф|цен|стоим|сколько|пакет|гб/i, 'Для отдельной страны: **1 ГБ на 7 дней — $3.90**, 3 ГБ на 15 дней — $9.90, 5 ГБ на 30 дней — $14.90. Подскажите страну и длину поездки — подберу точнее.'],
      [/оплат|карт|крипт|usdt|usdc|apple pay|google pay/i, 'Оплатить можно картой Visa или Mastercard, через Apple Pay, Google Pay или стейблкоинами USDT и USDC. Регистрация не нужна — только почта.'],
      [/возврат|вернуть|деньг/i, 'Если eSIM не установлена — вернём 100%. Для оформления возврата нужен сотрудник: оставьте, пожалуйста, почту, на которую оформляли покупку.'],
      [/сотрудник|человек|оператор|менеджер|связ/i, 'Конечно, подключу сотрудника. Оставьте почту или Telegram — с вами свяжутся.'],
      [/партн|бизнес|опт|api|реселл/i, 'Для бизнеса есть три модели: партнёрская ссылка, оптовые пакеты и API/White Label. Подробности и заявка — на странице partners.html.'],
    ],
    en: [
      [/phone|work|support|model|iphone|samsung|pixel|xiaomi/i, 'Most smartphones since 2019 support eSIM: **iPhone XS/XR and newer**, Galaxy S20 and newer, Pixel 4 and newer. The surest check: dial **\\*#06#** — if you see an EID line, your phone supports eSIM.'],
      [/install|qr|set ?up|activate/i, 'Your QR code arrives by email after payment. Install the eSIM at home on Wi‑Fi: **Settings → Mobile Data → Add eSIM** and scan the code. When you land, pick the eSIM for mobile data and turn on Data Roaming.'],
      [/plan|price|cost|how much|gb/i, 'For a single country: **1 GB for 7 days — $3.90**, 3 GB for 15 days — $9.90, 5 GB for 30 days — $14.90. Tell me where and how long you’re travelling and I’ll suggest the best fit.'],
      [/pay|card|crypto|usdt|usdc|apple pay|google pay/i, 'You can pay by Visa or Mastercard, Apple Pay, Google Pay, or USDT/USDC stablecoins. No sign-up — just your email.'],
      [/refund|money back/i, 'If the eSIM isn’t installed, you get a full refund. A team member handles refunds — please share the email you used for the purchase.'],
      [/person|human|agent|manager|contact/i, 'Sure, I’ll bring in a team member. Leave your email or Telegram and they’ll get in touch.'],
      [/partner|business|wholesale|api|resell/i, 'For businesses we offer an affiliate link, wholesale plans and API/White Label. Details and the application form are on partners.html.'],
    ],
  };
  function demo(text) {
    return new Promise((ok) => setTimeout(() => {
      const hit = DEMO[lang()].find(([re]) => re.test(text));
      const reply = hit ? hit[1].replace(/\\\*/g, '*') : (lang() === 'en'
        ? 'Got it. In demo mode I only know the basics — once the AI is connected I’ll answer any question. Meanwhile, a team member can help on Telegram.'
        : 'Понял вас. В демо-режиме я знаю только основное — после подключения ИИ отвечу на любой вопрос. А пока с этим поможет сотрудник в Telegram.');
      ok({ reply, handoff: false });
    }, 700 + Math.random() * 500));
  }

  /* ── открытие / закрытие ── */
  let lastFocus = null;
  function open() {
    lastFocus = document.activeElement;
    panel.classList.add('on'); panel.setAttribute('aria-hidden', 'false'); fab.classList.add('hide');
    fab.querySelector('.dot')?.remove();
    try { localStorage.setItem('sezam-chat-seen', '1'); } catch (e) {}
    if (matchMedia('(max-width:560px)').matches) document.body.style.overflow = 'hidden';
    list.scrollTop = list.scrollHeight;
    setTimeout(() => input.focus({ preventScroll: true }), 250);
  }
  function close() {
    panel.classList.remove('on'); panel.setAttribute('aria-hidden', 'true'); fab.classList.remove('hide');
    document.body.style.overflow = '';
    (lastFocus || fab).focus({ preventScroll: true });
  }
  fab.onclick = open;
  $('spClose').onclick = close;
  $('spReset').onclick = () => { msgs = []; save(); render(); input.focus({ preventScroll: true }); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel.classList.contains('on')) close(); });

  function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; }
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } });
  $('spForm').addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });

  try { if (localStorage.getItem('sezam-chat-seen') === '1') fab.querySelector('.dot')?.remove(); } catch (e) {}
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  render();
})();
