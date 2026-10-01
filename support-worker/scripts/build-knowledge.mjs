// Собирает базу знаний агента поддержки из данных сайта (index.html):
// цены, страны, регионы, совместимость, вопросы-ответы, условия.
// Запуск: node scripts/build-knowledge.mjs   (из папки support-worker)
// Перезапускайте после каждого изменения цен или текстов на сайте.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(here, "../../index.html"), "utf8");

const grab = (re, name) => {
  const m = html.match(re);
  if (!m) throw new Error(`Не нашёл ${name} в index.html`);
  return m[1];
};
const evalJs = (src) => new Function(`return (${src});`)();

const i18nStart = html.indexOf("const I18N={");
const i18nEnd = html.indexOf("\n}};", i18nStart);
if (i18nStart < 0 || i18nEnd < 0) throw new Error("Не нашёл I18N в index.html");
const I18N = evalJs(html.slice(i18nStart + "const I18N=".length, i18nEnd + 3));

const RAW = grab(/const RAW="([^"]+)"/, "RAW");
const PACKS = evalJs(grab(/const PACKS=(\[[^;]+\]);/, "PACKS"));
const REG_META = evalJs(grab(/const REG_META=(\[[^;]+\]);/, "REG_META"));
const GLOBAL = evalJs(grab(/const GLOBAL=(\[[^;]+\]);/, "GLOBAL"));
const VER = evalJs(grab(/const VER=(\{[^;]+\});/, "VER"));

const money = (usd) => "$" + (Math.round(usd * 100) / 100).toFixed(2);
const ru = I18N.ru, en = I18N.en;
const countries = RAW.split("|").map((s) => s.split(":"));

const packTable = (k) =>
  PACKS.map((p) => `${p.gb} ГБ / ${p.days} дн. — ${money(p.usd * k)}`).join("; ");

const lines = [];
lines.push("# База знаний «Сезам eSIM» (сгенерировано из сайта, не редактировать вручную)");
lines.push("");
lines.push("## Тарифы");
lines.push(`Пакеты для любой отдельной страны: ${packTable(1)}. Цены в долларах США.`);
lines.push("Для регионов и «Весь мир» цена умножается на коэффициент направления:");
REG_META.forEach(([id, cnt, k], i) => {
  const [name, list] = ru.regions[i];
  const [nameEn] = en.regions[i];
  lines.push(`- ${name} / ${nameEn} (${cnt} стран: ${list}): ${packTable(k)}`);
});
GLOBAL.forEach((g) => {
  lines.push(`- ${ru.world[0]} / ${en.world[0]} (${g.cnt}+ стран: ${ru.world[1]}): ${packTable(g.k)}`);
});
lines.push("Срок действия пакета начинается с первого подключения к сети в стране поездки, а не с момента покупки.");
lines.push("");
lines.push("## Страны (код: русское название / английское название). Всего " + countries.length);
lines.push(countries.map(([c, r, e]) => `${c}: ${r} / ${e}`).join("; "));
lines.push("");
lines.push("## Условия");
Object.keys(ru).filter((k) => /^tm\.\d/.test(k) && !k.endsWith("b")).forEach((k) => {
  const b = ru[k + "b"];
  lines.push(`- ${b ? b + " — " : k === "tm.1" ? `от ${money(PACKS[0].usd)} ` : ""}${ru[k]}`);
});
lines.push("");
lines.push("## Совместимость телефонов");
Object.entries(ru.models).forEach(([brand, models]) => {
  const v = VER[brand] || [];
  models.forEach((m, i) => {
    const verdict = ru.v?.[v[i]]?.[0] ?? v[i];
    lines.push(`- ${brand === "other" ? "Другие" : brand}: ${m} — ${verdict}`);
  });
});
for (const key of ["yes", "maybe", "no"]) {
  const v = ru.v?.[key];
  if (v) lines.push(`  · «${v[0]}»: ${v[1]}`);
}
lines.push(`Проверка любого телефона: ${String(ru["cp.p0"]).replace(/<[^>]+>/g, "")}`);
lines.push("");
lines.push("## Как это работает (путь клиента)");
(ru.xp || []).forEach(([h, p], i) => lines.push(`${i + 1}. ${h}: ${p}`));
lines.push("");
lines.push("## После оплаты (инструкция клиенту)");
(ru.sh?.steps || []).forEach((s, i) => lines.push(`${i + 1}. ${s}`));
lines.push(`Способы оплаты: банковская карта (Visa, Mastercard), Apple Pay, Google Pay, стейблкоины (USDT, USDC). ${ru.sh?.refund ?? ""}`);
lines.push("");
lines.push("## Частые вопросы");
(ru.faq || []).forEach(([q, a]) => lines.push(`В: ${q}\nО: ${String(a).replace(/<[^>]+>/g, "")}`));
lines.push("");
lines.push("## Для бизнеса");
lines.push("Есть партнёрская программа для турагентств, отелей, магазинов, банков и онлайн-сервисов: партнёрская ссылка, оптовые пакеты, API и White Label. Подробности и заявка — на странице partners.html сайта.");

const text = lines.join("\n");
const out = `// Сгенерировано scripts/build-knowledge.mjs из index.html — не редактировать вручную.\nexport const KNOWLEDGE = ${JSON.stringify(text)};\n`;
writeFileSync(path.join(here, "../src/knowledge.ts"), out);
console.log(`knowledge.ts: ${text.length} символов, стран: ${countries.length}`);
