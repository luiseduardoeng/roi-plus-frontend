import { useState, useEffect } from 'react';
import { db } from './firebaseConfig'; // Importa a conexão do Firebase
import { collection, getDocs } from 'firebase/firestore';
import './App.css'; // O Vite já inclui este arquivo para estilos

function App() {
  // 1. Criamos um "estado" para guardar a lista de jogos
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // 2. O useEffect() roda uma vez quando o site carrega
  useEffect(() => {
    // Função para buscar os dados no Firebase
    const fetchMatches = async () => {
      try {
        // Pega a "coleção" (pasta) 'jogos_analise' do Firestore
        const querySnapshot = await getDocs(collection(db, "jogos_analise"));
        
        // Mapeia os resultados e formata para a lista
        const matchesData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setMatches(matchesData); // Salva os jogos no "estado"
        setLoading(false); // Para de carregar
      } catch (error) {
        console.error("Erro ao buscar dados do Firestore: ", error);
        setLoading(false);
      }
    };

    fetchMatches(); // Executa a função
  }, []); // O [] vazio garante que isso rode só uma vez

  // 3. Renderiza o conteúdo (o HTML)
  
  // Se estiver carregando, mostra uma mensagem
  if (loading) {
    return <div>Carregando dados do Firebase...</div>;
  }

  // Se não estiver carregando, mostra a tabela de jogos
  return (
    <div className="App">
      <h1>ROI+ Análises de Futebol</h1>
      <h2>Próximos Jogos e Probabilidades</h2>
      <table>
        <thead>
          <tr>
            <th>Jogo (Casa vs. Fora)</th>
            <th>Prob. Casa (1)</th>
            <th>Prob. Empate (X)</th>
            <th>Prob. Fora (2)</th>
            <th>Prob. Over 2.5</th>
          </tr>
        </thead>
        <tbody>
          {/* 4. Faz um loop na lista de jogos e cria uma linha para cada um */}
          {matches.map(match => (
            <tr key={match.id}>
              <td>{match.homeTeam} vs {match.awayTeam}</td>
              <td>{(match.probabilities.prob_1 * 100).toFixed(2)}%</td>
              <td>{(match.probabilities.prob_X * 100).toFixed(2)}%</td>
              <td>{(match.probabilities.prob_2 * 100).toFixed(2)}%</td>
              <td>{(match.probabilities.prob_over_2_5 * 100).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;