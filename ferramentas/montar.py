"""Monta conteudo.js (cards + artigos por card) a partir de artigos.json.

Uso: python3 -I montar.py artigos.json saida/conteudo.js
"""
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

PALAVRAS_POR_HORA = 6000  # ~100 palavras/min: leitura com anotações

ARQ = {
    "CRM": "AJUDA - CRM.md",
    "VE": "AJUDA - Vendas e NF-e.md",
    "PV": "AJUDA - Vendas e NF-e - Pedido de Venda.md",
    "RE": "AJUDA - Vendas e NF-e - Remessa de Produtos.md",
    "IM": "AJUDA - Impostos para Vendas e NF-e.md",
    "FR": "AJUDA - Vendas e NF-e - Cota#U00e7#U00e3o de Frete.md",
    "RJ": "AJUDA - Rejei#U00e7#U00f5es de NF-e.md",
    "CE": "AJUDA - Compras e Estoque.md",
    "PR": "AJUDA - Produ#U00e7#U00e3o.md",
    "PI": "AJUDA - Produ#U00e7#U00e3o - Produ#U00e7#U00e3o- Opera#U00e7#U00f5es com NF-e para Industrializa#U00e7#U00e3o.md",
    "SE": "AJUDA - Servi#U00e7os e NFS-e.md",
    "OS": "AJUDA - Servi#U00e7os e NFS-e - Ordens de Servi#U00e7os.md",
    "CT": "AJUDA - Servi#U00e7os e NFS-e - Contratos de Presta#U00e7#U00e3o de Servi#U00e7o.md",
    "RS": "AJUDA - Rejei#U00e7#U00f5es de NFS-e.md",
    "FI": "AJUDA - Finan#U00e7as.md",
    "CC": "AJUDA - Finan#U00e7as - Contas Correntes.md",
    "CP": "AJUDA - Finan#U00e7as - Contas a Pagar.md",
    "CR": "AJUDA - Finan#U00e7as - Contas a Receber.md",
    "VM": "AJUDA - Finan#U00e7as - Finan#U00e7as- Veja mais.md",
    "IB": "AJUDA - Finan#U00e7as - Integra#U00e7#U00f5es Banc#U00e1rias.md",
    "PC": "AJUDA - Painel do Contador.md",
    "PM": "AJUDA - Painel do Contador - Painel do Contador- Integra#U00e7#U00f5es Cont#U00e1beis Manuais.md",
    "RT": "AJUDA - Reforma Tribut#U00e1ria.md",
}


def r(a, b):
    return list(range(a, b + 1))


TODOS = "todos"

