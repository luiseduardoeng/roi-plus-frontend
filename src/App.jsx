import { useState, useEffect } from 'react';
import { db } from './firebaseConfig';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { factorial } from 'mathjs';
import './App.css';

// --- Lógica Matemática ---
function poissonPmf(k, lambda) {
  if (isNaN(lambda) || lambda === undefined || lambda === null) return 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function calculateProbabilities(lambdaHome, lambdaAway) {
  const maxGoals = 5;
  const probMatrix = Array(maxGoals + 1).fill(0).map(() => Array(maxGoals + 1).fill(0));

  let probHomeWin = 0;
  let probDraw = 0;
  let probAwayWin = 0;
  let probOver2_5 = 0;
  let probUnder2_5 = 0;

  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const prob = poissonPmf(i, lambdaHome) * poissonPmf(j, lambdaAway);
      probMatrix[i][j] = prob;

      if (i > j) probHomeWin += prob;
      else if (i === j) probDraw += prob;
      else probAwayWin += prob;

      if (i + j > 2.5) probOver2_5 += prob;
      else probUnder2_5 += prob;
    }
  }

  const totalProb = probHomeWin + probDraw + probAwayWin;
  const normalizedMatrix = probMatrix.map(row => 
    row.map(val => (totalProb > 0 ? (val / totalProb) * 100 : 0))
  );

  if (totalProb === 0) return { prob_1: 0, prob_X: 0, prob_2: 0, prob_over_2_5: 0, matrix: [] };
  
  const totalProbOU = probOver2_5 + probUnder2_5;

  return {
    prob_1: (probHomeWin / totalProb) * 100,
    prob_X: (probDraw / totalProb) * 100,
    prob_2: (probAwayWin / totalProb) * 100,
    prob_over_2_5: totalProbOU > 0 ? (probOver2_5 / totalProbOU) * 100 : 0,
    matrix: normalizedMatrix
  };
}

// --- Componentes UI ---
const SliderInput = ({ label, value, setValue, min, max }) => (
  <div className="flex flex-col mb-2">
    <div className="flex justify-between items-center mb-1">
      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</span>
      <span className="text-[10px] font-bold text-site-primary-600 bg-site-primary-50 px-2 py-0.5 rounded-full">{value}</span>
    </div>
    <input 
      type="range" 
      min={min} 
      max={max} 
      step="0.1" 
      value={value} 
      onChange={e => setValue(parseFloat(e.target.value))}
      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-site-primary-900"
    />
  </div>
);

const ProbBox = ({ label, value }) => {
  const colorClass = value > 50 
    ? "bg-green-50 text-green-800 border-green-200 ring-1 ring-green-200" 
    : "bg-white text-gray-600 border-gray-200";

  return (
    <div className={`flex flex-col items-center p-2 rounded-lg border ${colorClass} flex-1 min-w-[70px] shadow-sm`}>
      <span className="text-[10px] font-bold mb-0.5 text-center uppercase tracking-wide">{label}</span>
      <span className="text-xl font-extrabold">{value.toFixed(1)}%</span>
    </div>
  );
};

