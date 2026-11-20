import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

// --- ENUMS ---
enum Temperatura {
    QUENTE(3), MORNA(2), FRIA(1);
    private int prioridade;
    Temperatura(int prioridade) { this.prioridade = prioridade; }
    public int getPrioridade() { return prioridade; }
}

enum FaseKanban {
    A_FAZER("A Fazer"), EM_ANDAMENTO("Em Andamento"), CONCLUIDO("Concluído");
    private String titulo;
    FaseKanban(String titulo) { this.titulo = titulo; }
    public String getTitulo() { return titulo; }
}

// --- ENTIDADE ---
class CardEstudo {
    private String materia;
    private String moduloOmie;
    private int ticketHoras;
    private Temperatura temperatura;
    private FaseKanban faseAtual;
    private int horasAlocadasNaSemana;

    public CardEstudo(String materia, String moduloOmie, int ticketHoras, Temperatura temperatura) {
        this.materia = materia;
        this.moduloOmie = moduloOmie;
        this.ticketHoras = ticketHoras;
        this.temperatura = temperatura;
        this.faseAtual = FaseKanban.A_FAZER;
        this.horasAlocadasNaSemana = 0;
    }

    public String getMateria() { return materia; }
    public String getModuloOmie() { return moduloOmie; }
    public int getTicketHoras() { return ticketHoras; }
    public Temperatura getTemperatura() { return temperatura; }
    public FaseKanban getFaseAtual() { return faseAtual; }
    public int getHorasAlocadasNaSemana() { return horasAlocadasNaSemana; }
    
    public void setFaseAtual(FaseKanban fase) { this.faseAtual = fase; }
    public void setHorasAlocadasNaSemana(int horas) { this.horasAlocadasNaSemana = horas; }
    
    @Override
    public String toString() {
        return "[" + moduloOmie + "] " + materia + " (" + ticketHoras + "h) - Prioridade: " + temperatura;
    }
}

// --- REPOSITÓRIO (SIMULA O NOTEBOOKLM) ---
class NotebookLMRepository {
    public List<CardEstudo> buscarTodosOsEstudos() {
        List<CardEstudo> db = new ArrayList<>();
        
        System.out.println("🔄 Sincronizando com Gemini NotebookLM...");
        
        // Dados puxados do Caderno 📈 Vendas e NF-e
        db.add(new CardEstudo("Regras de Emissão e CFOP de Venda", "Vendas", 4, Temperatura.QUENTE));
        db.add(new CardEstudo("Ajuste de Impostos e Rejeições da SEFAZ", "Vendas", 5, Temperatura.QUENTE));
        
        // Dados puxados do Caderno 📦 Compras e Estoque
        db.add(new CardEstudo("Cálculo de Custo Médio (CMC) e Saldo Negativo", "Estoque", 6, Temperatura.QUENTE));
        db.add(new CardEstudo("Gestão de Ordens de Produção (OP)", "Estoque", 5, Temperatura.MORNA));
        
        // Dados puxados do Caderno 💲 Finanças
        db.add(new CardEstudo("Conciliação Bancária e Extrato", "Finanças", 4, Temperatura.MORNA));
        db.add(new CardEstudo("Baixa em Lote e DRE (Juros e Multas)", "Finanças", 3, Temperatura.FRIA));
        
        // Dados puxados do Caderno 🤖 Agentes de IA (Novo!)
        db.add(new CardEstudo("Criação de Rotinas e Gatilhos de Notificação", "Agentes de IA", 5, Temperatura.QUENTE));
        db.add(new CardEstudo("Permissões de Acesso aos Agentes", "Agentes de IA", 2, Temperatura.FRIA));

        System.out.println("✅ Leitura dos cadernos concluída. " + db.size() + " matérias encontradas.\n");
        return db;
    }
}

// --- SERVIÇOS (REGRAS DE NEGÓCIO) ---
class QuadroKanban {
    private List<CardEstudo> cards = new ArrayList<>();

    public void adicionarCards(List<CardEstudo> novosCards) {
        this.cards.addAll(novosCards);
    }

    public void moverCard(String nomeMateria, FaseKanban novaFase) {
        cards.stream()
             .filter(c -> c.getMateria().contains(nomeMateria))
             .findFirst()
             .ifPresent(c -> c.setFaseAtual(novaFase));
    }

    public List<CardEstudo> getCardsNaFase(FaseKanban fase) {
        return cards.stream().filter(c -> c.getFaseAtual() == fase).collect(Collectors.toList());
    }

    public void exibirQuadro() {
        System.out.println("================ QUADRO KANBAN DE ESTUDOS ================");
        for (FaseKanban fase : FaseKanban.values()) {
            System.out.println(fase.getTitulo().toUpperCase() + ":");
            List<CardEstudo> faseCards = getCardsNaFase(fase);
            if (faseCards.isEmpty()) System.out.println("  (vazio)");
            else faseCards.forEach(c -> System.out.println("  " + c.toString()));
            System.out.println("----------------------------------------------------------");
        }
    }
}

class GerenciadorAgenda {
    public void distribuirHoras(List<CardEstudo> materiasEmAndamento, int horasSemanais) {
        System.out.println("📅 ALOCANDO " + horasSemanais + " HORAS NA SUA SEMANA BASEADO NA TEMPERATURA...\n");
        
        // Ordena para que assuntos urgentes (QUENTE) ocupem o tempo primeiro
        materiasEmAndamento.sort(Comparator.comparingInt((CardEstudo c) -> c.getTemperatura().getPrioridade()).reversed());

        int horasRestantes = horasSemanais;

        for (CardEstudo card : materiasEmAndamento) {
            if (horasRestantes <= 0) break;

            int horasParaOCard = Math.min(card.getTicketHoras(), horasRestantes);
            card.setHorasAlocadasNaSemana(horasParaOCard);
            horasRestantes -= horasParaOCard;
            
            System.out.println("-> Estudando: " + card.getMateria());
            System.out.println("   Tempo Alocado: " + horasParaOCard + "h (Faltam " + (card.getTicketHoras() - horasParaOCard) + "h para fechar)");
        }
        
        if(horasRestantes > 0) {
            System.out.println("\n🎉 Você concluiu sua carga semanal e ainda sobraram " + horasRestantes + " horas livres!");
        }
    }
}

// --- CLASSE PRINCIPAL (O PROGRAMA) ---
public class Main {
    public static void main(String[] args) {
        // 1. Instanciamos os módulos
        NotebookLMRepository repo = new NotebookLMRepository();
        QuadroKanban kanban = new QuadroKanban();
        GerenciadorAgenda agenda = new GerenciadorAgenda();

        // 2. Extraímos tudo dos Notebooks e jogamos no Kanban (Tudo cai em "A FAZER")
        kanban.adicionarCards(repo.buscarTodosOsEstudos());

        // 3. Você decide puxar 3 cards importantes para começar a estudar essa semana
        kanban.moverCard("Cálculo de Custo Médio", FaseKanban.EM_ANDAMENTO);
        kanban.moverCard("Criação de Rotinas", FaseKanban.EM_ANDAMENTO);
        kanban.moverCard("Baixa em Lote e DRE", FaseKanban.EM_ANDAMENTO);
        
        // (Opcional) Visualizar o quadro para ter certeza que moveram
        kanban.exibirQuadro();

        // 4. Você informa que tem apenas 8 HORAS na semana. A inteligência distribui o tempo.
        List<CardEstudo> estudandoAgora = kanban.getCardsNaFase(FaseKanban.EM_ANDAMENTO);
        agenda.distribuirHoras(estudandoAgora, 8);
    }
}
