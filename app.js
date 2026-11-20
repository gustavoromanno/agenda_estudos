/* =========================================================
   ERP Study Scheduler (Kanban & CRM) — Vanilla JS
   Arquitetura espelhando a versão Java:
     Enums  -> Temperatura / FaseKanban
     Repository -> KnowledgeRepository (mock da base)
     Services   -> KanbanService, AgendaService (Greedy)
     UI         -> BoardView, PlanView
   ========================================================= */
(() => {
  "use strict";

  /* ---------- ENUMS (domínios fechados) ---------- */
  const Temperatura = Object.freeze({
    QUENTE: Object.freeze({ key: "hot", label: "Quente", nivel: "Alta", peso: 3 }),
    MORNA: Object.freeze({ key: "warm", label: "Morna", nivel: "Média", peso: 2 }),
    FRIA: Object.freeze({ key: "cold", label: "Fria", nivel: "Baixa", peso: 1 }),
  });

  const FaseKanban = Object.freeze({
    A_FAZER: "todo",
    EM_ANDAMENTO: "doing",
    CONCLUIDO: "done",
  });

  const ORDEM_FASES = [FaseKanban.A_FAZER, FaseKanban.EM_ANDAMENTO, FaseKanban.CONCLUIDO];
  const TITULO_FASE = { todo: "A Fazer", doing: "Em Andamento", done: "Concluído" };

  const temperaturaPorChave = (key) =>
    Object.values(Temperatura).find((t) => t.key === key) || Temperatura.FRIA;

  /* ---------- REPOSITÓRIO (mock da base de conhecimento) ---------- */
  const KnowledgeRepository = {
    buscarTodosOsEstudos() {
      return [
        { id: "vendas-cfop", materia: "Regras de Emissão e CFOP de Venda", modulo: "Vendas", horas: 4, temperatura: "hot" },
        { id: "vendas-sefaz", materia: "Ajuste de Impostos e Rejeições SEFAZ", modulo: "Vendas", horas: 5, temperatura: "hot" },
        { id: "estoque-cmc", materia: "Cálculo de Custo Médio (CMC)", modulo: "Estoque", horas: 6, temperatura: "hot" },
        { id: "estoque-op", materia: "Gestão de Ordens de Produção (OP)", modulo: "Estoque", horas: 5, temperatura: "warm" },
        { id: "financas-conciliacao", materia: "Conciliação Bancária e Extrato", modulo: "Finanças", horas: 4, temperatura: "warm" },
        { id: "financas-dre", materia: "Baixa em Lote e DRE", modulo: "Finanças", horas: 3, temperatura: "cold" },
        { id: "ia-rotinas", materia: "Criação de Rotinas e Gatilhos", modulo: "Agentes de IA", horas: 5, temperatura: "hot" },
        { id: "ia-permissoes", materia: "Permissões de Acesso aos Agentes", modulo: "Agentes de IA", horas: 2, temperatura: "cold" },
      ].map((card) => ({ ...card, status: FaseKanban.A_FAZER })); // todos nascem em "A Fazer"
    },
  };

  /* ---------- PERSISTÊNCIA (localStorage com fallback seguro) ---------- */
  const Storage = {
    KEY: "erp-study-scheduler:v1",

    load() {
      try {
        const raw = localStorage.getItem(this.KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null; // modo privado / storage bloqueado
      }
    },

    save(cards) {
      try {
        localStorage.setItem(this.KEY, JSON.stringify(cards));
      } catch {
        /* sem persistência disponível: a aplicação segue funcionando em memória */
      }
    },

    clear() {
      try {
        localStorage.removeItem(this.KEY);
      } catch {
        /* ignore */
      }
    },
  };

  /* ---------- SERVIÇO: Quadro Kanban ---------- */
  const KanbanService = {
    cards: [],

    init() {
      const salvo = Storage.load();
      const base = KnowledgeRepository.buscarTodosOsEstudos();
      this.cards = this._mesclar(base, salvo);
      this.persistir();
    },

    // Mantém a ordem/status salvos, mas garante que os dados vêm da base (e ignora lixo no storage).
    _mesclar(base, salvo) {
      if (!Array.isArray(salvo)) return base;
      const porId = new Map(base.map((c) => [c.id, c]));
      const resultado = [];
      salvo.forEach((s) => {
        const original = s && porId.get(s.id);
        if (!original) return;
        const status = ORDEM_FASES.includes(s.status) ? s.status : FaseKanban.A_FAZER;
        resultado.push({ ...original, status });
        porId.delete(s.id);
      });
      return resultado.concat([...porId.values()]); // cards novos na base entram no fim
    },

    persistir() {
      Storage.save(this.cards.map(({ id, status }) => ({ id, status })));
    },

    getCardsNaFase(fase) {
      return this.cards.filter((c) => c.status === fase);
    },

    buscar(id) {
      return this.cards.find((c) => c.id === id);
    },

    // Move o card para a fase e o posiciona antes de `antesDeId` (ou no fim da fase).
    moverCard(id, novaFase, antesDeId = null) {
      const idx = this.cards.findIndex((c) => c.id === id);
      if (idx === -1 || !ORDEM_FASES.includes(novaFase)) return false;

      const [card] = this.cards.splice(idx, 1);
      card.status = novaFase;

      let destino = antesDeId ? this.cards.findIndex((c) => c.id === antesDeId) : -1;
      if (destino === -1) {
        // Insere logo após o último card da fase de destino (mantendo agrupamento estável)
        const ultimos = this.cards.map((c, i) => (c.status === novaFase ? i : -1)).filter((i) => i >= 0);
        destino = ultimos.length ? ultimos[ultimos.length - 1] + 1 : this.cards.length;
      }
      this.cards.splice(destino, 0, card);
      this.persistir();
      return true;
    },

    resetar() {
      Storage.clear();
      this.cards = KnowledgeRepository.buscarTodosOsEstudos();
      this.persistir();
    },
  };

  /* ---------- SERVIÇO: Agenda Inteligente (Greedy Algorithm) ---------- */
  const AgendaService = {
    /**
     * Distribui as horas semanais entre os cards, priorizando a temperatura.
     * Estratégia gulosa: ordena por peso (Quente > Morna > Fria) e, a cada passo,
     * aloca o máximo possível no card mais prioritário: min(horasCard, horasRestantes).
     * A ordenação é estável, então empates respeitam a ordem do quadro.
     */
    distribuirHoras(cardsEmAndamento, horasSemanais) {
      const ordenados = [...cardsEmAndamento].sort(
        (a, b) => temperaturaPorChave(b.temperatura).peso - temperaturaPorChave(a.temperatura).peso
      );

      let restantes = horasSemanais;
      const itens = ordenados.map((card) => {
        const alocadas = Math.min(card.horas, Math.max(restantes, 0));
        restantes -= alocadas;
        return { card, alocadas, faltam: card.horas - alocadas };
      });

      const totalNecessario = cardsEmAndamento.reduce((s, c) => s + c.horas, 0);
      return {
        horasSemanais,
        itens,
        totalNecessario,
        totalAlocado: horasSemanais - restantes,
        horasLivres: restantes,
        horasPendentes: itens.reduce((s, i) => s + i.faltam, 0),
      };
    },
  };

  /* ---------- UTILITÁRIOS DE UI ---------- */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const slug = (txt) =>
    txt.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  const Toast = {
    el: null,
    timer: null,
    show(msg) {
      this.el ??= $("#toast");
      this.el.textContent = msg;
      this.el.classList.add("is-visible");
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.el.classList.remove("is-visible"), 2400);
    },
  };

  /* ---------- VIEW: Quadro Kanban + Drag and Drop ---------- */
  const BoardView = {
    template: null,
    draggingId: null,

    init() {
      this.template = $("#card-template");
      this._bindDropzones();
      this._bindCardEvents();
      this.render();
    },

    render() {
      ORDEM_FASES.forEach((fase) => {
        const zona = $(`[data-dropzone="${fase}"]`);
        const cards = KanbanService.getCardsNaFase(fase);
        zona.replaceChildren(...cards.map((c) => this._criarCard(c)));
        if (!cards.length) zona.append(this._criarVazio(fase));
        $(`[data-count="${fase}"]`).textContent = cards.length;
      });
      this._renderStats();
    },

    _criarCard(card) {
      const temp = temperaturaPorChave(card.temperatura);
      const el = this.template.content.firstElementChild.cloneNode(true);
      el.dataset.id = card.id;
      el.dataset.status = card.status;
      el.dataset.priority = temp.key;
      el.setAttribute(
        "aria-label",
        `${card.materia}. Módulo ${card.modulo}. ${card.horas} horas. Prioridade ${temp.nivel}. Coluna ${TITULO_FASE[card.status]}.`
      );

      const modulo = $(".card__module", el);
      modulo.textContent = card.modulo;
      modulo.dataset.module = slug(card.modulo);

      const prioridade = $(".card__priority", el);
      prioridade.textContent = `${temp.nivel} · ${temp.label}`;
      prioridade.classList.add(`badge--${temp.key}`);

      $(".card__title", el).textContent = card.materia;
      $(".card__hours", el).textContent = `⏱ ${card.horas}h necessárias`;

      const pos = ORDEM_FASES.indexOf(card.status);
      $('.card__move[data-dir="-1"]', el).disabled = pos === 0;
      $('.card__move[data-dir="1"]', el).disabled = pos === ORDEM_FASES.length - 1;
      return el;
    },

    _criarVazio(fase) {
      const p = document.createElement("p");
      p.className = "column__empty";
      p.textContent = fase === FaseKanban.EM_ANDAMENTO
        ? "Arraste para cá as matérias que vai estudar esta semana."
        : "Solte um card aqui.";
      return p;
    },

    _renderStats() {
      const total = KanbanService.cards.length;
      const soma = (fase) => KanbanService.getCardsNaFase(fase).reduce((s, c) => s + c.horas, 0);
      const horasTotais = KanbanService.cards.reduce((s, c) => s + c.horas, 0);
      const concluidas = soma(FaseKanban.CONCLUIDO);
      const pct = horasTotais ? Math.round((concluidas / horasTotais) * 100) : 0;

      $("#stat-total").textContent = total;
      $("#stat-doing-hours").textContent = `${soma(FaseKanban.EM_ANDAMENTO)}h`;
      $("#stat-done-hours").textContent = `${concluidas}h`;
      $("#stat-progress").textContent = `${pct}%`;
      $("#stat-progress-bar").style.width = `${pct}%`;
    },

    // Delegação de eventos: um único listener por tipo cobre todos os cards (inclusive re-renderizados).
    _bindCardEvents() {
      const board = $(".board");

      board.addEventListener("dragstart", (e) => {
        const card = e.target.closest(".card");
        if (!card) return;
        this.draggingId = card.dataset.id;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", card.dataset.id);
        requestAnimationFrame(() => card.classList.add("is-dragging"));
      });

      board.addEventListener("dragend", (e) => {
        e.target.closest(".card")?.classList.remove("is-dragging");
        $$(".column__body.is-over").forEach((z) => z.classList.remove("is-over"));
        this.draggingId = null;
      });

      // Fallback acessível (teclado / touch): botões ◀ ▶
      board.addEventListener("click", (e) => {
        const btn = e.target.closest(".card__move");
        if (!btn) return;
        this._moverRelativo(btn.closest(".card").dataset.id, Number(btn.dataset.dir), true);
      });

      // Teclado: setas esquerda/direita no card focado
      board.addEventListener("keydown", (e) => {
        const card = e.target.closest(".card");
        if (!card || e.target !== card) return;
        if (e.key === "ArrowLeft") this._moverRelativo(card.dataset.id, -1, true);
        if (e.key === "ArrowRight") this._moverRelativo(card.dataset.id, 1, true);
      });
    },

    _moverRelativo(id, direcao, manterFoco) {
      const card = KanbanService.buscar(id);
      if (!card) return;
      const destino = ORDEM_FASES[ORDEM_FASES.indexOf(card.status) + direcao];
      if (!destino) return;
      this._mover(id, destino, null);
      if (manterFoco) $(`.card[data-id="${id}"]`)?.focus();
    },

    _mover(id, fase, antesDeId) {
      const card = KanbanService.buscar(id);
      const faseAnterior = card?.status;
      if (!KanbanService.moverCard(id, fase, antesDeId)) return;
      this.render();
      if (faseAnterior !== fase) Toast.show(`"${card.materia}" → ${TITULO_FASE[fase]}`);
    },

    _bindDropzones() {
      $$("[data-dropzone]").forEach((zona) => {
        zona.addEventListener("dragover", (e) => {
          if (!this.draggingId) return;
          e.preventDefault(); // necessário para permitir o drop
          e.dataTransfer.dropEffect = "move";
          zona.classList.add("is-over");
        });

        zona.addEventListener("dragleave", (e) => {
          if (!zona.contains(e.relatedTarget)) zona.classList.remove("is-over");
        });

        zona.addEventListener("drop", (e) => {
          e.preventDefault();
          zona.classList.remove("is-over");
          const id = e.dataTransfer.getData("text/plain") || this.draggingId;
          if (!id) return;
          const antes = this._cardAbaixoDoCursor(zona, e.clientY, id);
          this._mover(id, zona.dataset.dropzone, antes?.dataset.id ?? null);
        });
      });
    },

    // Encontra o card cujo centro está logo abaixo do cursor (para reordenar dentro da coluna).
    _cardAbaixoDoCursor(zona, y, idArrastado) {
      return $$(".card", zona)
        .filter((c) => c.dataset.id !== idArrastado)
        .reduce(
          (maisProximo, el) => {
            const box = el.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            return offset < 0 && offset > maisProximo.offset ? { offset, el } : maisProximo;
          },
          { offset: Number.NEGATIVE_INFINITY, el: null }
        ).el;
    },
  };

  /* ---------- VIEW: Seu Plano Semanal ---------- */
  const PlanView = {
    drawer: null,
    overlay: null,
    ultimoFoco: null,

    init() {
      this.drawer = $("#plan-drawer");
      this.overlay = $("#plan-overlay");
      $("#plan-close").addEventListener("click", () => this.fechar());
      this.overlay.addEventListener("click", () => this.fechar());
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.drawer.classList.contains("is-open")) this.fechar();
      });
    },

    abrir(resultado) {
      this._render(resultado);
      this.ultimoFoco = document.activeElement;
      this.overlay.hidden = false;
      this.drawer.classList.add("is-open");
      this.drawer.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      $("#plan-close").focus();
    },

    fechar() {
      this.drawer.classList.remove("is-open");
      this.drawer.setAttribute("aria-hidden", "true");
      this.overlay.hidden = true;
      document.body.style.overflow = "";
      this.ultimoFoco?.focus?.();
    },

    _render(r) {
      $("#plan-subtitle").textContent =
        `${plural(r.horasSemanais, "hora disponível", "horas disponíveis")} · ` +
        `${plural(r.itens.length, "matéria em andamento", "matérias em andamento")}`;

      $("#plan-summary").innerHTML = "";
      [
        ["Alocadas", `${r.totalAlocado}h`],
        ["Livres", `${r.horasLivres}h`],
        ["Pendentes", `${r.horasPendentes}h`],
      ].forEach(([label, valor]) => {
        const item = document.createElement("div");
        item.className = "summary__item";
        item.innerHTML = `<span class="summary__label"></span><span class="summary__value"></span>`;
        item.children[0].textContent = label;
        item.children[1].textContent = valor;
        $("#plan-summary").append(item);
      });

      const lista = $("#plan-list");
      lista.replaceChildren();

      if (!r.itens.length) {
        const vazio = document.createElement("li");
        vazio.className = "plan-empty";
        vazio.textContent =
          'Nenhum card em "Em Andamento". Arraste as matérias que deseja estudar para essa coluna e distribua novamente.';
        lista.append(vazio);
      }

      r.itens.forEach((item, i) => lista.append(this._criarItem(item, i + 1)));

      const footer = $("#plan-footer");
      footer.className = "drawer__footer";
      footer.textContent = "";
      if (!r.itens.length) return;

      if (r.horasLivres > 0) {
        footer.classList.add("drawer__footer--success");
        footer.textContent = `🎉 Todas as matérias em andamento cabem na semana e ainda sobram ${plural(r.horasLivres, "hora livre", "horas livres")}!`;
      } else if (r.horasPendentes > 0) {
        footer.classList.add("drawer__footer--warning");
        footer.textContent = `⚠️ Faltam ${plural(r.horasPendentes, "hora", "horas")} para concluir todas as matérias em andamento. Elas seguem para a próxima semana.`;
      } else {
        footer.classList.add("drawer__footer--success");
        footer.textContent = "✅ Encaixe perfeito: suas horas cobrem exatamente as matérias em andamento.";
      }
    },

    _criarItem({ card, alocadas, faltam }, rank) {
      const temp = temperaturaPorChave(card.temperatura);
      const li = document.createElement("li");
      li.className = "plan-item" + (alocadas === 0 ? " plan-item--skipped" : "");

      let statusTexto, statusClasse;
      if (faltam === 0) {
        statusTexto = `✔ ${alocadas}h alocadas — matéria completa nesta semana`;
        statusClasse = "full";
      } else if (alocadas > 0) {
        statusTexto = `${alocadas} ${alocadas === 1 ? "hora alocada" : "horas alocadas"}, faltam ${plural(faltam, "hora", "horas")}`;
        statusClasse = "partial";
      } else {
        statusTexto = `Sem horas nesta semana — faltam ${plural(faltam, "hora", "horas")}`;
        statusClasse = "none";
      }

      const pct = Math.round((alocadas / card.horas) * 100);
      li.innerHTML = `
        <div class="plan-item__head">
          <span class="plan-item__rank"></span>
          <span class="plan-item__title"></span>
        </div>
        <div class="plan-item__meta">
          <span class="card__module"></span>
          <span class="badge badge--${temp.key}"></span>
        </div>
        <span class="plan-item__status plan-item__status--${statusClasse}"></span>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
          <span class="progress__bar" style="width:${pct}%"></span>
        </div>`;

      // textContent para dados (evita injeção de HTML)
      $(".plan-item__rank", li).textContent = rank;
      $(".plan-item__title", li).textContent = card.materia;
      const modulo = $(".card__module", li);
      modulo.textContent = card.modulo;
      modulo.dataset.module = slug(card.modulo);
      $(".badge", li).textContent = `${temp.nivel} · ${temp.label}`;
      $(".plan-item__status", li).textContent = statusTexto;
      return li;
    },
  };

  /* ---------- CONTROLLER: formulário da agenda ---------- */
  const SchedulerController = {
    init() {
      const form = $("#scheduler-form");
      const input = $("#input-hours");
      const erro = $("#hours-error");

      input.addEventListener("input", () => {
        input.classList.remove("is-invalid");
        erro.textContent = "";
      });

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const valor = Number(input.value);

        if (input.value.trim() === "" || !Number.isInteger(valor) || valor < 1 || valor > 168) {
          input.classList.add("is-invalid");
          erro.textContent = "Informe um número inteiro de horas entre 1 e 168.";
          input.focus();
          return;
        }

        const emAndamento = KanbanService.getCardsNaFase(FaseKanban.EM_ANDAMENTO);
        PlanView.abrir(AgendaService.distribuirHoras(emAndamento, valor));
      });
    },
  };

  /* ---------- BOOTSTRAP ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    KanbanService.init();
    BoardView.init();
    PlanView.init();
    SchedulerController.init();

    $("#btn-reset").addEventListener("click", () => {
      if (!confirm("Restaurar o quadro para o estado inicial? Todas as posições serão perdidas.")) return;
      KanbanService.resetar();
      BoardView.render();
      Toast.show("Quadro restaurado: todas as matérias voltaram para A Fazer.");
    });
  });
})();
