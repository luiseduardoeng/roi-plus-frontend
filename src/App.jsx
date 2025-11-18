// src/App.jsx

import { useState, useEffect } from 'react';
import { db } from './firebaseConfig';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { factorial } from 'mathjs';
import './App.css';

// --- Função de Cálculo Poisson (em JavaScript) ---
function poissonPmf(k, lambda) {
  if (isNaN(lambda) || lambda === undefined || lambda === null) {
    return 0;
  }
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function calculateProbabilities(lambdaHome, lambdaAway) {
  const maxGoals = 5;
  const probMatrix = Array(maxGoals + 1).fill(0).map(() => Array(maxGoals + 1).fill(0));

  let probHomeWin = 0;
  let probDraw = 0;
  let probAwayWin = 0;
  let probOver2_5 = 0;
  let probUnder_2_5 = 0; // <--- A CORREÇÃO ESTÁ AQUI

  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const prob = poissonPmf(i, lambdaHome) * poissonPmf(j, lambdaAway);
      probMatrix[i][j] = prob;

      if (i > j) probHomeWin += prob;
      else if (i === j) probDraw += prob;
      else probAwayWin += prob;

      // Agora isto funciona
      if (i + j > 2.5) probOver2_5 += prob;
      else probUnder_2_5 += prob;
    }
  }

  const totalProb = probHomeWin + probDraw + probAwayWin;
  if (totalProb === 0) {
    return { prob_1: 0, prob_X: 0, prob_2: 0, prob_over_2_5: 0 };
  }
  
  const totalProbOU = probOver2_5 + probUnder_2_5;

  return {
    prob_1: (probHomeWin / totalProb) * 100,
    prob_X: (probDraw / totalProb) * 100,
    prob_2: (probAwayWin / totalProb) * 100,
    prob_over_2_5: totalProbOU > 0 ? (probOver2_5 / totalProbOU) * 100 : 0,
  };
}
// --- Fim da Lógica Poisson ---


// --- Componente de Jogo (MatchRow) ---
function MatchRow({ match }) {
  const [mustWinHome, setMustWinHome] = useState(1);
  const [mustWinAway, setMustWinAway] = useState(1);
  const [desfalquesHome, setDesfalquesHome] = useState(1);
  const [desfalquesAway, setDesfalquesAway] = useState(1);
  const [mando, setMando] = useState(1);

  const baseLambdaHome = match.lambda_home;
  const baseLambdaAway = match.lambda_away;

  const adjustedLambdaHome = baseLambdaHome * mustWinHome * desfalquesHome * mando;
  const adjustedLambdaAway = baseLambdaAway * mustWinAway * desfalquesAway;

  const probabilities = calculateProbabilities(adjustedLambdaHome, adjustedLambdaAway);

  return (
    <tr>
      {/* Coluna do Jogo */}
      <td>
        <p><strong>{match.homeTeam} vs {match.awayTeam}</strong></p>
        <small>{match.competition}</small>
        <div className="sliders">
          <label>Must Win (Casa): {mustWinHome}</label>
          <input type="range" min="0.6" max="1.5" step="0.1" value={mustWinHome} onChange={e => setMustWinHome(parseFloat(e.target.value))} />
          
          <label>Desfalques (Casa): {desfalquesHome}</label>
          <input type="range" min="0.5" max="1" step="0.1" value={desfalquesHome} onChange={e => setDesfalquesHome(parseFloat(e.target.value))} />

          <label>Must Win (Fora): {mustWinAway}</label>
          <input type="range" min="0.6" max="1.5" step="0.1" value={mustWinAway} onChange={e => setMustWinAway(parseFloat(e.target.value))} />

          <label>Desfalques (Fora): {desfalquesAway}</label>
          <input type="range" min="0.5" max="1" step="0.1" value={desfalquesAway} onChange={e => setDesfalquesAway(parseFloat(e.target.value))} />
          
          <label>Mando Campo: {mando}</label>
          <input type="range" min="0.8" max="1.5" step="0.1" value={mando} onChange={e => setMando(parseFloat(e.target.value))} />
        </div>
      </td>
      
      {/* Colunas de Probabilidade (Resultados) */}
      <td>{probabilities.prob_1.toFixed(2)}%</td>
      <td>{probabilities.prob_X.toFixed(2)}%</td>
      <td>{probabilities.prob_2.toFixed(2)}%</td>
      <td>{probabilities.prob_over_2_5.toFixed(2)}%</td>
    </tr>
  );
}


// --- Componente Principal (App) ---
function App() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const q = query(collection(db, "jogos_analise"), orderBy("utcDate", "asc"));
        const querySnapshot = await getDocs(q);
        
        const matchesData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter(match => 
          match.lambda_home !== undefined && match.lambda_away !== undefined
        );

        setMatches(matchesData);
        setLoading(false);
      } catch (error) {
        console.error("Erro ao buscar dados do Firestore: ", error);
        setLoading(false);
      }
    };
    fetchMatches();
  }, []);

  if (loading) {
    return <div>Carregando dados do Firebase...</div>;
  }

  if (matches.length === 0) {
    return <div>Não há jogos com dados de probabilidade disponíveis no momento.</div>;
  }

  return (
    <div className="App">
      <h1>ROI+ Análises de Futebol (v2)</h1>
      <h2>Próximos Jogos (com Ajuste Manual)</h2>
      <table>
        <thead>
          <tr>
            <th>Jogo (e Ajustes)</th>
            <th>Prob. Casa (1)</th>
            <th>Prob. Empate (X)</th>
            <th>Prob. Fora (2)</th>
            <th>Prob. Over 2.5</th>
          </tr>
        </thead>
        <tbody>
          {matches.map(match => (
            <MatchRow key={match.id} match={match} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;