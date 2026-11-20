# 🚀 ERP Study Scheduler (Kanban & CRM)

![Java](https://img.shields.io/badge/Java-ED8B00?style=for-the-badge&logo=java&logoColor=white)
![Status](https://img.shields.io/badge/Status-Conclu%C3%ADdo-success?style=for-the-badge)

## 🎯 Sobre o Projeto
Este projeto é um sistema inteligente de gestão de estudos inspirado na arquitetura e regras de negócio de um ERP real (Omie). Ele une conceitos de **CRM, Quadro Kanban e Distribuição Automática de Horas** para organizar o aprendizado de módulos complexos, como Finanças, Vendas, Estoque e Agentes de IA.

O objetivo principal é demonstrar forte domínio em **Programação Orientada a Objetos (POO)**, aplicação de algoritmos para resolução de problemas (Greedy Algorithm) e separação de responsabilidades (Arquitetura MVC/Service-Repository).

## ⚙️ Funcionalidades Principais
* **Quadro Kanban Automático:** Os cards de estudo trafegam entre estados de funil (*A Fazer, Em Andamento, Concluído*), simulando oportunidades de um CRM.
* **Algoritmo de Agenda (Greedy):** Distribui a carga horária semanal do usuário priorizando automaticamente os assuntos mais urgentes (Temperatura "Quente").
* **Mock Repository:** Simula a conexão com um banco de dados externo (Headless CMS), populando o sistema com dados reais extraídos de documentações de ERP.

## 🌐 Versão Web (GitHub Pages)
Além do core em Java, o projeto tem uma versão **100% client-side** em Vanilla JS (sem frameworks), publicada no GitHub Pages:

* **Kanban com Drag and Drop nativo (HTML5):** arraste os cards entre *A Fazer*, *Em Andamento* e *Concluído* (no celular ou pelo teclado, use as setas ◀ ▶).
* **Persistência em `localStorage`:** as posições dos cards se mantêm após recarregar a página.
* **Agenda Inteligente (Greedy):** informe as horas da semana e o algoritmo distribui o tempo entre os cards *Em Andamento*, priorizando Quente → Morna → Fria, no painel **Seu Plano Semanal**.
* **Design responsivo:** CSS Grid e Flexbox, visual de SaaS/ERP.

Arquivos: `index.html` (estrutura), `style.css` (design system) e `app.js` (Repository, Services e Views, espelhando a arquitetura Java).

Para rodar localmente, basta abrir o `index.html` no navegador ou servir a pasta:
```bash
python3 -m http.server 8000
```

## 🛠️ Tecnologias e Conceitos Utilizados
* **Java Core:** Uso avançado de Streams API e Lambdas para manipulação de listas e filtragem de dados.
* **Orientação a Objetos:** Classes, Encapsulamento e uso rigoroso de `Enums` para domínios fechados (Fases do Kanban e Prioridades).
* **Tratamento Seguro:** Utilização de `Optional<T>` para evitar `NullPointerException` durante a transição de estados dos cards.
* **Design Patterns:** Estruturação baseada em *Entities* (CardEstudo), *Repositories* (NotebookLMRepository) e *Services* (GerenciadorAgenda, QuadroKanban).

## 🏗️ Estrutura do Código
- `CardEstudo.java`: Entidade principal com os dados do módulo, horas necessárias e estado atual.
- `FaseKanban` e `Temperatura`: Enums que garantem a integridade das regras de negócio.
- `NotebookLMRepository.java`: Simula o banco de dados e retorna a lista de matérias.
- `QuadroKanban.java`: Serviço responsável pela lógica de movimentação e visualização em colunas.
- `GerenciadorAgenda.java`: Serviço que executa o algoritmo de distribuição de tempo.
- `Main.java`: Ponto de entrada que orquestra a injeção de dependências e simula o fluxo do usuário.

## 🚀 Como Executar o Projeto

1. Clone o repositório para a sua máquina:
   ```bash
   git clone https://github.com/gustavoromanno/agenda_estudos.git
   ```
2. Navegue até a pasta do projeto e compile o código Java:
   ```bash
   javac Main.java
   ```
3. Execute a classe principal para ver o sistema rodando no terminal:
   ```bash
   java Main
   ```

## 👨‍💻 Autor
Criado por **Gustavo Romanno** - Desenvolvedor com foco em soluções de negócio, integrações e arquitetura limpa.