# (id, módulo, matéria, temperatura, [(arquivo, índices)], horas_fixas, referência)
CARDS = [
    # ===== CRM =====
    ("crm-intro", "crm", "Conheça o CRM: checklist, perguntas frequentes, Radar de Clientes e Decola CNPJ", "warm", [("CRM", r(1, 4))], None, False),
    ("crm-config-1", "crm", "Configuração do CRM: parceiros, equipes, finders, tipos, origens e motivos", "warm", [("CRM", r(5, 10))], None, False),
    ("crm-config-2", "crm", "Configuração do CRM: verticais, soluções, concorrentes, fases, papéis e ticket", "warm", [("CRM", r(11, 16))], None, False),
    ("crm-config-3", "crm", "Configuração do CRM: usuários, tarefas, preferências, características e metas", "cold", [("CRM", r(17, 25))], None, False),
    ("crm-funil", "crm", "Contas e Contatos no CRM", "hot", [("CRM", r(26, 33))], None, False),
    ("crm-oportunidades", "crm", "Oportunidades: painel, cadastro, faturamento e transferências", "hot", [("CRM", r(34, 42))], None, False),
    ("crm-tarefas", "crm", "Tarefas, Kanban, Agenda Google/Outlook e RD Station", "cold", [("CRM", r(43, 46))], None, False),

    # ===== VENDAS E NF-e =====
    ("ven-intro", "vendas", "Conheça o módulo: checklist, perguntas frequentes e Kanban de vendas", "warm", [("VE", r(2, 5) + [65])], None, False),
    ("vendas-cfop", "vendas", "Regras de Emissão e CFOP de Venda", "hot", [("VE", [1]), ("IM", [11, 12])], None, False),
    ("ven-ia", "vendas", "Omie.IA Fiscal: sugestões de tributação e ajuste de ICMS", "warm", [("VE", r(6, 9))], None, False),
    ("ven-pedido-config", "vendas", "Pedido de Venda: configurações, etapas do Kanban e orçamento", "warm", [("PV", r(0, 3))], None, False),
    ("ven-pedido-cadastro", "vendas", "Pedido de Venda: cadastro, itens, cliente estrangeiro e consultas", "hot", [("PV", r(4, 15))], None, False),
    ("ven-pedido-dados", "vendas", "Pedido de Venda: retenções, parcelas, frete, pagamento e dados financeiros", "warm", [("PV", r(16, 28) + [37, 40])], None, False),
    ("ven-faturamento", "vendas", "Faturamento da NF-e: em lote, contingência, CC-e e alterações após faturar", "hot", [("PV", r(29, 36) + [38, 39])], None, False),
    ("ven-cenario", "vendas", "Cenário Fiscal, Tabela do IBPT e configuração de impostos por produto", "hot", [("IM", r(0, 9))], None, False),
    ("vendas-sefaz", "vendas", "Ajuste de Impostos e Rejeições SEFAZ", "hot", [("IM", [10]), ("RJ", r(0, 3))], None, False),
    ("ven-impostos", "vendas", "ICMS, ICMS-ST, DIFAL, FCP, IPI, PIS, COFINS e NFC-e/SAT", "hot", [("IM", r(13, 23))], None, False),
    ("ven-recomendacoes", "vendas", "Outras recomendações fiscais: DANFE, frete, desconto, pauta e regras por estado", "warm", [("IM", r(24, 28))], None, False),
    ("ven-nfe-detalhes", "vendas", "Detalhes da NF-e: entrega, retirada, presença, inutilização, DANFE e XML", "warm", [("VE", r(10, 33))], None, False),
    ("ven-devolucao", "vendas", "Devolução de venda, NF-e complementar e de ajuste", "hot", [("VE", r(34, 40))], None, False),
    ("ven-mdfe", "vendas", "Declaração de Conteúdo (DC-e) e MDF-e", "cold", [("VE", r(41, 53))], None, False),
    ("ven-xml-kit", "vendas", "Importação por XML, pedido parcial, KIT, tabelas de preço e transportadoras", "warm", [("VE", r(54, 64) + r(66, 69))], None, False),
    ("ven-remessa", "vendas", "Remessa de Produtos", "warm", [("RE", r(0, 16))], None, False),
    ("ven-frete", "vendas", "Cotação de Frete: painel, embalagens, etiquetas e transportadoras", "cold", [("VE", r(70, 76)), ("FR", r(0, 7))], None, False),

    # ===== COMPRAS, ESTOQUE E PRODUÇÃO =====
    ("cmp-intro", "compras", "Conheça o módulo: checklist, perguntas frequentes e configurações", "warm", [("CE", r(1, 4))], None, False),
    ("cmp-estoque", "compras", "Locais de estoque, movimentações, lote e validade e reservas", "hot", [("CE", [5, 6, 10, 11, 12, 13, 15, 16, 17])], None, False),
    ("estoque-cmc", "compras", "Cálculo de Custo Médio (CMC)", "hot", [("CE", [7, 8, 9, 14])], None, False),
    ("cmp-pedido", "compras", "Requisição, sugestão e pedido de compra", "warm", [("CE", r(18, 34))], None, False),
    ("cmp-recebimento", "compras", "Recebimento da NF-e de fornecedor: manual, automático e via XML", "hot", [("CE", [35, 36, 37, 38, 39, 42, 43, 49, 52])], None, False),
    ("cmp-ajustes", "compras", "Manifestação do destinatário, crédito de ICMS e ajustes no recebimento", "warm", [("CE", [40, 41, 44, 45, 46, 47, 48, 50, 51, 53])], None, False),
    ("cmp-entrada", "compras", "Notas de entrada: produtor rural, não eletrônica e carta de correção", "warm", [("CE", r(54, 65))], None, False),
    ("cmp-devolucao", "compras", "Devolução ao fornecedor", "warm", [("CE", r(66, 70))], None, False),
    ("cmp-importacao", "compras", "Nota fiscal de importação", "cold", [("CE", r(71, 78))], None, False),
    ("cmp-cte", "compras", "CT-e: importação e recebimento", "cold", [("CE", r(79, 83))], None, False),
    ("estoque-op", "compras", "Gestão de Ordens de Produção (OP)", "warm", [("PR", r(0, 11))], None, False),
    ("cmp-industrializacao", "compras", "Industrialização e beneficiamento por terceiros", "cold", [("PI", r(0, 4))], None, False),

    # ===== SERVIÇOS E NFS-e =====
    ("srv-conheca", "servicos", "Conheça o Módulo: checklist, ticket médio e perguntas frequentes", "warm", [("SE", r(1, 3))], None, False),
    ("srv-cadastro", "servicos", "Cadastro de Serviços (em lote, via XML, código de serviço e CNAE)", "hot", [("SE", r(6, 12))], None, False),
    ("srv-importacao", "servicos", "Importação e Exportação da NFS-e (XML de saída e recibos)", "warm", [("SE", [4, 5])], None, False),
    ("srv-recibo", "servicos", "Recibo de Prestação de Serviço", "cold", [("SE", [13, 22])], None, False),
    ("srv-nacional", "servicos", "NFS-e Nacional: migração, ambiente nacional e Simples Nacional", "hot", [("SE", r(14, 16))], None, False),
    ("srv-os-cadastros", "servicos", "Ordens de Serviço: Cadastros", "warm", [("OS", r(0, 13))], None, False),
    ("srv-os-config", "servicos", "Ordens de Serviço: Configurações", "warm", [("OS", r(14, 24))], None, False),
    ("srv-os-faturamento", "servicos", "Ordens de Serviço: Faturamento", "hot", [("OS", r(25, 38))], None, False),
    ("srv-ct-cadastros", "servicos", "Contratos de Serviço: Cadastros", "warm", [("CT", r(0, 12))], None, False),
    ("srv-ct-config", "servicos", "Contratos de Serviço: Configurações", "cold", [("CT", r(13, 18))], None, False),
    ("srv-ct-faturamento", "servicos", "Contratos de Serviço: Faturamento", "hot", [("CT", r(19, 29))], None, False),
    ("srv-config-gerais", "servicos", "Configurações Gerais: integração com a prefeitura, IBPT, retenções e emissão", "hot", [("SE", r(17, 21) + r(23, 27))], None, False),

    # ===== FINANÇAS =====
    ("fin-intro", "financas", "Conheça o módulo: Omie.CASH, checklist e resumo das integrações bancárias", "warm", [("FI", r(0, 3))], None, False),
    ("fin-contas-correntes", "financas", "Contas correntes, extrato, lançamentos e créditos de clientes", "hot", [("CC", r(0, 14))], None, False),
    ("financas-conciliacao", "financas", "Conciliação Bancária e Extrato", "hot", [("CC", r(15, 21))], None, False),
    ("fin-pagar", "financas", "Contas a Pagar: cadastro, retenções, recorrência e aprovação de pagamentos", "hot", [("CP", r(0, 5) + r(10, 12) + r(14, 19) + [24])], None, False),
    ("fin-receber", "financas", "Contas a Receber: cadastro, recorrência, Pix e parcelas", "hot", [("CR", r(0, 4) + r(9, 15))], None, False),
    ("financas-dre", "financas", "Baixa em Lote e DRE", "cold", [("CP", [6, 7, 8, 9, 13]), ("CR", [5, 6, 7, 8]), ("VM", [2, 3, 4, 5])], None, False),
    ("fin-boletos", "financas", "Boletos, homologação bancária e remessa de cobrança", "warm", [("CR", r(16, 35))], None, False),
    ("fin-cnab-pagamento", "financas", "Pagamentos via CNAB: remessa, retorno e tributos (por banco)", "warm", [("CP", r(20, 23)), ("CC", r(22, 54))], 3, True),
    ("fin-cobranca-bancos", "financas", "Cobrança bancária: configuração por banco", "cold", [("CC", r(55, 115))], 2, True),
    ("fin-api", "financas", "Integrações bancárias via API e Open Finance", "warm", [("FI", r(4, 10)), ("IB", r(0, 22))], 3, True),
    ("fin-monitoramento", "financas", "Restrições de crédito, Monitora e NFS-e tomadas contra o CNPJ", "warm", [("VM", [0, 1, 6, 7]), ("FI", [11])], None, False),
    ("fin-concessionarias", "financas", "Integração de contas de consumo (concessionárias)", "cold", [("VM", r(8, 85))], 1, True),
    ("fin-rotinas", "financas", "Adiantamentos, cartões, cheques, empréstimos, aplicações e outras rotinas", "warm", [("VM", r(86, 104))], None, False),

    # ===== PAINEL DO CONTADOR =====
    ("cont-intro", "contador", "Conheça o Painel do Contador: acesso, checklist e identificação", "warm", [("PC", r(1, 4))], None, False),
    ("cont-plano", "contador", "Plano de contas e integração contábil", "hot", [("PC", r(5, 14))], None, False),
    ("cont-fiscal", "contador", "Integração fiscal: CFOP, NF-e, SPED e impostos retidos", "hot", [("PC", r(15, 22))], None, False),
    ("cont-arquivos", "contador", "Geração de arquivos: contábeis, XML, SPED, SINTEGRA e posição de estoque", "hot", [("PC", r(23, 37) + [44, 48])], None, False),
    ("cont-fechamento", "contador", "Fechamento do período, centros de custo e participantes", "warm", [("PC", [38, 45, 46, 47])], None, False),
    ("cont-automaticas", "contador", "Integrações contábeis automáticas: SCI, Tron e Fortes", "cold", [("PC", r(39, 43))], None, False),
    ("cont-oneflow", "contador", "Contabilização via OneFlow", "warm", [("PC", r(49, 55))], None, False),
    ("cont-manuais", "contador", "Integrações contábeis manuais: Alterdata, Contmatic, Domínio, Questor e outros", "cold", [("PM", r(0, 13))], 2, True),

    # ===== REFORMA TRIBUTÁRIA =====
    ("ref-ibs-cbs", "reforma", "Configurando o IBS e o CBS (produtos e serviços)", "hot", [("RT", [1, 5])], None, False),
    ("ref-cronograma", "reforma", "Cronogramas de atualização da Reforma Tributária", "hot", [("RT", [2, 6])], None, False),
    ("ref-calculos", "reforma", "Cálculos, eventos e relatório da Reforma Tributária", "warm", [("RT", [3, 4, 7])], None, False),
]

