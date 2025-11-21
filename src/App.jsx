import { useState, useEffect } from 'react';
// Adicionamos 'auth' na importação
import { db, auth } from './firebaseConfig'; 
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
// Importamos as funções de login do Firebase
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { factorial } from 'mathjs';
import './App.css';

// --- Dicionário de Ligas ---
const LEAGUE_NAMES = {
  'WC': 'FIFA World Cup', 'CL': 'UEFA Champions League', 'BL1': 'Bundesliga (Alemanha)',
  'DED': 'Eredivisie (Holanda)', 'BSA': 'Brasileirão Série A', 'PD': 'La Liga (Espanha)',
  'FL1': 'Ligue 1 (França)', 'ELC': 'Championship (Inglaterra 2ª)', 'PPL': 'Primeira Liga (Portugal)',
  'EC': 'European Championship', 'SA': 'Serie A (Itália)', 'PL': 'Premier League (Inglaterra)'
};

// --- Lógica Matemática ---
function poissonPmf(k, lambda) {
  if (isNaN(lambda) || lambda === undefined || lambda === null) return 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function calculateProbabilities(lambdaHome, lambdaAway) {
  const maxGoals = 5;
  const probMatrix = Array(maxGoals + 1).fill(0).map(() => Array(maxGoals + 1).fill(0));
  let probHomeWin = 0, probDraw = 0, probAwayWin = 0, probOver2_5 = 0, probUnder2_5 = 0;

  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const prob = poissonPmf(i, lambdaHome) * poissonPmf(j, lambdaAway);
      probMatrix[i][j] = prob;
      if (i > j) probHomeWin += prob; else if (i === j) probDraw += prob; else probAwayWin += prob;
      if (i + j > 2.5) probOver2_5 += prob; else probUnder2_5 += prob;
    }
  }
  const totalProb = probHomeWin + probDraw + probAwayWin;
  const normalizedMatrix = probMatrix.map(row => row.map(val => (totalProb > 0 ? (val / totalProb) * 100 : 0)));
  if (totalProb === 0) return { prob_1: 0, prob_X: 0, prob_2: 0, prob_over_2_5: 0, matrix: [] };
  const totalProbOU = probOver2_5 + probUnder2_5;
  return {
    prob_1: (probHomeWin / totalProb) * 100, prob_X: (probDraw / totalProb) * 100,
    prob_2: (probAwayWin / totalProb) * 100, prob_over_2_5: totalProbOU > 0 ? (probOver2_5 / totalProbOU) * 100 : 0,
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
    <input type="range" min={min} max={max} step="0.1" value={value} onChange={e => setValue(parseFloat(e.target.value))}
      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-site-primary-900" />
  </div>
);

const ProbBox = ({ label, value, highlight = false }) => {
  const colorClass = highlight
    ? "bg-purple-100 text-purple-800 border-purple-400 ring-2 ring-purple-400" 
    : value > 50 ? "bg-purple-50 text-purple-800 border-purple-200" : "bg-white text-gray-600 border-gray-200";
  return (
    <div className={`flex flex-col items-center p-2 rounded-lg border ${colorClass} flex-1 min-w-[70px] shadow-sm transition-all`}>
      <span className="text-[10px] font-bold mb-0.5 text-center uppercase tracking-wide">{label}</span>
      <span className="text-xl font-extrabold">{value.toFixed(1)}%</span>
    </div>
  );
};

