/* =========================================================
   ERP Study Scheduler (Kanban & CRM) — Vanilla JS
   Arquitetura (espelha a versão Java):
     Domínio     -> Temperatura, Fases, Níveis
     Store       -> estado único persistido no localStorage
     Services    -> KanbanService, AgendaService (Greedy),
                    DesempenhoService, QuizService
     Views       -> Board, Inbox, Planner, Performance, Quiz,
                    PlanDrawer, CardModal, QuizModal, Switcher
     Router      -> troca de telas pela barra inferior (#hash)
   ========================================================= */
(() => {
  "use strict";

  const DATA = window.ERP_DATA;

  /* ---------- DOMÍNIO ---------- */
  const MODULOS = DATA.modulos;
  const MOD = Object.fromEntries(MODULOS.map((m) => [m.id, m]));
  // Cards da base (com a lista de artigos) e títulos dos artigos por link.
  const BASE = Object.fromEntries(DATA.cards.map((c) => [c.id, c]));
  const TITULO_ARTIGO = new Map(DATA.cards.flatMap((c) => (c.artigos || []).map(([t, u]) => [u, t])));
  // No estado salvo vão só os dados editáveis; artigos ficam na base.
  const cardDaBase = (c) => ({ id: c.id, materia: c.materia, modulo: c.modulo, horas: c.horas, temperatura: c.temperatura, status: "todo" });

  const Temperatura = Object.freeze({
    hot: { key: "hot", label: "Quente", nivel: "Alta", peso: 3, cor: "#dc2626" },
    warm: { key: "warm", label: "Morna", nivel: "Média", peso: 2, cor: "#d97706" },
    cold: { key: "cold", label: "Fria", nivel: "Baixa", peso: 1, cor: "#0284c7" },
  });
  const temp = (k) => Temperatura[k] || Temperatura.cold;

  const FASES = ["todo", "doing", "done"];
  const TITULO_FASE = { todo: "A Fazer", doing: "Em Andamento", done: "Concluído" };
  const NIVEIS = ["", "Não conhece", "Básico", "Intermediário", "Avançado", "Referência"];
  const DIAS = [
    { n: 1, curto: "Seg" }, { n: 2, curto: "Ter" }, { n: 3, curto: "Qua" }, { n: 4, curto: "Qui" },
    { n: 5, curto: "Sex" }, { n: 6, curto: "Sáb" }, { n: 7, curto: "Dom" },
  ];
  const TIPOS_PROVA = { simulado: "Simulado", prova: "Prova do módulo", final: "Prova final" };

  /* ---------- UTILITÁRIOS ---------- */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const pad = (n) => String(n).padStart(2, "0");
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const hoje = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const diaSemana = (d) => ((d.getDay() + 6) % 7) + 1; // 1 = segunda … 7 = domingo
  const segundaDe = (d) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -(diaSemana(d) - 1));
  const fmtData = (iso) => parseISO(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const modStyle = (id) => { const m = MOD[id]; return m ? `--tag-bg:${m.tagBg};--tag-fg:${m.tagFg}` : ""; };
  const modTag = (id) => `<span class="tag" style="${modStyle(id)}">${esc(MOD[id]?.nome ?? "Todos os módulos")}</span>`;
  const fonteHtml = (q) => (q.fonte
    ? `<a class="fonte" href="${esc(q.fonte)}" target="_blank" rel="noopener">📚 Fonte: ${esc(TITULO_ARTIGO.get(q.fonte) || "artigo da Central de Ajuda")} ↗</a>`
    : "");
  const tempTag = (k) => `<span class="tag tag--${temp(k).key}">${temp(k).nivel} · ${temp(k).label}</span>`;
  const scoreClass = (n) => (n >= 70 ? "score--good" : n >= 45 ? "score--mid" : "score--bad");

  const Toast = {
    timer: null,
    show(msg) {
      const el = $("#toast");
      el.textContent = msg;
      el.classList.add("is-visible");
      clearTimeout(this.timer);
      this.timer = setTimeout(() => el.classList.remove("is-visible"), 2600);
    },
  };

  /* =========================================================
     STORE — estado único + persistência segura
     ========================================================= */
  const Store = {
    KEY: "erp-study-scheduler:v2",
    LEGACY: "erp-study-scheduler:v1",
    state: null,

    seed() {
      const agora = toISO(hoje());
      return {
        cards: DATA.cards.map(cardDaBase),
        inbox: DATA.inbox.map((i) => ({ ...i, criadoEm: agora })),
        notas: [],
        autoavaliacao: Object.fromEntries(MODULOS.map((m) => [m.id, 1])),
        tentativas: [],
        planos: {},
        config: { quadro: "todos", dias: [1, 2, 3, 4, 5], inboxAberta: true },
        versaoBase: DATA.versao,
      };
    },

    /** Leva cards novos da base para quem já tem dados salvos. */
    atualizarBase() {
      const st = this.state;
      if ((st.versaoBase || 1) >= DATA.versao) return;
      const removidos = new Set(DATA.removidos || []);
      st.cards = st.cards.filter((c) => !(removidos.has(c.id) && c.status === "todo"));
      // Cards da base já existentes: título e horas acompanham o material; coluna e prioridade são do usuário.
      st.cards.forEach((c) => { const b = BASE[c.id]; if (b) { c.materia = b.materia; c.horas = b.horas; } delete c.artigos; delete c.referencia; });
      const ids = new Set(st.cards.map((c) => c.id));
      DATA.cards.filter((c) => !ids.has(c.id) && !removidos.has(c.id)).forEach((c) => st.cards.push(cardDaBase(c)));
      st.versaoBase = DATA.versao;
      this.save();
    },

    read(key) {
      try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
    },

    load() {
      const base = this.seed();
      const salvo = this.read(this.KEY);

      if (salvo && typeof salvo === "object") {
        const arr = (v, fb) => (Array.isArray(v) ? v : fb);
        this.state = {
          cards: arr(salvo.cards, base.cards).filter((c) => c && MOD[c.modulo] && FASES.includes(c.status) && c.materia),
          inbox: arr(salvo.inbox, base.inbox).filter((i) => i && i.texto),
          notas: arr(salvo.notas, []).filter((n) => n && n.texto),
          autoavaliacao: { ...base.autoavaliacao, ...(salvo.autoavaliacao || {}) },
          tentativas: arr(salvo.tentativas, []).filter((t) => t && Array.isArray(t.respostas)),
          planos: salvo.planos && typeof salvo.planos === "object" ? salvo.planos : {},
          config: { ...base.config, ...(salvo.config || {}) },
          versaoBase: salvo.versaoBase || 1,
        };
        if (this.state.config.quadro !== "todos" && !MOD[this.state.config.quadro]) this.state.config.quadro = "todos";
        this.atualizarBase();
        return;
      }

      // Migração da versão 1 (salvava só [{id, status}])
      const legado = this.read(this.LEGACY);
      if (Array.isArray(legado)) {
        const pos = new Map(legado.map((c) => [c?.id, c?.status]));
        base.cards.forEach((c) => { if (FASES.includes(pos.get(c.id))) c.status = pos.get(c.id); });
      }
      this.state = base;
      this.save();
    },

    save() {
      try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); } catch { /* sem storage: segue em memória */ }
    },

    reset() {
      try { localStorage.removeItem(this.KEY); localStorage.removeItem(this.LEGACY); } catch { /* ignore */ }
      this.state = this.seed();
      this.save();
    },
  };
  const S = () => Store.state;

  /* =========================================================
     SERVIÇO: Quadro Kanban
     ========================================================= */
  const KanbanService = {
    busca: "",

    buscar(id) { return S().cards.find((c) => c.id === id); },

    visivel(card) {
      const q = S().config.quadro;
      if (q !== "todos" && card.modulo !== q) return false;
      if (!this.busca) return true;
      const alvo = norm(`${card.materia} ${MOD[card.modulo].nome}`);
      return alvo.includes(norm(this.busca));
    },

    naFase(fase) { return S().cards.filter((c) => c.status === fase && this.visivel(c)); },

    mover(id, fase, antesDeId = null) {
      const cards = S().cards;
      const idx = cards.findIndex((c) => c.id === id);
      if (idx === -1 || !FASES.includes(fase)) return false;
      const [card] = cards.splice(idx, 1);
      card.status = fase;
      let destino = antesDeId ? cards.findIndex((c) => c.id === antesDeId) : -1;
      if (destino === -1) {
        const ultimos = cards.map((c, i) => (c.status === fase ? i : -1)).filter((i) => i >= 0);
        destino = ultimos.length ? ultimos[ultimos.length - 1] + 1 : cards.length;
      }
      cards.splice(destino, 0, card);
      Store.save();
      return true;
    },

    salvar(dados) {
      const existente = dados.id && this.buscar(dados.id);
      if (existente) {
        const mudouFase = existente.status !== dados.status;
        Object.assign(existente, dados);
        if (mudouFase) this.mover(existente.id, dados.status);
      } else {
        S().cards.push({ ...dados, id: uid("card") });
      }
      Store.save();
    },

    remover(id) {
      S().cards = S().cards.filter((c) => c.id !== id);
      Store.save();
    },
  };

  /* =========================================================
     SERVIÇO: Agenda Inteligente (Greedy Algorithm)
     ========================================================= */
  const AgendaService = {
    /**
     * Estratégia gulosa: ordena por temperatura (Quente > Morna > Fria) e,
     * a cada passo, aloca no card mais prioritário min(horasCard, horasRestantes).
     * A ordenação é estável: empates respeitam a ordem do quadro.
     */
    distribuir(cards, horasSemanais) {
      const ordenados = [...cards].sort((a, b) => temp(b.temperatura).peso - temp(a.temperatura).peso);
      let restantes = horasSemanais;
      const itens = ordenados.map((card) => {
        const alocadas = Math.min(card.horas, Math.max(restantes, 0));
        restantes -= alocadas;
        return { cardId: card.id, materia: card.materia, modulo: card.modulo, temperatura: card.temperatura, horas: card.horas, alocadas, faltam: card.horas - alocadas };
      });
      return {
        itens,
        totalAlocado: horasSemanais - restantes,
        horasLivres: restantes,
        horasPendentes: itens.reduce((s, i) => s + i.faltam, 0),
      };
    },

    /** Espalha as horas alocadas pelos dias de estudo, enchendo um dia de cada vez. */
    montarAgenda(itens, horas, datas) {
      const n = datas.length;
      const cap = datas.map((_, i) => Math.floor(horas / n) + (i < horas % n ? 1 : 0));
      const usado = datas.map(() => 0);
      const agenda = Object.fromEntries(datas.map((d) => [d, []]));
      let d = 0;
      itens.forEach((item) => {
        let resto = item.alocadas;
        while (resto > 0 && d < n) {
          const livre = cap[d] - usado[d];
          if (livre <= 0) { d++; continue; }
          const pega = Math.min(resto, livre);
          agenda[datas[d]].push({ cardId: item.cardId, materia: item.materia, modulo: item.modulo, horas: pega });
          usado[d] += pega;
          resto -= pega;
        }
      });
      return agenda;
    },

    planejar(horas, dias, offsetSemanas) {
      const segunda = addDays(segundaDe(hoje()), 7 * offsetSemanas);
      const datas = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(segunda, i);
        if (dias.includes(diaSemana(d)) && d >= hoje()) datas.push(toISO(d));
      }
      if (!datas.length) {
        return { erro: "Não sobrou nenhum dia de estudo nesta semana. Escolha outros dias ou planeje a próxima semana." };
      }
      const emAndamento = S().cards.filter((c) => c.status === "doing");
      const r = this.distribuir(emAndamento, horas);
      const plano = {
        semana: toISO(segunda), horas, dias: [...dias], ...r,
        agenda: this.montarAgenda(r.itens, horas, datas),
        criadoEm: new Date().toISOString(),
      };
      S().planos[plano.semana] = plano;
      Store.save();
      return { plano };
    },

    planoDaSemana(offset = 0) {
      return S().planos[toISO(addDays(segundaDe(hoje()), 7 * offset))] || null;
    },

    diasDoCard(plano, cardId) {
      return Object.entries(plano.agenda)
        .flatMap(([data, evs]) => evs.filter((e) => e.cardId === cardId).map((e) => ({ data, horas: e.horas })));
    },
  };

  /* =========================================================
     SERVIÇO: Desempenho (autoavaliação × provas)
     ========================================================= */
  const DesempenhoService = {
    resultados(moduloId) {
      return S().tentativas
        .map((t) => {
          const rs = t.respostas.filter((r) => r.modulo === moduloId);
          return rs.length ? Math.round((rs.filter((r) => r.acertou).length / rs.length) * 100) : null;
        })
        .filter((v) => v !== null);
    },

    /** Média das 3 tentativas mais recentes que tiveram questões do módulo. */
    nota(moduloId) {
      const rs = this.resultados(moduloId).slice(-3);
      return rs.length ? Math.round(rs.reduce((a, b) => a + b, 0) / rs.length) : null;
    },

    auto(moduloId) { return S().autoavaliacao[moduloId] || 1; },

    /** As provas medem até o nível 4; o nível 5 exige nota ≥ 90 e autoavaliação 5. */
    nivelProvas(moduloId) {
      const n = this.nota(moduloId);
      if (n === null) return null;
      let nivel = n < 20 ? 1 : n < 45 ? 2 : n < 70 ? 3 : 4;
      if (n >= 90 && this.auto(moduloId) === 5) nivel = 5;
      return nivel;
    },

    /** Prontidão = 60% nota das provas + 40% autoavaliação. */
    prontidao(moduloId) {
      return Math.round(0.6 * (this.nota(moduloId) ?? 0) + 0.4 * (this.auto(moduloId) / 5) * 100);
    },

    geral() {
      const vals = MODULOS.map((m) => this.prontidao(m.id));
      const pct = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      const nivel = pct < 20 ? 1 : pct < 40 ? 2 : pct < 60 ? 3 : pct < 80 ? 4 : 5;
      return { pct, nivel };
    },

    topicosFracos(moduloId) {
      const mapa = {};
      S().tentativas.forEach((t) => t.respostas.filter((r) => r.modulo === moduloId).forEach((r) => {
        mapa[r.topico] ??= { topico: r.topico, erros: 0, total: 0 };
        mapa[r.topico].total++;
        if (!r.acertou) mapa[r.topico].erros++;
      }));
      return Object.values(mapa).filter((t) => t.erros > 0).sort((a, b) => b.erros - a.erros || b.erros / b.total - a.erros / a.total);
    },

    /** Gera dicas priorizadas a partir dos dados. Cada dica pode ter uma ação. */
    dicas() {
      const linhas = MODULOS.map((m) => ({ m, nota: this.nota(m.id), auto: this.auto(m.id), nivel: this.nivelProvas(m.id), fracos: this.topicosFracos(m.id) }));
      const dicas = [];
      const usados = new Set();

      const semProva = linhas.filter((l) => l.nota === null);
      if (semProva.length) {
        const alvo = semProva[0];
        const nomes = semProva.slice(0, 4).map((l) => l.m.nome).join(", ") + (semProva.length > 4 ? "…" : "");
        dicas.push({
          icone: "🚨",
          html: semProva.length === 1
            ? `<b>${esc(alvo.m.nome)} ainda não tem nenhuma prova.</b> Faça um simulado para descobrir seu nível real.`
            : `<b>${semProva.length} módulos ainda sem prova:</b> ${esc(nomes)}. Comece por <b>${esc(alvo.m.nome)}</b>.`,
          acao: { label: `Fazer simulado de ${alvo.m.nome} →`, run: () => QuizModal.abrir("simulado", alvo.m.id) },
        });
      }

      linhas.filter((l) => l.nivel !== null && l.auto > l.nivel)
        .sort((a, b) => (b.auto - b.nivel) - (a.auto - a.nivel))
        .slice(0, 2)
        .forEach((l) => {
          usados.add(l.m.id);
          const f = l.fracos[0];
          dicas.push({
            icone: "📉",
            html: `<b>${esc(l.m.nome)}:</b> sua autoavaliação (${l.auto}) está acima do que as provas mostram (nota ${l.nota}, nível ${l.nivel}).` +
              (f ? ` O tópico em que você mais erra é <b>${esc(f.topico)}</b> (${f.erros} de ${f.total}).` : ""),
            acao: { label: "Estudar no quadro do módulo →", run: () => { Router.trocarQuadro(l.m.id); Router.ir("quadro"); } },
          });
        });

      linhas.filter((l) => l.nota !== null && l.nota < 45 && !usados.has(l.m.id)).slice(0, 1).forEach((l) => {
        usados.add(l.m.id);
        dicas.push({
          icone: "📚",
          html: `<b>${esc(l.m.nome)}:</b> nota ${l.nota}. Coloque os cards desse módulo em <b>Em Andamento</b> e distribua horas para ele nesta semana.`,
          acao: { label: "Abrir quadro do módulo →", run: () => { Router.trocarQuadro(l.m.id); Router.ir("quadro"); } },
        });
      });

      linhas.filter((l) => l.nivel !== null && l.nivel > l.auto).slice(0, 1).forEach((l) => {
        dicas.push({
          icone: "💪",
          html: `<b>${esc(l.m.nome)}:</b> você se avaliou com ${l.auto}, mas as provas indicam nível ${l.nivel} (${NIVEIS[l.nivel]}). Se concordar, atualize sua autoavaliação.`,
          acao: { label: `Ajustar para ${l.nivel} →`, run: () => { S().autoavaliacao[l.m.id] = l.nivel; Store.save(); PerformanceView.render(); Toast.show(`Autoavaliação de ${l.m.nome}: ${l.nivel}`); } },
        });
      });

      linhas.filter((l) => l.nivel !== null && l.nivel >= 4 && l.auto < 5).slice(0, 1).forEach((l) => {
        dicas.push({
          icone: "🚀",
          html: `<b>${esc(l.m.nome)}:</b> você já está no nível Avançado. Para chegar a <b>Referência</b>, acompanhe as melhorias do módulo, analise tickets do assunto e registre o que aprendeu no bloco de notas.`,
          acao: { label: "Nova anotação →", run: () => PerformanceView.focarNota(l.m.id) },
        });
      });

      if (linhas.every((l) => l.nota !== null && l.nota >= 70)) {
        dicas.unshift({
          icone: "🏁",
          html: "<b>Todos os módulos estão com nota 70 ou mais.</b> Você está pronto para a prova final com todos os módulos.",
          acao: { label: "Fazer a prova final →", run: () => QuizModal.abrir("final") },
        });
      }

      if (!dicas.length) {
        dicas.push({ icone: "✅", html: "Tudo alinhado entre autoavaliação e provas. Continue fazendo simulados para manter o ritmo." });
      }
      return dicas.slice(0, 5);
    },
  };

  /* =========================================================
     SERVIÇO: Simulados e provas
     ========================================================= */
  const QuizService = {
    sessao: null,
    MAX_MODULO: 10,
    MAX_PROVA: 15,
    POR_MODULO_FINAL: 2,

    questoesDo(moduloId) { return DATA.questoes.filter((q) => q.modulo === moduloId); },

    montar(tipo, moduloId) {
      if (tipo === "final") {
        return shuffle(MODULOS.flatMap((m) => shuffle(this.questoesDo(m.id)).slice(0, this.POR_MODULO_FINAL)));
      }
      return shuffle(this.questoesDo(moduloId)).slice(0, tipo === "prova" ? this.MAX_PROVA : this.MAX_MODULO);
    },

    iniciar(tipo, moduloId) {
      const questoes = this.montar(tipo, moduloId).map((q) => ({ q, ordem: shuffle(q.opcoes.map((_, i) => i)) }));
      if (!questoes.length) return false;
      this.sessao = {
        tipo, modulo: tipo === "final" ? null : moduloId, questoes,
        respostas: questoes.map(() => null), i: 0, inicio: Date.now(), revelada: false, resultado: null,
      };
      return true;
    },

    responder(indiceOriginal) {
      const s = this.sessao;
      if (!s || s.resultado) return;
      if (s.tipo === "simulado") {
        if (s.revelada) return;
        s.respostas[s.i] = indiceOriginal;
        s.revelada = true;
      } else {
        s.respostas[s.i] = indiceOriginal;
      }
    },

    ir(delta) {
      const s = this.sessao;
      s.i = Math.min(Math.max(s.i + delta, 0), s.questoes.length - 1);
      s.revelada = s.tipo === "simulado" && s.respostas[s.i] !== null;
    },

    acertos() {
      const s = this.sessao;
      return s.questoes.reduce((n, { q }, i) => n + (s.respostas[i] === q.correta ? 1 : 0), 0);
    },

    finalizar() {
      const s = this.sessao;
      const respostas = s.questoes.map(({ q }, i) => ({ qid: q.id, modulo: q.modulo, topico: q.topico, acertou: s.respostas[i] === q.correta }));
      const acertos = respostas.filter((r) => r.acertou).length;
      const tentativa = {
        id: uid("t"), tipo: s.tipo, modulo: s.modulo ?? "todos", data: toISO(hoje()),
        duracao: Math.round((Date.now() - s.inicio) / 1000),
        acertos, total: respostas.length, nota: Math.round((acertos / respostas.length) * 100), respostas,
      };
      S().tentativas.push(tentativa);
      Store.save();
      s.resultado = tentativa;
      return tentativa;
    },
  };

  /* =========================================================
     VIEW: Quadro (Kanban) + Drag and Drop
     ========================================================= */
  const BoardView = {
    arrastandoId: null,

    init() {
      const lists = $("#lists");

      lists.addEventListener("dragstart", (e) => {
        const card = e.target.closest?.(".card");
        if (!card) return;
        this.arrastandoId = card.dataset.id;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", card.dataset.id);
        requestAnimationFrame(() => card.classList.add("is-dragging"));
      });
      lists.addEventListener("dragend", (e) => {
        e.target.closest?.(".card")?.classList.remove("is-dragging");
        $$(".list__body.is-over").forEach((z) => z.classList.remove("is-over"));
        this.arrastandoId = null;
      });

      $$("[data-dropzone]").forEach((zona) => {
        zona.addEventListener("dragover", (e) => {
          if (!this.arrastandoId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          zona.classList.add("is-over");
        });
        zona.addEventListener("dragleave", (e) => { if (!zona.contains(e.relatedTarget)) zona.classList.remove("is-over"); });
        zona.addEventListener("drop", (e) => {
          e.preventDefault();
          zona.classList.remove("is-over");
          const id = e.dataTransfer.getData("text/plain") || this.arrastandoId;
          if (!id) return;
          const antes = this.cardAbaixo(zona, e.clientY, id);
          this.mover(id, zona.dataset.dropzone, antes?.dataset.id ?? null);
        });
      });

      lists.addEventListener("click", (e) => {
        const move = e.target.closest(".card__move");
        if (move) { this.moverRelativo(move.closest(".card").dataset.id, Number(move.dataset.dir)); return; }
        const add = e.target.closest("[data-add]");
        if (add) { CardModal.abrir({ preset: { status: add.dataset.add } }); return; }
        const plano = e.target.closest("[data-open-plan]");
        if (plano) { PlanDrawer.abrir(); return; }
        const card = e.target.closest(".card");
        if (card) CardModal.abrir({ card: KanbanService.buscar(card.dataset.id) });
      });

      lists.addEventListener("keydown", (e) => {
        const card = e.target.closest(".card");
        if (!card || e.target !== card) return;
        if (e.key === "ArrowLeft") this.moverRelativo(card.dataset.id, -1);
        else if (e.key === "ArrowRight") this.moverRelativo(card.dataset.id, 1);
        else if (e.key === "Enter") CardModal.abrir({ card: KanbanService.buscar(card.dataset.id) });
      });
    },

    render() {
      const plano = AgendaService.planoDaSemana(0);
      FASES.forEach((fase) => {
        const zona = $(`[data-dropzone="${fase}"]`);
        const cards = KanbanService.naFase(fase);
        zona.replaceChildren(...cards.map((c) => this.criarCard(c, plano)));
        if (!cards.length) {
          const p = document.createElement("p");
          p.className = "list__empty";
          p.textContent = KanbanService.busca ? "Nenhum card encontrado." : fase === "doing" ? "Arraste para cá o que vai estudar esta semana." : "Solte um card aqui.";
          zona.append(p);
        }
        $(`[data-count="${fase}"]`).textContent = cards.length;
      });
      this.renderSemana(plano);
    },

    criarCard(card, plano) {
      const t = temp(card.temperatura);
      const m = MOD[card.modulo];
      const el = $("#card-template").content.firstElementChild.cloneNode(true);
      el.dataset.id = card.id;
      el.dataset.status = card.status;
      el.setAttribute("aria-label", `${card.materia}. ${m.nome}. ${card.horas} horas. Prioridade ${t.nivel}. Coluna ${TITULO_FASE[card.status]}. Enter para editar, setas para mover.`);
      $(".card__label--temp", el).style.setProperty("--c", t.cor);
      $(".card__label--mod", el).style.setProperty("--c", m.cor);
      $(".card__title", el).textContent = card.materia;
      const tag = $(".card__module", el);
      tag.textContent = m.nome;
      tag.setAttribute("style", modStyle(m.id));
      const tt = $(".card__temp", el);
      tt.textContent = t.label;
      tt.classList.add(`tag--${t.key}`);
      const base = BASE[card.id];
      const nArtigos = base?.artigos?.length || 0;
      $(".card__hours", el).textContent = `⏱ ${card.horas}h${nArtigos ? ` · 📄 ${nArtigos}` : ""}`;
      if (base?.referencia) {
        const ref = document.createElement("span");
        ref.className = "tag";
        ref.title = "Card de consulta: estude alguns exemplos e consulte o resto quando precisar";
        ref.textContent = "Consulta";
        $(".card__hours", el).before(ref);
      }

      const item = card.status === "doing" && plano?.itens.find((i) => i.cardId === card.id);
      if (item) {
        const box = $(".card__plan", el);
        box.hidden = false;
        const dias = AgendaService.diasDoCard(plano, card.id).map((d) => DIAS[diaSemana(parseISO(d.data)) - 1].curto);
        $(".card__plan-text", box).textContent = item.alocadas === 0
          ? "Sem horas nesta semana"
          : `${item.alocadas}h de ${item.horas}h nesta semana${item.faltam ? ` · faltam ${item.faltam}h` : ""}${dias.length ? ` · ${[...new Set(dias)].join(", ")}` : ""}`;
        const bar = $(".bar > b", box);
        bar.style.width = `${Math.round((item.alocadas / item.horas) * 100)}%`;
        if (!item.faltam) bar.style.background = "var(--ok)";
      }

      const pos = FASES.indexOf(card.status);
      $('.card__move[data-dir="-1"]', el).disabled = pos === 0;
      $('.card__move[data-dir="1"]', el).disabled = pos === FASES.length - 1;
      return el;
    },

    renderSemana(plano) {
      const box = $("#week-widget");
      const emAndamento = S().cards.filter((c) => c.status === "doing");
      if (!plano) {
        box.innerHTML = `
          <h3>📅 Esta semana</h3>
          <div class="week__big">${emAndamento.length} <small>${emAndamento.length === 1 ? "card em andamento" : "cards em andamento"}</small></div>
          <p>Você ainda não distribuiu as horas desta semana.</p>
          <button type="button" class="btn btn--primary btn--sm btn--block" data-open-plan>⚡ Distribuir horas</button>`;
        return;
      }
      const pct = plano.horas ? Math.round((plano.totalAlocado / plano.horas) * 100) : 0;
      const msg = plano.horasPendentes > 0
        ? `Faltam ${plano.horasPendentes}h nas matérias em andamento → próxima semana.`
        : plano.horasLivres > 0 ? `Sobram ${plano.horasLivres}h livres nesta semana.` : "Encaixe perfeito nesta semana.";
      box.innerHTML = `
        <h3>📅 Esta semana</h3>
        <div class="week__big">${plano.totalAlocado}h <small>de ${plano.horas}h alocadas</small></div>
        <div class="bar"><b style="width:${pct}%"></b></div>
        <p>${esc(msg)}</p>
        <button type="button" class="btn btn--light btn--sm btn--block" data-open-plan>Ver plano semanal</button>`;
    },

    moverRelativo(id, dir) {
      const card = KanbanService.buscar(id);
      const destino = card && FASES[FASES.indexOf(card.status) + dir];
      if (!destino) return;
      this.mover(id, destino, null);
      $(`.card[data-id="${CSS.escape(id)}"]`)?.focus();
    },

    mover(id, fase, antesDeId) {
      const card = KanbanService.buscar(id);
      const anterior = card?.status;
      if (!KanbanService.mover(id, fase, antesDeId)) return;
      App.render();
      if (anterior !== fase) Toast.show(`"${card.materia}" → ${TITULO_FASE[fase]}`);
    },

    cardAbaixo(zona, y, idArrastado) {
      return $$(".card", zona).filter((c) => c.dataset.id !== idArrastado).reduce((melhor, el) => {
        const box = el.getBoundingClientRect();
        const off = y - box.top - box.height / 2;
        return off < 0 && off > melhor.off ? { off, el } : melhor;
      }, { off: Number.NEGATIVE_INFINITY, el: null }).el;
    },
  };

  /* =========================================================
     VIEW: Caixa de entrada
     ========================================================= */
  const InboxView = {
    init() {
      $("#inbox-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const texto = $("#inbox-text").value.trim();
        if (!texto) return;
        S().inbox.unshift({ id: uid("in"), texto, modulo: $("#inbox-module").value, origem: "Anotado por você", criadoEm: toISO(hoje()) });
        Store.save();
        $("#inbox-text").value = "";
        this.render();
        Toast.show("Tópico adicionado à Caixa de entrada");
      });

      $("#inbox-close").addEventListener("click", () => this.alternar(false));

      $("#inbox-list").addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        const id = btn.closest("[data-id]").dataset.id;
        const item = S().inbox.find((i) => i.id === id);
        if (!item) return;
        if (btn.dataset.act === "del") {
          S().inbox = S().inbox.filter((i) => i.id !== id);
          Store.save();
          this.render();
        } else {
          CardModal.abrir({
            preset: { materia: item.texto, modulo: item.modulo, status: "todo" },
            aoSalvar: () => { S().inbox = S().inbox.filter((i) => i.id !== id); Store.save(); },
          });
        }
      });
    },

    alternar(forcar) {
      S().config.inboxAberta = forcar ?? !S().config.inboxAberta;
      Store.save();
      this.render();
      if (S().config.inboxAberta) $("#inbox-text").focus({ preventScroll: true });
    },

    render() {
      const aberta = S().config.inboxAberta;
      $("#inbox").hidden = !aberta;
      const q = S().config.quadro;
      $("#inbox-module").value = q !== "todos" ? q : $("#inbox-module").value;
      const itens = S().inbox.filter((i) => q === "todos" || i.modulo === q);
      const badge = $("#inbox-badge");
      badge.textContent = S().inbox.length;
      badge.hidden = S().inbox.length === 0;

      $("#inbox-list").innerHTML = itens.length
        ? itens.map((i) => `
          <li class="inbox__item" data-id="${esc(i.id)}">
            <p>${esc(i.texto)}</p>
            <div class="inbox__meta">${modTag(i.modulo)}<span>${esc(i.origem || "")}${i.criadoEm ? ` · ${fmtData(i.criadoEm)}` : ""}</span></div>
            <div class="inbox__actions">
              <button type="button" class="btn btn--light btn--sm" data-act="card">→ Virar card</button>
              <button type="button" class="btn btn--light btn--sm" data-act="del" aria-label="Excluir tópico">✕</button>
            </div>
          </li>`).join("")
        : `<li class="inbox__empty">Nada por aqui. Anote tópicos para estudar depois, ou mande para cá as questões erradas dos simulados.</li>`;
    },
  };

  /* =========================================================
     VIEW: Planejador (agenda do mês)
     ========================================================= */
  const PlannerView = {
    mes: null,

    init() {
      const h = hoje();
      this.mes = new Date(h.getFullYear(), h.getMonth(), 1);
      $("#cal-prev").addEventListener("click", () => { this.mes.setMonth(this.mes.getMonth() - 1); this.render(); });
      $("#cal-next").addEventListener("click", () => { this.mes.setMonth(this.mes.getMonth() + 1); this.render(); });
      $("#cal-today").addEventListener("click", () => { const d = hoje(); this.mes = new Date(d.getFullYear(), d.getMonth(), 1); this.render(); });
      $("#cal-grid").addEventListener("click", (e) => {
        const ev = e.target.closest("[data-card]");
        if (!ev) return;
        const card = KanbanService.buscar(ev.dataset.card);
        if (card) CardModal.abrir({ card });
        else Toast.show("Esse card foi excluído do quadro.");
      });
    },

    eventos() {
      const q = S().config.quadro;
      const mapa = {};
      Object.values(S().planos).forEach((p) => Object.entries(p.agenda || {}).forEach(([data, evs]) => {
        evs.filter((e) => q === "todos" || e.modulo === q).forEach((e) => (mapa[data] ??= []).push(e));
      }));
      return mapa;
    },

    render() {
      const titulo = this.mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      $("#cal-title").textContent = titulo.charAt(0).toUpperCase() + titulo.slice(1);
      const inicio = segundaDe(this.mes);
      const ultimo = new Date(this.mes.getFullYear(), this.mes.getMonth() + 1, 0);
      const fim = addDays(segundaDe(ultimo), 6);
      const eventos = this.eventos();
      const hojeISO = toISO(hoje());
      const estudo = S().config.dias;

      let html = DIAS.map((d) => `<div class="cal__dh">${d.curto}</div>`).join("");
      for (let d = inicio; d <= fim; d = addDays(d, 1)) {
        const iso = toISO(d);
        const classes = ["cal__day"];
        if (d.getMonth() !== this.mes.getMonth()) classes.push("cal__day--out");
        if (iso === hojeISO) classes.push("cal__day--today");
        else if (estudo.includes(diaSemana(d))) classes.push("cal__day--study");
        const evs = (eventos[iso] || []).map((e) =>
          `<button type="button" class="cal__ev" style="${modStyle(e.modulo)}" data-card="${esc(e.cardId)}" title="${esc(`${e.horas}h · ${e.materia}`)}">${e.horas}h · ${esc(e.materia)}</button>`).join("");
        html += `<div class="${classes.join(" ")}"><span class="cal__num">${d.getDate()}</span>${evs}</div>`;
      }
      $("#cal-grid").innerHTML = html;
    },
  };

  /* =========================================================
     VIEW: Desempenho
     ========================================================= */
  const PerformanceView = {
    acoesDicas: [],

    init() {
      $("#matrix").addEventListener("click", (e) => {
        const dot = e.target.closest("[data-auto]");
        if (dot) {
          const [mod, nivel] = dot.dataset.auto.split(":");
          S().autoavaliacao[mod] = Number(nivel);
          Store.save();
          this.render();
          App.renderBarra();
          return;
        }
        const sim = e.target.closest("[data-sim]");
        if (sim) QuizModal.abrir("simulado", sim.dataset.sim);
      });

      $("#tips").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-tip]");
        if (btn) this.acoesDicas[Number(btn.dataset.tip)]?.();
      });

      $("#note-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const texto = $("#note-text").value.trim();
        if (!texto) return;
        S().notas.unshift({ id: uid("nota"), texto, modulo: $("#note-module").value, criadoEm: toISO(hoje()) });
        Store.save();
        $("#note-text").value = "";
        this.renderNotas();
        Toast.show("Anotação salva");
      });

      $("#notes").addEventListener("click", (e) => {
        const del = e.target.closest("[data-del]");
        if (!del || !confirm("Excluir esta anotação?")) return;
        S().notas = S().notas.filter((n) => n.id !== del.dataset.del);
        Store.save();
        this.renderNotas();
      });
    },

    focarNota(moduloId) {
      Router.ir("desempenho");
      $("#note-module").value = moduloId;
      $("#note-text").focus();
      $("#note-text").scrollIntoView({ behavior: "smooth", block: "center" });
    },

    render() {
      this.renderMatriz();
      this.renderProntidao();
      this.renderDicas();
      this.renderHistorico();
      this.renderNotas();
    },

    renderMatriz() {
      const D = DesempenhoService;
      const linha = (m) => {
        const auto = D.auto(m.id);
        const nota = D.nota(m.id);
        const nivel = D.nivelProvas(m.id);
        const pr = D.prontidao(m.id);
        const dots = [1, 2, 3, 4, 5].map((n) =>
          `<button type="button" class="${n <= auto ? "is-on" : ""}" data-auto="${m.id}:${n}" aria-label="${esc(m.nome)}: autoavaliação ${n} (${NIVEIS[n]})" title="${n} · ${NIVEIS[n]}"></button>`).join("");
        let comp;
        if (nivel === null) comp = `<span class="gap gap--eq">Faça um simulado</span>`;
        else if (auto > nivel) comp = `<span class="gap gap--down">↓ Provas abaixo da sua nota</span>`;
        else if (auto < nivel) comp = `<span class="gap gap--up">↑ Você sabe mais do que acha</span>`;
        else comp = `<span class="gap gap--eq">= Alinhado</span>`;
        const corBarra = pr >= 70 ? "var(--ok)" : pr >= 45 ? "var(--brand-600)" : pr >= 25 ? "var(--warm)" : "var(--hot)";
        return `<tr>
          <td><span class="mod-name">${esc(m.nome)}</span>${m.extra ? ' <span class="tag">Extra</span>' : ""}<span class="mod-desc">${esc(m.desc)}</span></td>
          <td><div class="dots" role="group" aria-label="Autoavaliação de ${esc(m.nome)}">${dots}</div></td>
          <td class="num ${nota === null ? "" : scoreClass(nota)}">${nota ?? "—"}</td>
          <td>${nivel === null ? '<span class="lvl lvl--1">Sem provas</span>' : `<span class="lvl lvl--${nivel}">${nivel} · ${NIVEIS[nivel]}</span>`}</td>
          <td><div class="pbar"><div class="bar"><b style="width:${pr}%;background:${corBarra}"></b></div>${pr}%</div></td>
          <td>${comp}</td>
          <td><button type="button" class="btn btn--light btn--sm" data-sim="${m.id}">Simulado</button></td>
        </tr>`;
      };
      $("#matrix").innerHTML = `
        <thead><tr><th>Módulo</th><th>Autoavaliação</th><th>Nota média</th><th>Nível pelas provas</th><th>Prontidão</th><th>Comparação</th><th></th></tr></thead>
        <tbody>${MODULOS.map(linha).join("")}</tbody>`;
    },

    renderProntidao() {
      const { pct, nivel } = DesempenhoService.geral();
      const c = 2 * Math.PI * 54;
      $("#readiness").innerHTML = `
        <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label="Prontidão geral ${pct}%">
          <circle cx="66" cy="66" r="54" fill="none" stroke="#e2e8f0" stroke-width="14"/>
          <circle cx="66" cy="66" r="54" fill="none" stroke="#2563eb" stroke-width="14" stroke-linecap="round"
            stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct / 100)).toFixed(1)}" transform="rotate(-90 66 66)"/>
          <text x="66" y="64" text-anchor="middle" font-size="28" font-weight="700" fill="#0b1f3a" font-family="Inter, sans-serif">${pct}%</text>
          <text x="66" y="84" text-anchor="middle" font-size="12" fill="#64748b" font-family="Inter, sans-serif">${NIVEIS[nivel]}</text>
        </svg>
        <ol class="scale">${[1, 2, 3, 4, 5].map((n) => `<li class="${n === nivel ? "is-me" : ""}"><b>${n}</b>${NIVEIS[n]}${n === nivel ? " ← você" : ""}</li>`).join("")}</ol>`;
    },

    renderDicas() {
      const dicas = DesempenhoService.dicas();
      this.acoesDicas = dicas.map((d) => d.acao?.run);
      $("#tips").innerHTML = dicas.map((d, i) => `
        <div class="tip"><span class="tip__icon" aria-hidden="true">${d.icone}</span><div>${d.html}
          ${d.acao ? `<br><button type="button" class="tip__action" data-tip="${i}">${esc(d.acao.label)}</button>` : ""}</div></div>`).join("");
    },

    renderHistorico() {
      const ts = [...S().tentativas].reverse();
      $("#history-count").textContent = ts.length ? plural(ts.length, "registro", "registros") : "";
      $("#history").innerHTML = `
        <thead><tr><th>Data</th><th>Tipo</th><th>Módulo</th><th>Acertos</th><th>Nota</th></tr></thead>
        <tbody>${ts.length ? ts.map((t) => `<tr>
          <td>${fmtData(t.data)}</td><td>${TIPOS_PROVA[t.tipo] || esc(t.tipo)}</td><td>${modTag(t.modulo)}</td>
          <td>${t.acertos}/${t.total}</td><td class="num ${scoreClass(t.nota)}">${t.nota}</td></tr>`).join("")
          : `<tr><td colspan="5" class="empty">Nenhuma prova ainda. Comece por um simulado.</td></tr>`}</tbody>`;
    },

    renderNotas() {
      const q = S().config.quadro;
      const notas = S().notas.filter((n) => q === "todos" || n.modulo === q);
      $("#notes-count").textContent = plural(notas.length, "anotação", "anotações");
      $("#notes").innerHTML = notas.length
        ? notas.map((n) => `<li class="note" style="${modStyle(n.modulo)}">${esc(n.texto)}
            <div class="note__meta">${modTag(n.modulo)}<span>${fmtData(n.criadoEm)}</span></div>
            <button type="button" class="note__del" data-del="${esc(n.id)}" aria-label="Excluir anotação">×</button></li>`).join("")
        : `<li class="inbox__empty">Nenhuma anotação ainda. Salve aqui resumos, macetes e explicações dos simulados.</li>`;
    },
  };

  /* =========================================================
     VIEW: Simulado / Prova
     ========================================================= */
  const QuizView = {
    timer: null,

    init() {
      $("#quiz").addEventListener("click", (e) => {
        const opt = e.target.closest("[data-opt]");
        if (opt) { QuizService.responder(Number(opt.dataset.opt)); this.render(); return; }
        const act = e.target.closest("[data-q]");
        if (act) this.acao(act.dataset.q);
      });

      document.addEventListener("keydown", (e) => {
        const s = QuizService.sessao;
        if (Router.atual !== "quiz" || !s || s.resultado || e.target.closest("input, textarea, select, dialog")) return;
        const idx = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 }[e.key.toLowerCase()];
        if (idx !== undefined) {
          const original = s.questoes[s.i].ordem[idx];
          if (original !== undefined) { QuizService.responder(original); this.render(); }
        } else if (e.key === "Enter") {
          $("#quiz [data-q='next']:not(:disabled)")?.click();
        }
      });
    },

    iniciar(tipo, moduloId) {
      if (!QuizService.iniciar(tipo, moduloId)) { Toast.show("Esse módulo ainda não tem questões."); return; }
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 1000);
      Router.ir("quiz");
    },

    tick() {
      const s = QuizService.sessao;
      const el = $("#quiz-timer");
      if (!s || s.resultado || !el) return;
      const seg = Math.floor((Date.now() - s.inicio) / 1000);
      el.textContent = `⏱ ${pad(Math.floor(seg / 60))}:${pad(seg % 60)}`;
    },

    encerrar(perguntar = true) {
      const s = QuizService.sessao;
      if (perguntar && s && !s.resultado && !confirm("Sair agora? As respostas desta tentativa serão descartadas.")) return false;
      clearInterval(this.timer);
      QuizService.sessao = null;
      return true;
    },

    acao(a) {
      const s = QuizService.sessao;
      if (!s) return;
      const ultima = s.i === s.questoes.length - 1;
      if (a === "next") {
        if (ultima) {
          if (s.tipo !== "simulado" && s.respostas.some((r) => r === null) && !confirm("Há questões sem resposta. Finalizar mesmo assim?")) return;
          QuizService.finalizar();
          clearInterval(this.timer);
          App.renderBarra();
        } else QuizService.ir(1);
      } else if (a === "prev") QuizService.ir(-1);
      else if (a === "note") {
        const { q } = s.questoes[s.i];
        S().notas.unshift({ id: uid("nota"), modulo: q.modulo, criadoEm: toISO(hoje()), texto: `${q.pergunta}\n→ ${q.opcoes[q.correta]}\n${q.explicacao}` });
        Store.save();
        Toast.show("Questão salva no bloco de notas");
        return;
      } else if (a === "review") {
        const { q } = s.questoes[s.i];
        this.paraInbox([q]);
        Toast.show("Questão enviada para a Caixa de entrada");
        return;
      } else if (a === "send-wrong") {
        const erradas = s.questoes.filter(({ q }, i) => s.respostas[i] !== q.correta).map(({ q }) => q);
        this.paraInbox(erradas);
        Toast.show(`${plural(erradas.length, "questão enviada", "questões enviadas")} para a Caixa de entrada`);
        const btn = $("#quiz [data-q='send-wrong']");
        if (btn) { btn.disabled = true; btn.textContent = "✓ Enviadas para a Caixa de entrada"; }
        return;
      } else if (a === "retry") { const { tipo, modulo } = s; this.encerrar(false); this.iniciar(tipo, modulo); return; }
      else if (a === "perf") { this.encerrar(false); Router.ir("desempenho"); return; }
      this.render();
    },

    paraInbox(questoes) {
      const agora = toISO(hoje());
      questoes.forEach((q) => S().inbox.unshift({ id: uid("in"), texto: `Revisar: ${q.topico} · ${q.pergunta}`, modulo: q.modulo, origem: "Simulado", criadoEm: agora }));
      Store.save();
      InboxView.render();
    },

    render() {
      const s = QuizService.sessao;
      if (!s) return;
      $("#quiz").innerHTML = s.resultado ? this.htmlResultado(s) : this.htmlQuestao(s);
      this.tick();
    },

    htmlQuestao(s) {
      const { q, ordem } = s.questoes[s.i];
      const resp = s.respostas[s.i];
      const revelar = s.tipo === "simulado" && s.revelada;
      const n = s.questoes.length;
      const ultima = s.i === n - 1;

      const opcoes = ordem.map((orig, k) => {
        const cls = ["opt"];
        if (revelar) {
          if (orig === q.correta) cls.push("is-correct");
          else if (orig === resp) cls.push("is-wrong");
        } else if (orig === resp) cls.push("is-selected");
        return `<button type="button" class="${cls.join(" ")}" data-opt="${orig}" ${revelar ? "disabled" : ""}>
          <span class="opt__key">${"ABCD"[k]}</span><span>${esc(q.opcoes[orig])}</span></button>`;
      }).join("");

      const feedback = revelar
        ? `<div class="feedback ${resp === q.correta ? "feedback--ok" : "feedback--bad"}">
             <b>${resp === q.correta ? "✅ Correto!" : `❌ Não foi dessa vez. Resposta certa: ${esc(q.opcoes[q.correta])}`}</b>${esc(q.explicacao)}${fonteHtml(q)}</div>`
        : "";

      const podeAvancar = s.tipo === "simulado" ? revelar : true;
      const acoes = `
        ${s.tipo !== "simulado" && s.i > 0 ? `<button type="button" class="btn btn--light" data-q="prev">← Anterior</button>` : ""}
        <button type="button" class="btn btn--primary" data-q="next" ${podeAvancar ? "" : "disabled"}>${ultima ? (s.tipo === "simulado" ? "Ver resultado" : "Finalizar prova") : "Próxima questão →"}</button>
        ${revelar ? `<button type="button" class="btn btn--light" data-q="note">🗒️ Salvar no bloco de notas</button>
                     <button type="button" class="btn btn--light" data-q="review">🚩 Revisar depois</button>` : ""}`;

      const mapa = s.questoes.map(({ q: qq }, i) => {
        const r = s.respostas[i];
        let cls = "";
        if (r !== null) cls = s.tipo === "simulado" ? (r === qq.correta ? "is-ok" : "is-bad") : "is-answered";
        if (i === s.i) cls += " is-current";
        return `<span class="${cls}">${i + 1}</span>`;
      }).join("");

      const respondidas = s.respostas.filter((r) => r !== null).length;
      const parcial = s.tipo === "simulado"
        ? (() => {
            const ac = QuizService.acertos();
            return `<div class="kv"><span>Acertos</span><b class="score--good">${ac} de ${respondidas}</b></div>
                    <div class="kv"><span>Nota parcial</span><b>${respondidas ? Math.round((ac / respondidas) * 100) : "—"}</b></div>`;
          })()
        : `<div class="kv"><span>Respondidas</span><b>${respondidas} de ${n}</b></div>
           <p class="muted small" style="margin-top:8px">Na prova, a correção aparece só no final.</p>`;
      const melhor = DesempenhoService.resultados(q.modulo);
      const contexto = s.tipo === "final"
        ? `<div class="kv"><span>Módulos</span><b>${MODULOS.length}</b></div>`
        : `<div class="kv"><span>Sua melhor nota</span><b>${melhor.length ? Math.max(...melhor) : "—"}</b></div>
           <div class="kv"><span>Autoavaliação</span><b>${DesempenhoService.auto(s.modulo)} · ${NIVEIS[DesempenhoService.auto(s.modulo)]}</b></div>`;

      return `
        <div class="panel quiz__main">
          <div class="quiz__head">
            <span>Questão ${s.i + 1} de ${n}</span>${modTag(q.modulo)}<span class="tag">${esc(q.topico)}</span>
            <span class="quiz__timer" id="quiz-timer">⏱ 00:00</span>
          </div>
          <div class="bar quiz__progress"><b style="width:${Math.round(((s.i + 1) / n) * 100)}%"></b></div>
          <h2 class="quiz__q">${esc(q.pergunta)}</h2>
          <div role="group" aria-label="Alternativas">${opcoes}</div>
          ${feedback}
          <div class="quiz__actions">${acoes}</div>
        </div>
        <aside class="panel">
          <h3 class="side-title">Questões</h3>
          <div class="qmap">${mapa}</div>
          <h3 class="side-title">Parcial</h3>
          ${parcial}${contexto}
          <p class="muted small" style="margin-top:12px">Atalhos: teclas 1 a 4 (ou A a D) para responder e Enter para avançar.</p>
        </aside>`;
    },

    htmlResultado(s) {
      const t = s.resultado;
      const min = Math.floor(t.duracao / 60), seg = t.duracao % 60;
      const erradas = s.questoes.map((x, i) => ({ ...x, r: s.respostas[i] })).filter(({ q, r }) => r !== q.correta);
      const porModulo = s.tipo === "final"
        ? `<h3 class="side-title" style="margin-top:18px">Nota por módulo</h3>
           <div class="table-wrap"><table class="table"><thead><tr><th>Módulo</th><th>Acertos</th><th>Nota</th></tr></thead><tbody>
           ${MODULOS.map((m) => {
             const rs = t.respostas.filter((r) => r.modulo === m.id);
             if (!rs.length) return "";
             const ac = rs.filter((r) => r.acertou).length;
             const nota = Math.round((ac / rs.length) * 100);
             return `<tr><td>${modTag(m.id)}</td><td>${ac}/${rs.length}</td><td class="num ${scoreClass(nota)}">${nota}</td></tr>`;
           }).join("")}</tbody></table></div>`
        : "";
      const nivel = s.modulo ? DesempenhoService.nivelProvas(s.modulo) : DesempenhoService.geral().nivel;
      const msg = t.nota >= 70 ? "Ótimo resultado! 🎉" : t.nota >= 45 ? "Bom caminho, vale revisar os pontos abaixo." : "Hora de reforçar esse conteúdo.";

      return `
        <div class="panel quiz__main">
          <h2 class="quiz__q">${TIPOS_PROVA[s.tipo]} concluído${s.tipo === "simulado" ? "" : "a"} · ${esc(s.modulo ? MOD[s.modulo].nome : "Todos os módulos")}</h2>
          <div class="result__score">
            <div class="result__big ${scoreClass(t.nota)}">${t.nota}</div>
            <div><b>${t.acertos} de ${t.total} acertos</b><br><span class="muted">${msg}</span><br>
              <span class="muted small">Tempo: ${min}min ${pad(seg)}s · ${s.modulo ? "Nível pelas provas" : "Prontidão geral"}: ${nivel ? `${nivel} · ${NIVEIS[nivel]}` : "—"}</span></div>
          </div>
          <div class="quiz__actions">
            <button type="button" class="btn btn--primary" data-q="perf">📊 Ver desempenho</button>
            <button type="button" class="btn btn--light" data-q="retry">↻ Refazer</button>
            ${erradas.length ? `<button type="button" class="btn btn--light" data-q="send-wrong">📥 Mandar ${plural(erradas.length, "errada", "erradas")} para a Caixa de entrada</button>` : ""}
          </div>
          ${porModulo}
          <h3 class="side-title" style="margin-top:18px">${erradas.length ? "Questões para revisar" : "Você acertou todas! 🏆"}</h3>
          <div class="result__list">
            ${erradas.map(({ q, r }) => `
              <div class="result__item">
                <p><b>${esc(q.pergunta)}</b></p>
                <p class="bad">Sua resposta: ${r === null ? "sem resposta" : esc(q.opcoes[r])}</p>
                <p class="ok">Resposta certa: ${esc(q.opcoes[q.correta])}</p>
                <p class="muted">${esc(q.explicacao)}</p>${fonteHtml(q)}
              </div>`).join("")}
          </div>
        </div>
        <aside class="panel">
          <h3 class="side-title">Resumo</h3>
          <div class="kv"><span>Tipo</span><b>${TIPOS_PROVA[s.tipo]}</b></div>
          <div class="kv"><span>Nota</span><b class="${scoreClass(t.nota)}">${t.nota}</b></div>
          <div class="kv"><span>Acertos</span><b>${t.acertos}/${t.total}</b></div>
          <div class="kv"><span>Prontidão geral</span><b>${DesempenhoService.geral().pct}%</b></div>
          <p class="muted small" style="margin-top:12px">A nota já foi registrada no painel de Desempenho.</p>
        </aside>`;
    },
  };

  /* =========================================================
     PAINEL: Distribuir horas / Seu Plano Semanal
     ========================================================= */
  const PlanDrawer = {
    ultimoFoco: null,

    init() {
      $("#plan-days").innerHTML = DIAS.map((d) =>
        `<label><input type="checkbox" value="${d.n}" /><span>${d.curto}</span></label>`).join("");
      $("#plan-close").addEventListener("click", () => this.fechar());
      $("#overlay").addEventListener("click", () => this.fechar());
      $$('input[name="plan-week"]').forEach((r) => r.addEventListener("change", () => this.renderResultado(AgendaService.planoDaSemana(this.semana()))));
      $("#plan-hours").addEventListener("input", () => { $("#plan-error").textContent = ""; });

      $("#plan-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const valor = Number($("#plan-hours").value);
        const dias = $$("#plan-days input:checked").map((i) => Number(i.value));
        const erro = $("#plan-error");
        if ($("#plan-hours").value.trim() === "" || !Number.isInteger(valor) || valor < 1 || valor > 168) {
          erro.textContent = "Informe um número inteiro de horas entre 1 e 168."; $("#plan-hours").focus(); return;
        }
        if (!dias.length) { erro.textContent = "Escolha pelo menos um dia de estudo."; return; }
        S().config.dias = dias;
        const r = AgendaService.planejar(valor, dias, this.semana());
        if (r.erro) { erro.textContent = r.erro; return; }
        erro.textContent = "";
        this.renderResultado(r.plano);
        App.render();
        Toast.show("Plano semanal atualizado");
      });
    },

    semana() { return Number($('input[name="plan-week"]:checked').value); },

    abrir() {
      this.ultimoFoco = document.activeElement;
      const plano = AgendaService.planoDaSemana(this.semana());
      $("#plan-hours").value = plano?.horas ?? $("#plan-hours").value;
      $$("#plan-days input").forEach((i) => { i.checked = S().config.dias.includes(Number(i.value)); });
      $("#plan-error").textContent = "";
      this.renderResultado(plano);
      $("#overlay").hidden = false;
      $("#plan-drawer").classList.add("is-open");
      $("#plan-drawer").setAttribute("aria-hidden", "false");
      document.body.classList.add("no-scroll");
      $("#plan-hours").focus();
    },

    fechar() {
      if (!$("#plan-drawer").classList.contains("is-open")) return;
      $("#plan-drawer").classList.remove("is-open");
      $("#plan-drawer").setAttribute("aria-hidden", "true");
      $("#overlay").hidden = true;
      document.body.classList.remove("no-scroll");
      this.ultimoFoco?.focus?.();
    },

    renderResultado(p) {
      const box = $("#plan-result");
      const emAndamento = S().cards.filter((c) => c.status === "doing").length;
      if (!p) {
        box.innerHTML = `<p class="notice notice--info">${emAndamento
          ? `Você tem ${plural(emAndamento, "card", "cards")} em <b>Em Andamento</b>. Informe as horas e os dias para montar o plano.`
          : 'Nenhum card em <b>Em Andamento</b>. Arraste para essa coluna as matérias que vai estudar e depois distribua as horas.'}</p>`;
        return;
      }
      const inicio = parseISO(p.semana);
      const titulo = `Semana de ${inicio.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} a ${addDays(inicio, 6).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;
      const itens = p.itens.map((it, i) => {
        const pct = Math.round((it.alocadas / it.horas) * 100);
        const [txt, cls] = it.faltam === 0
          ? [`✔ ${it.alocadas}h ${it.alocadas === 1 ? "alocada" : "alocadas"}, matéria completa nesta semana`, "full"]
          : it.alocadas > 0
            ? [`${it.alocadas} ${it.alocadas === 1 ? "hora alocada" : "horas alocadas"}, faltam ${plural(it.faltam, "hora", "horas")}`, "partial"]
            : [`Sem horas nesta semana, faltam ${plural(it.faltam, "hora", "horas")}`, "none"];
        const dias = AgendaService.diasDoCard(p, it.cardId).map((d) => `${DIAS[diaSemana(parseISO(d.data)) - 1].curto} ${d.horas}h`).join(" · ");
        return `<div class="plan-item ${it.alocadas === 0 ? "plan-item--skipped" : ""}">
          <div class="plan-item__head"><span class="plan-item__rank">${i + 1}</span><span class="plan-item__title">${esc(it.materia)}</span></div>
          <div class="plan-item__meta">${modTag(it.modulo)}${tempTag(it.temperatura)}</div>
          <span class="plan-item__status status--${cls}">${txt}</span>
          <div class="bar"><b style="width:${pct}%;${it.faltam ? "" : "background:var(--ok)"}"></b></div>
          ${dias ? `<span class="plan-item__days">📅 ${dias}</span>` : ""}
        </div>`;
      }).join("");

      let aviso = "";
      if (!p.itens.length) aviso = `<p class="notice notice--info">Nenhum card estava em Em Andamento quando o plano foi feito.</p>`;
      else if (p.horasLivres > 0) aviso = `<p class="notice notice--ok">🎉 Todas as matérias em andamento cabem na semana e ainda sobram ${plural(p.horasLivres, "hora livre", "horas livres")}!</p>`;
      else if (p.horasPendentes > 0) aviso = `<p class="notice notice--warn">⚠️ Faltam ${plural(p.horasPendentes, "hora", "horas")} para concluir as matérias em andamento. Elas seguem para a próxima semana.</p>`;
      else aviso = `<p class="notice notice--ok">✅ Encaixe perfeito: suas horas cobrem exatamente as matérias em andamento.</p>`;

      box.innerHTML = `
        <h3 class="side-title" style="margin:0">${titulo}</h3>
        <div class="summary">
          <div><span>Alocadas</span><b>${p.totalAlocado}h</b></div>
          <div><span>Livres</span><b>${p.horasLivres}h</b></div>
          <div><span>Pendentes</span><b>${p.horasPendentes}h</b></div>
        </div>
        ${itens}${aviso}`;
    },
  };

  /* =========================================================
     DIÁLOGO: criar / editar card
     ========================================================= */
  const CardModal = {
    editando: null,
    aoSalvar: null,

    init() {
      const dlg = $("#card-modal");
      $("#card-cancel").addEventListener("click", () => dlg.close());
      $("#card-material").addEventListener("click", (e) => {
        const b = e.target.closest("[data-material-sim]");
        if (!b) return;
        dlg.close();
        QuizModal.abrir("simulado", b.dataset.materialSim);
      });
      $("#card-delete").addEventListener("click", () => {
        if (!this.editando || !confirm(`Excluir o card "${this.editando.materia}"?`)) return;
        KanbanService.remover(this.editando.id);
        dlg.close();
        App.render();
        Toast.show("Card excluído");
      });
      $("#card-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const materia = $("#card-title").value.trim();
        const horas = Number($("#card-hours").value);
        if (!materia || !Number.isInteger(horas) || horas < 1) return;
        KanbanService.salvar({
          ...(this.editando ? { id: this.editando.id } : {}),
          materia, horas, modulo: $("#card-module").value, temperatura: $("#card-temp").value, status: $("#card-status").value,
        });
        this.aoSalvar?.();
        dlg.close();
        App.render();
        Toast.show(this.editando ? "Card atualizado" : "Card criado");
      });
    },

    /** Lista os artigos da Central de Ajuda ligados ao card e as questões dele. */
    renderMaterial(card) {
      const box = $("#card-material");
      const base = card && BASE[card.id];
      const artigos = base?.artigos || [];
      const nQuestoes = card ? DATA.questoes.filter((qq) => qq.card === card.id).length : 0;
      if (!card || (!artigos.length && !nQuestoes)) { box.hidden = true; box.innerHTML = ""; return; }
      box.hidden = false;
      box.innerHTML = `
        <div class="material__head">
          <b>📚 Material de estudo</b>
          <span class="muted small">${plural(artigos.length, "artigo", "artigos")} · ${plural(nQuestoes, "questão", "questões")}</span>
          <button type="button" class="btn btn--light btn--sm" data-material-sim="${esc(card.modulo)}">📝 Simulado do módulo</button>
        </div>
        ${base?.referencia ? '<p class="muted small">Card de consulta: estude alguns exemplos e use o resto como referência quando precisar.</p>' : ""}
        ${artigos.length ? `<ol class="material__list">${artigos.map(([t, u]) =>
          `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join("")}</ol>` : ""}`;
    },

    abrir({ card = null, preset = {}, aoSalvar = null } = {}) {
      this.editando = card;
      this.aoSalvar = aoSalvar;
      const q = S().config.quadro;
      const d = card || { materia: "", horas: 2, modulo: q !== "todos" ? q : "crm", temperatura: "warm", status: "todo", ...preset };
      $("#card-modal-title").textContent = card ? "Editar card" : "Novo card";
      $("#card-title").value = d.materia;
      $("#card-hours").value = d.horas;
      $("#card-module").value = d.modulo;
      $("#card-temp").value = d.temperatura;
      $("#card-status").value = d.status;
      $("#card-delete").hidden = !card;
      this.renderMaterial(card);
      $("#card-modal").showModal();
      $("#card-title").focus();
    },
  };

  /* =========================================================
     DIÁLOGO: iniciar simulado / prova
     ========================================================= */
  const QuizModal = {
    init() {
      const dlg = $("#quiz-modal");
      $("#quiz-cancel").addEventListener("click", () => dlg.close());
      $$('input[name="quiz-type"]').forEach((r) => r.addEventListener("change", () => this.atualizar()));
      $("#quiz-module").addEventListener("change", () => this.atualizar());
      $("#quiz-form").addEventListener("submit", (e) => {
        e.preventDefault();
        dlg.close();
        if (QuizService.sessao && !QuizView.encerrar()) return;
        QuizView.iniciar(this.tipo(), $("#quiz-module").value);
      });
    },

    tipo() { return $('input[name="quiz-type"]:checked').value; },

    atualizar() {
      const tipo = this.tipo();
      $("#quiz-module-wrap").hidden = tipo === "final";
      const qtd = tipo === "final"
        ? MODULOS.reduce((n, m) => n + Math.min(QuizService.POR_MODULO_FINAL, QuizService.questoesDo(m.id).length), 0)
        : Math.min(tipo === "prova" ? QuizService.MAX_PROVA : QuizService.MAX_MODULO, QuizService.questoesDo($("#quiz-module").value).length);
      $("#quiz-info").textContent = tipo === "final"
        ? `${qtd} questões, ${QuizService.POR_MODULO_FINAL} de cada módulo. Recomendado para quando terminar os estudos dos módulos.`
        : `${qtd} questões deste módulo, em ordem aleatória.`;
    },

    abrir(tipo = "simulado", moduloId = null) {
      const q = S().config.quadro;
      $(`input[name="quiz-type"][value="${tipo}"]`).checked = true;
      $("#quiz-module").value = moduloId || (q !== "todos" ? q : MODULOS[0].id);
      this.atualizar();
      $("#quiz-modal").showModal();
    },
  };

  /* =========================================================
     MENU: Mudar de quadros
     ========================================================= */
  const Switcher = {
    init() {
      const btn = $("#btn-boards");
      $("#switcher-list").addEventListener("click", (e) => {
        const it = e.target.closest("[data-board]");
        if (!it) return;
        Router.trocarQuadro(it.dataset.board);
        this.fechar();
        if (Router.atual === "quiz") return;
        Toast.show(`Quadro: ${it.dataset.board === "todos" ? "Visão Geral" : MOD[it.dataset.board].nome}`);
      });
      document.addEventListener("click", (e) => {
        if ($("#switcher").hidden) return;
        if (!e.target.closest("#switcher") && !e.target.closest("#btn-boards")) this.fechar();
      });
      btn.addEventListener("click", () => ($("#switcher").hidden ? this.abrir() : this.fechar()));
    },

    abrir() {
      const q = S().config.quadro;
      const cont = (id) => S().cards.filter((c) => id === "todos" || c.modulo === id).length;
      const item = (id, nome, fundo) => `
        <button type="button" role="menuitem" class="switcher__item ${q === id ? "is-active" : ""}" data-board="${id}">
          <span class="switcher__swatch" style="background:linear-gradient(135deg,${fundo[0]},${fundo[1]})"></span>
          ${esc(nome)}<small>${plural(cont(id), "card", "cards")}</small></button>`;
      $("#switcher-list").innerHTML =
        item("todos", "Visão Geral", ["#0b1f3a", "#1a4480"]) +
        `<p class="switcher__sep">Módulos</p>` + MODULOS.filter((m) => !m.extra).map((m) => item(m.id, m.nome, m.fundo)).join("") +
        `<p class="switcher__sep">Extras</p>` + MODULOS.filter((m) => m.extra).map((m) => item(m.id, m.nome, m.fundo)).join("");
      $("#switcher").hidden = false;
      $("#btn-boards").setAttribute("aria-expanded", "true");
      $(".switcher__item.is-active")?.focus();
    },

    fechar() {
      $("#switcher").hidden = true;
      $("#btn-boards").setAttribute("aria-expanded", "false");
    },
  };

  /* =========================================================
     ROUTER: troca de telas
     ========================================================= */
  const Router = {
    atual: "quadro",
    VIEWS: ["quadro", "planejador", "desempenho", "quiz"],

    ir(view) {
      if (!this.VIEWS.includes(view)) view = "quadro";
      if (view === "quiz" && !QuizService.sessao) view = "quadro";
      if (this.atual === "quiz" && view !== "quiz" && QuizService.sessao && !QuizService.sessao.resultado) {
        if (!QuizView.encerrar()) { history.replaceState(null, "", "#quiz"); return; }
      } else if (this.atual === "quiz" && view !== "quiz") {
        QuizView.encerrar(false);
      }
      this.atual = view;
      $$(".view").forEach((v) => { v.hidden = v.dataset.view !== view; });
      if (location.hash !== `#${view}`) history.replaceState(null, "", `#${view}`);
      App.render();
      window.scrollTo({ top: 0 });
    },

    trocarQuadro(id) {
      S().config.quadro = id === "todos" || MOD[id] ? id : "todos";
      Store.save();
      App.render();
    },
  };

  /* =========================================================
     APP: composição e barra do quadro
     ========================================================= */
  const App = {
    init() {
      Store.load();
      // No celular a Caixa de entrada é um painel sobreposto: começa fechada.
      if (window.matchMedia("(max-width: 900px)").matches) S().config.inboxAberta = false;

      const opcoes = MODULOS.map((m) => `<option value="${m.id}">${esc(m.nome)}</option>`).join("");
      ["#inbox-module", "#note-module", "#card-module", "#quiz-module"].forEach((s) => { $(s).innerHTML = opcoes; });

      BoardView.init();
      InboxView.init();
      PlannerView.init();
      PerformanceView.init();
      QuizView.init();
      PlanDrawer.init();
      CardModal.init();
      QuizModal.init();
      Switcher.init();

      $(".dock").addEventListener("click", (e) => {
        const b = e.target.closest("[data-nav]");
        if (!b || b.dataset.nav === "boards") return;
        if (b.dataset.nav === "inbox") {
          if (Router.atual !== "quadro") { S().config.inboxAberta = true; Store.save(); Router.ir("quadro"); }
          else InboxView.alternar();
          return;
        }
        Router.ir(b.dataset.nav);
      });

      $("#view-actions").addEventListener("click", (e) => {
        const a = e.target.closest("[data-action]")?.dataset.action;
        if (a === "plan") PlanDrawer.abrir();
        else if (a === "simulado") QuizModal.abrir("simulado");
        else if (a === "final") QuizModal.abrir("final");
        else if (a === "sair-quiz" && QuizView.encerrar()) Router.ir("desempenho");
      });

      $("#btn-create").addEventListener("click", () => CardModal.abrir());
      $("#search").addEventListener("input", (e) => {
        KanbanService.busca = e.target.value.trim();
        if (Router.atual !== "quadro") Router.ir("quadro"); else BoardView.render();
      });
      $("#btn-reset").addEventListener("click", () => {
        if (!confirm("Restaurar todos os dados iniciais? Cards, notas, provas e planos serão apagados.")) return;
        QuizView.encerrar(false);
        Store.reset();
        Router.ir("quadro");
        Toast.show("Dados restaurados");
      });

      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (!$("#switcher").hidden) Switcher.fechar();
        PlanDrawer.fechar();
      });
      window.addEventListener("hashchange", () => {
        const v = location.hash.slice(1);
        if (v !== Router.atual) Router.ir(v);
      });

      Router.ir(location.hash.slice(1) || "quadro");
    },

    renderBarra() {
      const q = S().config.quadro;
      const m = MOD[q];
      const nomeQuadro = m ? m.nome : "Visão Geral";
      const fundo = m ? m.fundo : ["#0b1f3a", "#1a4480"];
      document.documentElement.style.setProperty("--bg-a", fundo[0]);
      document.documentElement.style.setProperty("--bg-b", fundo[1]);

      const chip = (t) => `<span class="chip">${esc(t)}</span>`;
      let titulo, chips = [], acoes = "";
      const cardsQuadro = S().cards.filter((c) => !m || c.modulo === q);

      if (Router.atual === "quadro") {
        titulo = nomeQuadro;
        chips = [m ? m.desc : "Todos os módulos", `${plural(cardsQuadro.length, "matéria", "matérias")} · ${cardsQuadro.reduce((s, c) => s + c.horas, 0)}h`];
        acoes = `<button type="button" class="btn btn--ghost" data-action="plan">⚡ Distribuir horas</button>
                 <button type="button" class="btn btn--ghost" data-action="simulado">📝 Simulado${m ? " do módulo" : ""}</button>`;
      } else if (Router.atual === "planejador") {
        const p = AgendaService.planoDaSemana(0);
        titulo = "Planejador";
        chips = [nomeQuadro, p ? `Esta semana: ${p.totalAlocado}h de ${p.horas}h` : "Semana sem plano"];
        acoes = `<button type="button" class="btn btn--ghost" data-action="plan">⚡ Distribuir horas</button>`;
      } else if (Router.atual === "desempenho") {
        const g = DesempenhoService.geral();
        titulo = "Desempenho";
        chips = [`Prontidão geral: ${g.pct}%`, `Nível ${g.nivel} · ${NIVEIS[g.nivel]}`, plural(S().tentativas.length, "prova ou simulado", "provas e simulados")];
        acoes = `<button type="button" class="btn btn--ghost" data-action="simulado">📝 Simulado / prova do módulo</button>
                 <button type="button" class="btn btn--ghost" data-action="final">🏁 Prova final</button>`;
      } else {
        const s = QuizService.sessao;
        titulo = `${TIPOS_PROVA[s.tipo]} · ${s.modulo ? MOD[s.modulo].nome : "Todos os módulos"}`;
        chips = [plural(s.questoes.length, "questão", "questões"), s.tipo === "simulado" ? "Correção na hora" : "Correção no final"];
        acoes = s.resultado ? "" : `<button type="button" class="btn btn--ghost" data-action="sair-quiz">Encerrar</button>`;
      }

      $("#view-title").textContent = titulo;
      $("#view-chips").innerHTML = chips.map(chip).join("");
      $("#view-actions").innerHTML = acoes;
      document.title = `${titulo} · ERP Study Scheduler`;

      $$(".dock__btn").forEach((b) => {
        const nav = b.dataset.nav;
        const ativo = nav === Router.atual || (nav === "desempenho" && Router.atual === "quiz") || (nav === "inbox" && Router.atual === "quadro" && S().config.inboxAberta);
        b.classList.toggle("is-active", ativo);
        if (nav !== "boards" && nav !== "inbox") b.setAttribute("aria-current", nav === Router.atual ? "page" : "false");
      });
    },

    render() {
      this.renderBarra();
      InboxView.render();
      if (Router.atual === "quadro") BoardView.render();
      else if (Router.atual === "planejador") PlannerView.render();
      else if (Router.atual === "desempenho") PerformanceView.render();
      else if (Router.atual === "quiz") QuizView.render();
    },
  };

  document.addEventListener("DOMContentLoaded", () => App.init());
})();