# Rejeições: agrupadas por tema a partir do título (primeira regra que casar).
REGRAS_NFE = [
    ("rej-nfe-sefaz", "Rejeições de NF-e: comunicação com a SEFAZ, lote, XML e contingência", "warm",
     r"lote|paralisad|svc|schema|xml|mensagem|codifica|conting|tipo emiss|consumo indevido|assinar|em branco|serviço paralisado"),
    ("rej-nfe-certificado", "Rejeições de NF-e: certificado digital e assinatura", "warm", r"certificad|assinatura"),
    ("rej-nfe-exterior", "Rejeições de NF-e: exportação, importação e operações com o exterior", "cold",
     r"export|import|exterior|drawback|pa[ií]s|desembara|aduan"),
    ("rej-nfe-referencias", "Rejeições de NF-e: notas referenciadas, complementares, devolução e eventos", "warm",
     r"referenciad|complementar|devolu|contranota|evento|cancelament|inutiliz|duplicidade|chave de acesso|denegad|circula|prazo"),
    ("rej-nfe-cfop", "Rejeições de NF-e: CFOP e natureza da operação", "hot", r"cfop|natureza"),
    ("rej-nfe-impostos", "Rejeições de NF-e: impostos, CST e totais da nota", "hot",
     r"icms|ipi|pis|cofins|cst|csosn|fcp|difal|tribut|total|base de c|bc |al[ií]quota|valor|desconto|frete|regime"),
    ("rej-nfe-cadastro", "Rejeições de NF-e: cadastro do emitente, destinatário e transportador", "hot",
     r"cnpj|cpf|\bie\b|inscri|uf|munic|destinat|emitente|suframa|transport|endere|local de|cep|telefone"),
    ("rej-nfe-outras", "Rejeições de NF-e: pagamento, produto e demais validações", "cold", r"."),
]
REGRAS_NFSE = [
    ("rej-nfse-cadastro", "Rejeições de NFS-e: cadastro de serviço, CNAE e dados do tomador", "hot",
     r"item da lista|c[oó]digo de servi|cnae|atividade|tomador|cep|telefone|inscri|cpf|cnpj|prestador|descri"),
    ("rej-nfse-impostos", "Rejeições de NFS-e: ISS, retenções, alíquotas e regime tributário", "hot",
     r"iss|reten|al[ií]quota|tribut|simples|dedu|cst|regime|valor|parcelas"),
    ("rej-nfse-rps", "Rejeições de NFS-e: RPS, XML, certificado e comunicação com a prefeitura", "warm", r"."),
]