// --- Componente Tabela de Placar (Heatmap - 2 Casas Decimais) ---
const ScoreTable = ({ matrix, homeTeam, awayTeam }) => {
  const flatValues = matrix.flat();
  const maxVal = Math.max(...flatValues) || 1;

  return (
    <div className="mt-2 w-full flex flex-col items-center">
      <h4 className="text-xs font-bold text-gray-400 uppercase mb-6 text-center border-b pb-2 tracking-widest w-full">
        Probabilidade do Placar Exato
      </h4>
      
      <div className="flex items-center">
        
        {/* Eixo Y (Vertical) - Mandante */}
        <div className="flex flex-col justify-center items-center mr-3">
           <div className="w-8 flex items-center justify-center">
              <span className="transform -rotate-90 whitespace-nowrap text-xs font-bold text-gray-500 uppercase tracking-wide">
                Gols {homeTeam}
              </span>
           </div>
        </div>

        {/* Tabela e Eixo X */}
        <div>
            {/* Eixo X (Horizontal) - Visitante */}
            <div className="text-center mb-2 text-xs font-bold text-gray-500 uppercase tracking-wide pl-10">
               Gols {awayTeam}
            </div>

            <div className="overflow-x-auto">
              <table className="border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="p-2"></th>
                    {matrix[0].map((_, j) => (
                      <th key={j} className="p-2 text-gray-500 font-bold border-b-2 border-gray-100 w-[72px] text-center">
                        {j}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row, i) => (
                    <tr key={i}>
                      {/* Cabeçalho Lateral (Números) */}
                      <th className="p-2 text-gray-500 font-bold border-r-2 border-gray-100 text-right h-10 pr-3">
                        {i}
                      </th>
                      
                      {/* Células */}
                      {row.map((prob, j) => {
                        const opacity = prob / maxVal;
                        const textColor = opacity > 0.6 ? 'text-white' : 'text-gray-700';
                        const cellStyle = {
                          backgroundColor: `rgba(185, 28, 28, ${opacity})`, 
                        };

                        return (
                          <td key={j} className="border border-gray-100 p-1 text-center transition-all hover:scale-110 cursor-default w-[72px] h-10" style={cellStyle}>
                            <div className={`flex items-center justify-center h-full w-full ${textColor} font-bold text-xs`}>
                              {prob > 0.01 ? prob.toFixed(2) + '%' : ''}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </div>
      </div>
    </div>
  );
};

// --- Componente de Linha do Jogo ---
function MatchAnalysis({ match }) {
  const [mustWinHome, setMustWinHome] = useState(1);
  const [mustWinAway, setMustWinAway] = useState(1);
  const [desfalquesHome, setDesfalquesHome] = useState(1);
  const [desfalquesAway, setDesfalquesAway] = useState(1);
  const [mando, setMando] = useState(1);

  useEffect(() => {
    setMustWinHome(1); setMustWinAway(1);
    setDesfalquesHome(1); setDesfalquesAway(1);
    setMando(1);
  }, [match.id]);

  const adjustedLambdaHome = match.lambda_home * mustWinHome * desfalquesHome * mando;
  const adjustedLambdaAway = match.lambda_away * mustWinAway * desfalquesAway;

  const probs = calculateProbabilities(adjustedLambdaHome, adjustedLambdaAway);

  return (
    <div className="bg-white shadow-lg rounded-2xl overflow-hidden border border-gray-200 mt-6 transition-all duration-300 animate-fade-in-up">
      {/* Cabeçalho */}
      <div className="bg-gradient-to-r from-site-primary-900 to-site-primary-700 px-6 py-5 text-white text-center relative overflow-hidden">
         <div className="absolute top-0 left-0 w-full h-full bg-white opacity-5 transform -skew-x-12"></div>
         
        <span className="relative z-10 text-[10px] font-bold uppercase tracking-widest bg-black/20 px-2 py-1 rounded text-site-primary-50">
          {match.competition}
        </span>
        <h2 className="relative z-10 text-3xl font-black mt-3 tracking-tight">
          {match.homeTeam} <span className="text-white/80 text-xl font-light mx-2">vs</span> {match.awayTeam}
        </h2>
        <p className="relative z-10 text-xs font-medium text-site-primary-200 mt-2 uppercase tracking-wide">
          {new Date(match.utcDate).toLocaleDateString('pt-BR')} • {new Date(match.utcDate).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
        </p>
      </div>

      <div className="p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Coluna Esquerda: Ajustes (4 colunas) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200/60">
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-4 border-b border-gray-200 pb-2">Mandante</h3>
            <SliderInput label="Must Win" value={mustWinHome} setValue={setMustWinHome} min="0.6" max="1.5" />
            <SliderInput label="Desfalques" value={desfalquesHome} setValue={setDesfalquesHome} min="0.5" max="1" />
            <SliderInput label="Força Mando" value={mando} setValue={setMando} min="0.8" max="1.5" />
          </div>
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200/60">
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-4 border-b border-gray-200 pb-2">Visitante</h3>
            <SliderInput label="Must Win" value={mustWinAway} setValue={setMustWinAway} min="0.6" max="1.5" />
            <SliderInput label="Desfalques" value={desfalquesAway} setValue={setDesfalquesAway} min="0.5" max="1" />
          </div>
        </div>

        {/* Coluna Direita: Dados (8 colunas) */}
        <div className="lg:col-span-8 flex flex-col">
          
          {/* Probabilidades Principais */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            <ProbBox label="CASA" value={probs.prob_1} />
            <ProbBox label="EMPATE" value={probs.prob_X} />
            <ProbBox label="FORA" value={probs.prob_2} />
            <ProbBox label="OVER 2.5" value={probs.prob_over_2_5} />
          </div>

          {/* Tabela de Placar (Heatmap) */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-inner flex-grow flex flex-col justify-center items-center">
             <ScoreTable matrix={probs.matrix} homeTeam={match.homeTeam} awayTeam={match.awayTeam} />
          </div>

        </div>
      </div>
    </div>
  );
}


// --- Componente Principal ---
function App() {
  const [allMatches, setAllMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedLeague, setSelectedLeague] = useState("");
  const [selectedMatchId, setSelectedMatchId] = useState("");

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const q = query(collection(db, "jogos_analise"), orderBy("utcDate", "asc"));
        const querySnapshot = await getDocs(q);
        
        const matchesData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter(match => match.lambda_home !== undefined && match.lambda_away !== undefined);

        setAllMatches(matchesData);
        setLoading(false);
      } catch (error) {
        console.error("Erro ao buscar dados:", error);
        setLoading(false);
      }
    };
    fetchMatches();
  }, []);

  const uniqueLeagues = [...new Set(allMatches.map(m => m.competition))].sort();

  const filteredMatches = selectedLeague 
    ? allMatches.filter(m => m.competition === selectedLeague)
    : [];

  const currentMatch = allMatches.find(m => m.id === selectedMatchId);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-site-primary-50">
        <div className="flex flex-col items-center">
           <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-site-primary-900 mb-4"></div>
           <p className="text-gray-400 text-sm font-medium animate-pulse">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-site-primary-50 py-8 px-4 sm:px-6 lg:px-8 font-sans text-gray-800">
      <div className="max-w-6xl mx-auto">
        
        {/* Header com a Logo */}
        <div className="flex flex-col items-center mb-10">
           {/* NOVA IMAGEM DA LOGO */}
           <img 
              src="/logo-roi-plus.png" 
              alt="Logo ROI+" 
              className="w-48 mb-6" // Ajuste a largura conforme necessário
           />
        </div>

        {/* Filtros */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-8 max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Seletor de Liga */}
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">1. Campeonato</label>
              <select 
                value={selectedLeague}
                onChange={(e) => {
                  setSelectedLeague(e.target.value);
                  setSelectedMatchId("");
                }}
                className="block w-full pl-4 pr-10 py-3 text-base border-gray-200 focus:outline-none focus:ring-2 focus:ring-site-primary-500 focus:border-transparent sm:text-sm rounded-xl bg-gray-50 hover:bg-white transition-all cursor-pointer text-gray-700 font-medium border"
              >
                <option value="">Selecione uma Liga...</option>
                {uniqueLeagues.map(league => (
                  <option key={league} value={league}>{league}</option>
                ))}
              </select>
            </div>

            {/* Seletor de Jogo */}
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">2. Partida</label>
              <select 
                value={selectedMatchId}
                onChange={(e) => setSelectedMatchId(e.target.value)}
                disabled={!selectedLeague}
                className="block w-full pl-4 pr-10 py-3 text-base border-gray-200 focus:outline-none focus:ring-2 focus:ring-site-primary-500 focus:border-transparent sm:text-sm rounded-xl bg-gray-50 hover:bg-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 font-medium border"
              >
                <option value="">
                  {selectedLeague 
                    ? (filteredMatches.length > 0 ? "Selecione o Jogo..." : "Nenhum jogo encontrado") 
                    : "Aguardando Liga..."}
                </option>
                {filteredMatches.map(match => (
                  <option key={match.id} value={match.id}>
                    {match.homeTeam} vs {match.awayTeam}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Exibição */}
        {currentMatch ? (
             <MatchAnalysis match={currentMatch} />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300 border-2 border-dashed border-gray-200 rounded-3xl bg-site-primary-900/5">
            <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
            <p className="font-medium text-gray-400">Nenhuma partida selecionada</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center text-gray-400 text-xs">
          &copy; {new Date().getFullYear()} ROI+ Analytics.
        </div>

      </div>
    </div>
  );
}

export default App;