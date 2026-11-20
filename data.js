/* =========================================================
   ERP Study Scheduler — Base de conhecimento
   Junta os módulos, os cards (conteudo.js, gerado a partir da
   Central de Ajuda) e as questões (questoes.js).
   ========================================================= */
window.ERP_DATA = (() => {
  "use strict";

  /* ---------- MÓDULOS (quadros) ---------- */
  const modulos = [
    { id: "crm", nome: "CRM", desc: "Contas, contatos, oportunidades e configurações", cor: "#1a67bf", tagBg: "#dbe8f8", tagFg: "#1a5fb0", fundo: ["#0a2a52", "#1a67bf"] },
    { id: "vendas", nome: "Vendas e NF-e", desc: "Pedidos, impostos, NF-e, remessas e rejeições", cor: "#ff9c24", tagBg: "#fff1df", tagFg: "#b35f00", fundo: ["#5a2e00", "#e08410"] },
    { id: "servicos", nome: "Serviços e NFS-e", desc: "Faturamento de notas de serviço eletrônicas integradas com a prefeitura", cor: "#00bfb7", tagBg: "#d6f7f5", tagFg: "#00807a", fundo: ["#00403d", "#009f98"] },
    { id: "compras", nome: "Compras, Estoque e Produção", desc: "Compras, recebimento, estoque, CMC e produção", cor: "#fe5b4a", tagBg: "#ffe3e0", tagFg: "#c4372a", fundo: ["#5c1710", "#e04a3a"] },
    { id: "financas", nome: "Finanças", desc: "Contas a pagar e receber, conciliação, boletos e integrações", cor: "#6ec400", tagBg: "#ecf8d9", tagFg: "#4a8700", fundo: ["#213d00", "#5aa300"] },
    { id: "geral", nome: "Geral", desc: "Portal Omie, MFA, lentidão/desconexão", cor: "#64748b", tagBg: "#e2e8f0", tagFg: "#334155", fundo: ["#0f172a", "#475569"] },
    { id: "agentes", nome: "Agentes de IA", desc: "Rotinas, gatilhos e permissões", cor: "#f5d000", tagBg: "#fdf6cc", tagFg: "#7a6600", fundo: ["#3d3400", "#b39800"], extra: true },
    { id: "contador", nome: "Painel do Contador", desc: "Integração contábil e fiscal, arquivos e fechamento", cor: "#00b1e7", tagBg: "#d9f4fc", tagFg: "#007ea6", fundo: ["#003a4d", "#0095c4"], extra: true },
    { id: "config", nome: "Configuração Geral do ERP", desc: "Empresa, usuários, certificado e parâmetros", cor: "#7c3aed", tagBg: "#ede9fe", tagFg: "#6d28d9", fundo: ["#1e0b4a", "#6d28d9"], extra: true },
    { id: "reforma", nome: "Reforma Tributária", desc: "IBS, CBS, cronogramas e cálculos", cor: "#c026d3", tagBg: "#fae8ff", tagFg: "#a21caf", fundo: ["#3b0a40", "#a21caf"], extra: true },
  ];

  /* ---------- CARDS ----------
     Os módulos com material da Central de Ajuda vêm de conteudo.js.
     Geral, Agentes de IA e Configuração ainda não têm material: cards manuais. */
  const manuais = [
    { id: "ia-rotinas", materia: "Criação de Rotinas e Gatilhos", modulo: "agentes", horas: 5, temperatura: "hot" },
    { id: "ia-permissoes", materia: "Permissões de Acesso aos Agentes", modulo: "agentes", horas: 2, temperatura: "cold" },
    { id: "geral-acesso", materia: "Acesso ao Portal, MFA e Lentidão", modulo: "geral", horas: 2, temperatura: "warm" },
    { id: "config-empresa", materia: "Cadastro da Empresa e Parâmetros Gerais", modulo: "config", horas: 3, temperatura: "warm" },
  ];
  const conteudo = (window.ERP_CONTEUDO && window.ERP_CONTEUDO.cards) || [];
  const cards = [...conteudo, ...manuais];

  /* ---------- CAIXA DE ENTRADA INICIAL ---------- */
  const inbox = [
    { id: "in-rateio", texto: "Rateio de despesas por centro de custo", modulo: "financas", origem: "Exemplo" },
    { id: "in-devolucao", texto: "Devolução de venda e NF de entrada", modulo: "vendas", origem: "Exemplo" },
  ];

  /* ---------- QUESTÕES ----------
     As de questoes.js vêm dos artigos. Abaixo, questões gerais para os
     módulos que ainda não têm material (substitua quando houver). */
  const q = (id, modulo, card, topico, pergunta, opcoes, explicacao) =>
    ({ id, modulo, card, topico, pergunta, opcoes, correta: 0, explicacao, fonte: "" });

  const gerais = [
    /* ===== GERAL ===== */
    q("ger-1", "geral", "geral-acesso", "MFA", "O que é MFA?",
      ["Autenticação em múltiplos fatores: além da senha, é exigido um segundo fator, como o código de um app autenticador",
       "Um tipo de nota fiscal", "Um relatório financeiro mensal", "Uma forma de backup automático"],
      "O MFA protege a conta mesmo que a senha vaze, pois o invasor também precisaria do segundo fator."),
    q("ger-2", "geral", "geral-acesso", "MFA", "O usuário digita o código do app autenticador corretamente, mas ele é recusado. Qual é uma causa comum?",
      ["O relógio do celular está fora de sincronia (os códigos dependem da hora exata)",
       "A senha do e-mail expirou", "O certificado digital venceu", "O navegador está em modo escuro"],
      "Os códigos temporários (TOTP) mudam a cada ~30 segundos e dependem da hora. Ajustar a hora automática do celular costuma resolver."),
    q("ger-3", "geral", "geral-acesso", "Lentidão", "Um usuário relata lentidão no sistema. Qual é um bom primeiro passo de diagnóstico?",
      ["Verificar se o problema é geral ou só dele (outra rede, outro navegador, cache, extensões)",
       "Reinstalar o sistema operacional imediatamente", "Excluir o usuário e criar outro", "Pedir a senha do usuário para testar"],
      "Isolar a causa (rede, navegador, máquina ou serviço) evita ações drásticas e acelera a solução."),
    q("ger-4", "geral", "geral-acesso", "Desconexão", "O sistema web desconecta com frequência. O que vale verificar primeiro?",
      ["Estabilidade da internet, VPN/proxy e extensões do navegador",
       "O regime tributário da empresa", "O cadastro de produtos", "A numeração das notas fiscais"],
      "Quedas de sessão costumam estar ligadas à conexão ou a bloqueios no caminho (proxy, VPN, extensões)."),
    q("ger-5", "geral", "geral-acesso", "Segurança", "Qual é uma boa prática de segurança ao prestar suporte a um usuário?",
      ["Nunca pedir a senha ou o código MFA do usuário",
       "Pedir a senha para agilizar o atendimento", "Desativar o MFA de todos os usuários", "Compartilhar um login único com a equipe"],
      "Senha e código MFA são pessoais. O suporte deve usar ferramentas próprias ou orientar o usuário a fazer o passo."),

    /* ===== AGENTES DE IA ===== */
    q("age-1", "agentes", "ia-rotinas", "Gatilhos", "Em uma rotina automatizada, o que é um gatilho?",
      ["O evento ou condição que dispara a execução (ex.: horário, título vencido, novo pedido)",
       "O relatório gerado ao final da rotina", "O usuário que criou a rotina", "Um tipo de imposto"],
      "Sem gatilho a rotina não roda. Ele define quando e por que o agente age."),
    q("age-2", "agentes", "ia-permissoes", "Permissões", "Por que limitar as permissões de acesso de um agente?",
      ["Pelo princípio do menor privilégio: ele só deve acessar os dados e ações de que precisa",
       "Para deixá-lo mais rápido", "Porque agentes não podem ler dados", "Para reduzir o valor dos impostos"],
      "Permissões mínimas reduzem o impacto de um erro ou de um uso indevido."),
    q("age-3", "agentes", "ia-rotinas", "Rotinas", "Antes de ativar uma rotina que envia notificações a clientes, o recomendado é:",
      ["Testar com dados de exemplo ou um destinatário interno e revisar a mensagem",
       "Ativar direto para todos os clientes", "Desativar o MFA", "Excluir as rotinas antigas"],
      "Testar evita mensagens erradas ou duplicadas chegando a clientes reais."),
    q("age-4", "agentes", "ia-permissoes", "Segurança", "Como reduzir o risco de um agente executar uma ação sensível (ex.: um pagamento) de forma errada?",
      ["Exigir aprovação humana antes da execução",
       "Dar acesso total para ele resolver sozinho", "Ocultar o histórico de execuções", "Rodar a ação várias vezes para garantir"],
      "Ações irreversíveis ou financeiras devem ter uma etapa de aprovação."),
    q("age-5", "agentes", "ia-rotinas", "Gatilhos", "Avisar o cliente quando um título vence é um gatilho baseado em:",
      ["Uma condição de dados (data de vencimento ultrapassada)",
       "Um clique manual do contador", "A emissão de uma CC-e", "O cadastro de um novo produto"],
      "Gatilhos de condição monitoram os dados e disparam quando a regra é atendida."),

    /* ===== CONFIGURAÇÃO GERAL DO ERP ===== */
    q("cfg-1", "config", "config-empresa", "Cadastro da empresa", "Por que é importante conferir o regime tributário no cadastro da empresa?",
      ["Porque ele define como os impostos são calculados nas notas (Simples Nacional, Lucro Presumido ou Real)",
       "Porque define a cor do sistema", "Porque controla o limite de usuários", "Não interfere em nada"],
      "Um regime tributário errado gera impostos incorretos em todas as notas emitidas."),
    q("cfg-2", "config", "config-empresa", "Certificado digital", "Para que serve o certificado digital A1 no ERP?",
      ["Assinar e transmitir documentos fiscais eletrônicos, como a NF-e; ele tem validade e precisa ser renovado",
       "Fazer login no e-mail", "Gerar o boleto bancário", "Calcular o custo médio"],
      "Sem certificado válido a emissão de notas para. Acompanhar o vencimento evita interrupções."),
    q("cfg-3", "config", "config-empresa", "Usuários e permissões", "Ao criar um novo usuário, qual é a boa prática?",
      ["Conceder apenas as permissões que a função dele exige",
       "Dar acesso de administrador a todos", "Usar a mesma senha para todos os usuários", "Desativar o MFA para facilitar"],
      "Permissões por função protegem dados sensíveis e reduzem erros."),
    q("cfg-4", "config", "config-empresa", "Categorias", "Um plano de categorias (plano de contas gerencial) bem configurado permite:",
      ["Relatórios como DRE e fluxo de caixa organizados por tipo de receita e despesa",
       "Emitir notas sem certificado", "Ignorar a conciliação bancária", "Excluir o histórico de vendas"],
      "As categorias são a base dos relatórios gerenciais. Uma categoria errada distorce o resultado."),
  ];

  const questoes = [...(window.ERP_QUESTOES || []), ...gerais];

  /* Versão da base: quando sobe, quem já usa o app recebe os cards novos,
     os cards da base têm título e horas atualizados, e os de `removidos`
     saem (se ainda estiverem em "A Fazer"). */
  const versao = 3;
  const removidos = ["servicos-nfse", "contador-painel"];

  return { versao, removidos, modulos, cards, inbox, questoes };
})();