const ScoreTable = ({ matrix, homeTeam, awayTeam }) => {
  const flatValues = matrix.flat();
  const maxVal = Math.max(...flatValues) || 1;
  return (
    <div className="mt-2 w-full flex flex-col items-center">
      <h4 className="text-xs font-bold text-gray-400 uppercase mb-6 text-center border-b pb-2 tracking-widest w-full">Probabilidade do Placar Exato</h4>
      <div className="flex items-center">
        <div className="flex flex-col justify-center items-center mr-3">
           <div className="w-8 flex items-center justify-center">
              <span className="transform -rotate-90 whitespace-nowrap text-xs font-bold text-gray-500 uppercase tracking-wide">Gols {homeTeam}</span>
           </div>
        </div>
        <div>
            <div className="text-center mb-2 text-xs font-bold text-gray-500 uppercase tracking-wide pl-10">Gols {awayTeam}</div>
            <div className="overflow-x-auto">
              <table className="border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="p-2"></th>
                    {matrix[0].map((_, j) => <th key={j} className="p-2 text-gray-500 font-bold border-b-2 border-gray-100 w-[72px] text-center">{j}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row, i) => (
                    <tr key={i}>
                      <th className="p-2 text-gray-500 font-bold border-r-2 border-gray-100 text-right h-10 pr-3">{i}</th>
                      {row.map((prob, j) => {
                        const opacity = prob / maxVal;
                        const textColor = opacity > 0.6 ? 'text-white' : 'text-gray-700';
                        const cellStyle = { backgroundColor: `rgba(185, 28, 28, ${opacity})` };
                        return (
                          <td key={j} className="border border-gray-100 p-1 text-center transition-all hover:scale-110 cursor-default w-[72px] h-10" style={cellStyle}>
                            <div className={`flex items-center justify-center h-full w-full ${textColor} font-bold text-xs`}>{prob > 0.01 ? prob.toFixed(2) + '%' : ''}</div>
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

// --- Componentes de Jogo (History e Analysis) ---
function HistoryMatchDisplay({ match }) {
  const probs = calculateProbabilities(match.lambda_home, match.lambda_away);
  const result = match.scoreHome > match.scoreAway ? '1' : match.scoreAway > match.scoreHome ? '2' : 'X';
  const totalGoals = match.scoreHome + match.scoreAway;
  const isOver25 = totalGoals > 2.5;

  return (
    <div className="bg-white shadow rounded-2xl overflow-hidden border border-gray-200 mt-4 animate-fade-in-up">
      <div className="bg-gray-800 px-6 py-4 text-white text-center relative overflow-hidden">
        <span className="relative z-10 text-[10px] font-bold uppercase tracking-widest bg-black/30 px-2 py-1 rounded text-gray-200">
          {LEAGUE_NAMES[match.competition_code] || match.competition} • Finalizado
        </span>
        <div className="relative z-10 mt-2 flex justify-center items-center space-x-4">
           <span className="text-xl font-bold text-right w-1/3">{match.homeTeam}</span>
           <div className="bg-white text-gray-900 px-4 py-1 rounded-lg font-black text-2xl shadow-lg">
              {match.scoreHome} - {match.scoreAway}
           </div>
           <span className="text-xl font-bold text-left w-1/3">{match.awayTeam}</span>
        </div>
        <p className="relative z-10 text-xs font-medium text-gray-400 mt-2 uppercase tracking-wide">
          {new Date(match.utcDate).toLocaleDateString('pt-BR')}
        </p>
      </div>
      <div className="p-6">
          <p className="text-xs text-center font-bold text-gray-400 uppercase mb-4">O que o modelo previu:</p>
          <div className="grid grid-cols-4 gap-3">
            <ProbBox label="CASA" value={probs.prob_1} highlight={result === '1'} />
            <ProbBox label="EMPATE" value={probs.prob_X} highlight={result === 'X'} />
            <ProbBox label="FORA" value={probs.prob_2} highlight={result === '2'} />
            <ProbBox label="OVER 2.5" value={probs.prob_over_2_5} highlight={isOver25} />
          </div>
      </div>
    </div>
  );
}

function AnalysisDisplay({ homeTeam, awayTeam, lambdaHome, lambdaAway, competition, date }) {
  const [mustWinHome, setMustWinHome] = useState(1);
  const [mustWinAway, setMustWinAway] = useState(1);
  const [desfalquesHome, setDesfalquesHome] = useState(1);
  const [desfalquesAway, setDesfalquesAway] = useState(1);
  const [mando, setMando] = useState(1);

  useEffect(() => {
    setMustWinHome(1); setMustWinAway(1);
    setDesfalquesHome(1); setDesfalquesAway(1);
    setMando(1);
  }, [homeTeam, awayTeam]);

  const adjustedLambdaHome = lambdaHome * mustWinHome * desfalquesHome * mando;
  const adjustedLambdaAway = lambdaAway * mustWinAway * desfalquesAway;
  const probs = calculateProbabilities(adjustedLambdaHome, adjustedLambdaAway);

  return (
    <div className="bg-white shadow-lg rounded-2xl overflow-hidden border border-gray-200 mt-6 transition-all duration-300 animate-fade-in-up">
      <div className="bg-gradient-to-r from-site-primary-900 to-site-primary-700 px-6 py-5 text-white text-center relative overflow-hidden">
         <div className="absolute top-0 left-0 w-full h-full bg-white opacity-5 transform -skew-x-12"></div>
        <span className="relative z-10 text-[10px] font-bold uppercase tracking-widest bg-black/20 px-2 py-1 rounded text-site-primary-50">
          {LEAGUE_NAMES[competition] || competition}
        </span>
        <h2 className="relative z-10 text-3xl font-black mt-3 tracking-tight">
          {homeTeam} <span className="text-white/80 text-xl font-light mx-2">vs</span> {awayTeam}
        </h2>
        <p className="relative z-10 text-xs font-medium text-site-primary-200 mt-2 uppercase tracking-wide">
          {date ? `${new Date(date).toLocaleDateString('pt-BR')} • ${new Date(date).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}` : 'Simulação Personalizada'}
        </p>
      </div>
      <div className="p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
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
        <div className="lg:col-span-8 flex flex-col">
          <div className="grid grid-cols-4 gap-3 mb-6">
            <ProbBox label="CASA" value={probs.prob_1} />
            <ProbBox label="EMPATE" value={probs.prob_X} />
            <ProbBox label="FORA" value={probs.prob_2} />
            <ProbBox label="OVER 2.5" value={probs.prob_over_2_5} />
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-inner flex-grow flex flex-col justify-center items-center">
             <ScoreTable matrix={probs.matrix} homeTeam={homeTeam} awayTeam={awayTeam} />
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Componente de Login Modal ---
function LoginModal({ isOpen, onClose, onLoginSuccess }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onLoginSuccess();
      onClose();
    } catch (err) {
      setError(err.message.includes("auth/invalid-credential") ? "Email ou senha incorretos." : err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md relative animate-fade-in-up">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">✕</button>
        
        <h2 className="text-2xl font-black text-site-primary-900 mb-2 text-center">
          {isRegistering ? "Criar Conta" : "Bem-vindo de volta"}
        </h2>
        <p className="text-sm text-gray-500 text-center mb-6">Acesse análises avançadas do ROI+</p>

        {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full p-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-site-primary-500 outline-none" placeholder="seu@email.com" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Senha</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
              className="w-full p-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-site-primary-500 outline-none" placeholder="******" />
          </div>
          
          <button type="submit" className="w-full bg-site-primary-600 hover:bg-site-primary-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-site-primary-900/20">
            {isRegistering ? "Cadastrar" : "Entrar"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <button onClick={() => setIsRegistering(!isRegistering)} className="text-site-primary-600 font-semibold hover:underline">
            {isRegistering ? "Já tem conta? Faça Login" : "Não tem conta? Cadastre-se"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Componente Principal (App) ---
function App() {
  const [allMatches, setAllMatches] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [historyMatches, setHistoryMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState('matches');
  const [selectedLeagueMatch, setSelectedLeagueMatch] = useState("");
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [selectedLeagueHistory, setSelectedLeagueHistory] = useState("");
  
  const [simLeague, setSimLeague] = useState("");
  const [simHomeTeamId, setSimHomeTeamId] = useState("");
  const [simAwayTeamId, setSimAwayTeamId] = useState("");

  // Estados de Auth
  const [user, setUser] = useState(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  useEffect(() => {
    // Listener de Auth
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    const fetchData = async () => {
      try {
        setLoading(true);
        const qMatches = query(collection(db, "jogos_analise"), orderBy("utcDate", "asc"));
        const matchesSnap = await getDocs(qMatches);
        setAllMatches(matchesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(m => m.lambda_home !== undefined));

        const qTeams = query(collection(db, "times_stats"));
        const teamsSnap = await getDocs(qTeams);
        setAllTeams(teamsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        const qHistory = query(collection(db, "historico_recente"), orderBy("utcDate", "desc"));
        const historySnap = await getDocs(qHistory);
        setHistoryMatches(historySnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        setLoading(false);
      } catch (error) {
        console.error("Erro:", error);
        setLoading(false);
      }
    };
    fetchData();
    return () => unsubscribe();
  }, []);

  // Filtros e Lógica (Mantidos)
  const uniqueLeaguesMatches = [...new Set(allMatches.map(m => m.competition_code || m.competition))].sort();
  const filteredMatches = selectedLeagueMatch ? allMatches.filter(m => (m.competition_code || m.competition) === selectedLeagueMatch) : [];
  const currentMatch = allMatches.find(m => m.id === selectedMatchId);

  const uniqueLeaguesSim = [...new Set(allTeams.map(t => t.league))].sort();
  const teamsInSimLeague = simLeague ? allTeams.filter(t => t.league === simLeague).sort((a, b) => a.name.localeCompare(b.name)) : [];

  const uniqueLeaguesHistory = [...new Set(historyMatches.map(m => m.competition_code || m.competition))].sort();
  const filteredHistoryMatches = selectedLeagueHistory ? historyMatches.filter(m => (m.competition_code || m.competition) === selectedLeagueHistory) : historyMatches;

  let simLambdaHome = 0, simLambdaAway = 0, simHomeTeamName = "", simAwayTeamName = "";
  if (simHomeTeamId && simAwayTeamId && simHomeTeamId !== simAwayTeamId) {
    const homeStats = allTeams.find(t => t.team_id === parseInt(simHomeTeamId));
    const awayStats = allTeams.find(t => t.team_id === parseInt(simAwayTeamId));
    if (homeStats && awayStats) {
      simHomeTeamName = homeStats.name; simAwayTeamName = awayStats.name;
      simLambdaHome = homeStats.FO_home * awayStats.FD_away * homeStats.league_avg_home;
      simLambdaAway = awayStats.FO_away * homeStats.FD_home * awayStats.league_avg_away;
    }
  }

  const handleLogout = async () => {
    await signOut(auth);
  };

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
      {/* Modal de Login */}
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} onLoginSuccess={() => setIsLoginOpen(false)} />

      <div className="max-w-6xl mx-auto">
        
        {/* Barra de Topo (User) */}
        <div className="flex justify-end mb-4">
          {user ? (
            <div className="flex items-center space-x-4 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-200">
              <div className="flex flex-col text-right">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Logado como</span>
                <span className="text-xs font-bold text-site-primary-700">{user.email.split('@')[0]}</span>
              </div>
              <button onClick={handleLogout} className="text-xs font-bold text-red-500 hover:text-red-700">Sair</button>
            </div>
          ) : (
            <button onClick={() => setIsLoginOpen(true)} className="bg-white hover:bg-gray-50 text-site-primary-700 font-bold py-2 px-6 rounded-full shadow-sm border border-gray-200 text-sm transition-all flex items-center">
              <span className="mr-2">🔐</span> Entrar / Cadastrar
            </button>
          )}
        </div>

        {/* Header */}
        <div className="flex flex-col items-center mb-8">
           <img src="/logo.jpg" alt="Logo ROI+" className="w-64 mb-6 rounded-2xl shadow-sm" />
        </div>

        {/* Navegação */}
        <div className="flex justify-center mb-8 overflow-x-auto">
          <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-200 inline-flex whitespace-nowrap">
            <button onClick={() => setActiveTab('matches')} className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'matches' ? 'bg-site-primary-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}>📅 Próximos Jogos</button>
            <button onClick={() => setActiveTab('simulator')} className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'simulator' ? 'bg-site-primary-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}>⚽ Simulador</button>
            <button onClick={() => setActiveTab('history')} className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'history' ? 'bg-site-primary-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}>✅ Histórico (7 Dias)</button>
          </div>
        </div>

        {/* === JOGOS REAIS === */}
        {activeTab === 'matches' && (
          <>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-8 max-w-4xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">1. Campeonato</label>
                  <select value={selectedLeagueMatch} onChange={(e) => { setSelectedLeagueMatch(e.target.value); setSelectedMatchId(""); }} className="block w-full pl-4 pr-10 py-3 text-base border-gray-200 focus:outline-none focus:ring-2 focus:ring-site-primary-500 focus:border-transparent sm:text-sm rounded-xl bg-gray-50 hover:bg-white transition-all cursor-pointer text-gray-700 font-medium border">
                    <option value="">Selecione uma Liga...</option>
                    {uniqueLeaguesMatches.map(code => <option key={code} value={code}>{LEAGUE_NAMES[code] || code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">2. Partida</label>
                  <select value={selectedMatchId} onChange={(e) => setSelectedMatchId(e.target.value)} disabled={!selectedLeagueMatch} className="block w-full pl-4 pr-10 py-3 text-base border-gray-200 focus:outline-none focus:ring-2 focus:ring-site-primary-500 focus:border-transparent sm:text-sm rounded-xl bg-gray-50 hover:bg-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 font-medium border">
                    <option value="">{selectedLeagueMatch ? (filteredMatches.length > 0 ? "Selecione o Jogo..." : "Nenhum jogo encontrado") : "Aguardando Liga..."}</option>
                    {filteredMatches.map(m => <option key={m.id} value={m.id}>{m.homeTeam} vs {m.awayTeam}</option>)}
                  </select>
                </div>
              </div>
            </div>
            {currentMatch ? <AnalysisDisplay homeTeam={currentMatch.homeTeam} awayTeam={currentMatch.awayTeam} lambdaHome={currentMatch.lambda_home} lambdaAway={currentMatch.lambda_away} competition={currentMatch.competition_code} date={currentMatch.utcDate} /> : <div className="flex flex-col items-center justify-center py-20 text-gray-300 border-2 border-dashed border-gray-200 rounded-3xl bg-site-primary-900/5"><p className="font-medium text-gray-400">Selecione um jogo agendado</p></div>}
          </>
        )}

        {/* === SIMULADOR === */}
        {activeTab === 'simulator' && (
          <>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-8 max-w-4xl mx-auto border-l-4 border-l-site-primary-500">
              <h3 className="text-sm font-bold text-gray-800 uppercase mb-4 flex items-center"><span className="bg-site-primary-100 text-site-primary-700 p-1 rounded mr-2">⚽</span> Simulação Personalizada</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Campeonato</label>
                  <select value={simLeague} onChange={(e) => { setSimLeague(e.target.value); setSimHomeTeamId(""); setSimAwayTeamId(""); }} className="block w-full pl-3 pr-8 py-2 text-sm border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-site-primary-500 border"><option value="">Escolha a Liga...</option>{uniqueLeaguesSim.map(l => <option key={l} value={l}>{LEAGUE_NAMES[l] || l}</option>)}</select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Time Mandante</label>
                  <select value={simHomeTeamId} onChange={(e) => setSimHomeTeamId(e.target.value)} disabled={!simLeague} className="block w-full pl-3 pr-8 py-2 text-sm border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-site-primary-500 border disabled:opacity-50"><option value="">Escolha o Mandante...</option>{teamsInSimLeague.map(t => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}</select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Time Visitante</label>
                  <select value={simAwayTeamId} onChange={(e) => setSimAwayTeamId(e.target.value)} disabled={!simLeague} className="block w-full pl-3 pr-8 py-2 text-sm border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-site-primary-500 border disabled:opacity-50"><option value="">Escolha o Visitante...</option>{teamsInSimLeague.filter(t => t.team_id !== parseInt(simHomeTeamId)).map(t => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}</select>
                </div>
              </div>
            </div>
            {(simLambdaHome > 0 && simLambdaAway > 0) ? <AnalysisDisplay homeTeam={simHomeTeamName} awayTeam={simAwayTeamName} lambdaHome={simLambdaHome} lambdaAway={simLambdaAway} competition={simLeague} date={null} /> : <div className="flex flex-col items-center justify-center py-20 text-gray-300 border-2 border-dashed border-gray-200 rounded-3xl bg-site-primary-900/5"><p className="font-medium text-gray-400">Configure a simulação acima</p></div>}
          </>
        )}

        {/* === HISTÓRICO === */}
        {activeTab === 'history' && (
          <>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-8 max-w-4xl mx-auto">
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">Filtrar por Campeonato</label>
              <select value={selectedLeagueHistory} onChange={(e) => setSelectedLeagueHistory(e.target.value)} className="block w-full pl-4 pr-10 py-3 text-base border-gray-200 focus:outline-none focus:ring-2 focus:ring-site-primary-500 focus:border-transparent sm:text-sm rounded-xl bg-gray-50 hover:bg-white transition-all cursor-pointer text-gray-700 font-medium border">
                <option value="">Todas as Ligas</option>
                {uniqueLeaguesHistory.map(code => <option key={code} value={code}>{LEAGUE_NAMES[code] || code}</option>)}
              </select>
            </div>
            <div className="space-y-6">
              {filteredHistoryMatches.length > 0 ? filteredHistoryMatches.map(match => <HistoryMatchDisplay key={match.id} match={match} />) : <div className="flex flex-col items-center justify-center py-20 text-gray-300 border-2 border-dashed border-gray-200 rounded-3xl bg-site-primary-900/5"><p className="font-medium text-gray-400">{selectedLeagueHistory ? "Nenhum jogo nesta liga." : "Nenhum jogo finalizado nos últimos 7 dias."}</p></div>}
            </div>
          </>
        )}

        <div className="mt-12 text-center text-gray-400 text-xs">&copy; {new Date().getFullYear()} ROI+ Analytics.</div>
      </div>
    </div>
  );
}

export default App;