def main():
    artigos = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    por_arq = defaultdict(dict)
    for a in artigos:
        por_arq[a["arquivo"]][a["idx"]] = a

    usados = defaultdict(set)
    cards = []

    def horas(lista, fixas):
        if fixas:
            return fixas
        return max(1, math.ceil(sum(a["palavras"] for a in lista) / PALAVRAS_POR_HORA))

    for cid, mod, materia, tempk, fontes, fixas, ref in CARDS:
        lista = []
        for chave, idxs in fontes:
            arq = ARQ[chave]
            for i in idxs:
                a = por_arq[arq][i]  # KeyError = índice errado na especificação
                if i in usados[arq]:
                    raise SystemExit(f"duplicado: {cid} {chave}[{i}]")
                usados[arq].add(i)
                lista.append(a)
        cards.append({"id": cid, "materia": materia, "modulo": mod, "horas": horas(lista, fixas),
                      "temperatura": tempk, "referencia": ref, "artigos": lista})

    def agrupar(chave, modulo, regras, geral_idx, card_geral):
        arq = ARQ[chave]
        grupos = {g[0]: [] for g in regras}
        for i, a in sorted(por_arq[arq].items()):
            if i in usados[arq]:
                continue
            if i in geral_idx:
                card_geral.append(a)
                usados[arq].add(i)
                continue
            t = a["titulo"].lower()
            for gid, _, _, padrao in regras:
                if re.search(padrao, t):
                    grupos[gid].append(a)
                    break
            usados[arq].add(i)
        for gid, materia, tempk, _ in regras:
            lista = grupos[gid]
            if lista:
                cards.append({"id": gid, "materia": materia, "modulo": modulo, "horas": horas(lista, None),
                              "temperatura": tempk, "referencia": True, "artigos": lista})

    agrupar("RJ", "vendas", REGRAS_NFE, set(), [])
    geral_nfse = []
    agrupar("RS", "servicos", REGRAS_NFSE, {0, 1}, geral_nfse)
    # As duas primeiras de NFS-e ("Visualizando…" e "Minha NFS-e foi rejeitada…") viram um card de entrada.
    cards.append({"id": "rej-nfse-intro", "materia": "Rejeições de NFS-e: como visualizar e tratar", "modulo": "servicos",
                  "horas": horas(geral_nfse, None), "temperatura": "hot", "referencia": False, "artigos": geral_nfse})

    # Conferência: artigos que ficaram de fora (o "Conheça a Omie.CASH" repetido é ignorado de propósito)
    fora = [(a["arquivo"], a["idx"], a["titulo"]) for a in artigos
            if a["idx"] not in usados[a["arquivo"]] and not a["titulo"].startswith("Conheça a Omie.CASH")]
    for f in fora:
        print("FORA:", f)

    saida = []
    for c in cards:
        saida.append({**{k: v for k, v in c.items() if k != "artigos"},
                      "artigos": [[a["titulo"], a["url"]] for a in c["artigos"]]})
    js = ("/* Gerado automaticamente a partir da Central de Ajuda Omie (títulos e links públicos).\n"
          "   Cada card agrupa artigos em sequência; horas ≈ palavras ÷ 6.000 (cards de referência têm horas fixas). */\n"
          "window.ERP_CONTEUDO = " + json.dumps({"cards": saida}, ensure_ascii=False, indent=1) + ";\n")
    Path(sys.argv[2]).write_text(js, encoding="utf-8")

    tot = defaultdict(lambda: [0, 0, 0])
    for c in cards:
        tot[c["modulo"]][0] += 1
        tot[c["modulo"]][1] += c["horas"]
        tot[c["modulo"]][2] += len(c["artigos"])
    for m, (n, h, a) in tot.items():
        print(f"{m:10} {n:3} cards {h:4}h {a:4} artigos")
    print("total", len(cards), "cards", sum(c["horas"] for c in cards), "h")


main()
