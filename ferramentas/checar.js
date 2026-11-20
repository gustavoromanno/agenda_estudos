// Confere questoes.js: fontes existentes, card existente e módulo coerente.
// Uso: node checar.js <repo> <artigos.json>
const fs = require("fs");
const path = require("path");
const [repo, artigosPath] = process.argv.slice(2);
global.window = {};
require(path.resolve(repo, "conteudo.js"));
require(path.resolve(repo, "questoes.js"));
const artigos = JSON.parse(fs.readFileSync(artigosPath, "utf8"));
const urls = new Map(artigos.map((a) => [a.url, a.titulo]));
const cards = new Map(window.ERP_CONTEUDO.cards.map((c) => [c.id, c]));
const manuais = new Set(["geral-acesso", "config-empresa", "ia-rotinas", "ia-permissoes"]);
const ids = new Set();
let erros = 0;
for (const q of window.ERP_QUESTOES) {
  if (ids.has(q.id)) { console.log("ID DUPLICADO", q.id); erros++; }
  ids.add(q.id);
  const card = cards.get(q.card);
  if (!card && !manuais.has(q.card)) { console.log("CARD?", q.id, q.card); erros++; }
  if (card && card.modulo !== q.modulo) { console.log("MODULO", q.id, q.modulo, "≠", card.modulo); erros++; }
  if (q.opcoes.length !== 4 || new Set(q.opcoes).size !== 4) { console.log("OPCOES", q.id); erros++; }
  if (q.fonte && !urls.has(q.fonte)) {
    const slug = q.fonte.split("/").pop().replace(/^\d+-/, "");
    const sugestao = [...urls.keys()].find((u) => u.endsWith(slug)) ||
      (card ? card.artigos.map((a) => a[1]).find((u) => u.includes(slug.split("-").slice(0, 3).join("-"))) : null);
    console.log("FONTE?", q.id, q.fonte.split("/").pop(), "→", sugestao || "(sem sugestão)");
    erros++;
  }
  if (q.fonte && card && !card.artigos.some((a) => a[1] === q.fonte)) console.log("aviso: fonte fora do card", q.id);
}
const porModulo = {};
window.ERP_QUESTOES.forEach((q) => { porModulo[q.modulo] = (porModulo[q.modulo] || 0) + 1; });
console.log(window.ERP_QUESTOES.length, "questões", JSON.stringify(porModulo), erros ? `${erros} problemas` : "OK");
