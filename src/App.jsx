import { useState, useEffect } from 'react';
import { db, auth } from './firebaseConfig'; 
import { collection, getDocs, query, orderBy, addDoc, deleteDoc, doc, where } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { factorial } from 'mathjs';
import './App.css';
import logoImg from './assets/logo.png';

// --- CONSTANTES ---
const LEAGUE_NAMES = {
  'WC': 'FIFA World Cup', 'CL': 'UEFA Champions League', 'BL1': 'Bundesliga (Alemanha)',
  'DED': 'Eredivisie (Holanda)', 'BSA': 'Brasileirão Série A', 'PD': 'La Liga (Espanha)',
  'FL1': 'Ligue 1 (França)', 'ELC': 'Championship (Inglaterra 2ª)', 'PPL': 'Primeira Liga (Portugal)',
  'EC': 'European Championship', 'SA': 'Serie A (Itália)', 'PL': 'Premier League (Inglaterra)'
};

// --- MATEMÁTICA ---
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

// --- COMPONENTES UI ---
const SliderInput = ({ label, value, setValue, min, max }) => (
  <div className="flex flex-col mb-2">
    <div className="flex justify-between items-center mb-1">
      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</span>
      <span className="text-[10px] font-bold text-site-primary-600 bg-site-primary-50 px-2 py-0.5 rounded-full">{value}</span>
    </div>
    <input type="range" min={min} max={max} step="0.1" value={value} onChange={e => setValue(parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-site-primary-900" />
  </div>
);

// NOVO: Caixa de Odds Interativa
const OddBox = ({ label, probability }) => {
  const [userOdd, setUserOdd] = useState("");
  
  // Calcula Odd Justa (Fair Odd) = 100 / Probabilidade
  const fairOdd = probability > 0 ? (100 / probability) : 0;
  
  // Calcula Valor Esperado (EV)
  // EV% = ((Probabilidade_Real * Odd_Casa) - 1) * 100
  // Simplificando: Se Odd_Casa > Fair_Odd, tem valor.
  const hasValue = userOdd && parseFloat(userOdd) > fairOdd;
  const evPercentage = userOdd ? ((parseFloat(userOdd) / fairOdd) - 1) * 100 : 0;

  return (
    <div className={`flex flex-col p-3 rounded-xl border flex-1 min-w-[90px] shadow-sm transition-all ${hasValue ? 'bg-green-50 border-green-300 ring-1 ring-green-400' : 'bg-white border-gray-200'}`}>
      {/* Cabeçalho */}
      <div className="flex justify-between items-center mb-2 border-b border-gray-100 pb-2">
        <span className="text-[10px] font-bold uppercase text-gray-500">{label}</span>
        <span className="text-xs font-bold text-site-primary-600">{probability.toFixed(1)}%</span>
      </div>

      {/* Odd Justa (Calculada) */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-[9px] text-gray-400 uppercase">Justa:</span>
        <span className="text-sm font-bold text-gray-700">@{fairOdd.toFixed(2)}</span>
      </div>

      {/* Input do Usuário */}
      <div className="relative">
        <input 
          type="number" 
          step="0.01" 
          placeholder="Odd?"
          value={userOdd}
          onChange={(e) => setUserOdd(e.target.value)}
          className={`w-full text-center text-sm font-bold p-1 rounded border focus:outline-none ${hasValue ? 'bg-green-100 text-green-800 border-green-300' : 'bg-gray-50 text-gray-600 border-gray-200'}`}
        />
      </div>

      {/* Indicador de Valor */}
      {userOdd && (
        <div className={`text-[10px] font-bold text-center mt-1 ${hasValue ? 'text-green-600' : 'text-red-400'}`}>
          {hasValue ? `+${evPercentage.toFixed(1)}% VALOR` : 'Sem Valor'}
        </div>
      )}
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
        <div className="flex flex-col justify-center items-center mr-3"><div className="w-8 flex items-center justify-center"><span className="transform -rotate-90 whitespace-nowrap text-xs font-bold text-gray-500 uppercase tracking-wide">Gols {homeTeam}</span></div></div>
        <div>
            <div className="text-center mb-2 text-xs font-bold text-gray-500 uppercase tracking-wide pl-10">Gols {awayTeam}</div>
            <div className="overflow-x-auto">
              <table className="border-collapse text-sm">
                <thead><tr><th className="p-2"></th>{matrix[0].map((_, j) => <th key={j} className="p-2 text-gray-500 font-bold border-b-2 border-gray-100 w-[72px] text-center">{j}</th>)}</tr></thead>
                <tbody>
                  {matrix.map((row, i) => (
                    <tr key={i}>
                      <th className="p-2 text-gray-500 font-bold border-r-2 border-gray-100 text-right h-10 pr-3">{i}</th>
                      {row.map((prob, j) => {
                        const opacity = prob / maxVal;
                        const textColor = opacity > 0.6 ? 'text-white' : 'text-gray-700';
                        const cellStyle = { backgroundColor: `rgba(185, 28, 28, ${opacity})` };
                        return (<td key={j} className="border border-gray-100 p-1 text-center transition-all hover:scale-110 cursor-default w-[72px] h-10" style={cellStyle}><div className={`flex items-center justify-center h-full w-full ${textColor} font-bold text-xs`}>{prob > 0.01 ? prob.toFixed(2) + '%' : ''}</div></td>);
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

// --- DISPLAY DE ANÁLISE (Com Calculadora de Odds) ---
function AnalysisDisplay({ homeTeam, awayTeam, lambdaHome, lambdaAway, competition, date, user }) {
  const [mustWinHome, setMustWinHome] = useState(1);
  const [mustWinAway, setMustWinAway] = useState(1);
  const [desfalquesHome, setDesfalquesHome] = useState(1);
  const [desfalquesAway, setDesfalquesAway] = useState(1);
  const [mando, setMando] = useState(1);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMustWinHome(1); setMustWinAway(1); setDesfalquesHome(1); setDesfalquesAway(1); setMando(1); setSaved(false);
  }, [homeTeam, awayTeam]);

  const adjustedLambdaHome = lambdaHome * mustWinHome * desfalquesHome * mando;
  const adjustedLambdaAway = lambdaAway * mustWinAway * desfalquesAway;
  const probs = calculateProbabilities(adjustedLambdaHome, adjustedLambdaAway);

  const handleSave = async () => {
    if (!user) { alert("Faça login para salvar!"); return; }
    try {
      await addDoc(collection(db, "users_saved_matches"), {
        userId: user.uid, savedAt: new Date(), homeTeam, awayTeam, competition,
        lambdaHome: adjustedLambdaHome, lambdaAway: adjustedLambdaAway, originalDate: date
      });
      setSaved(true);
    } catch (error) { console.error("Erro:", error); }
  };

  return (
    <div className="bg-white shadow-lg rounded-2xl overflow-hidden border border-gray-200 mt-6 transition-all duration-300 animate-fade-in-up">
      <div className="bg-gradient-to-r from-site-primary-900 to-site-primary-700 px-6 py-5 text-white text-center relative overflow-hidden">
         <div className="absolute top-0 left-0 w-full h-full bg-white opacity-5 transform -skew-x-12"></div>
        <span className="relative z-10 text-[10px] font-bold uppercase tracking-widest bg-black/20 px-2 py-1 rounded text-site-primary-50">{LEAGUE_NAMES[competition] || competition}</span>
        <h2 className="relative z-10 text-3xl font-black mt-3 tracking-tight">{homeTeam} <span className="text-white/80 text-xl font-light mx-2">vs</span> {awayTeam}</h2>
        <p className="relative z-10 text-xs font-medium text-site-primary-200 mt-2 uppercase tracking-wide">{date ? `${new Date(date).toLocaleDateString('pt-BR')} • ${new Date(date).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}` : 'Simulação Personalizada'}</p>
        <button onClick={handleSave} disabled={saved} className={`absolute top-4 right-4 z-20 p-2 rounded-full transition-all ${saved ? 'bg-green-500 text-white cursor-default' : 'bg-white/10 hover:bg-white/20 text-white'}`} title="Salvar Palpite">
          {saved ? <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg> : <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>}
        </button>
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
          {/* GRID DE ODDS INTERATIVO */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            <OddBox label="CASA" probability={probs.prob_1} />
            <OddBox label="EMPATE" probability={probs.prob_X} />
            <OddBox label="FORA" probability={probs.prob_2} />
            <OddBox label="OVER 2.5" probability={probs.prob_over_2_5} />
          </div>
          
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-inner flex-grow flex flex-col justify-center items-center">
             <ScoreTable matrix={probs.matrix} homeTeam={homeTeam} awayTeam={awayTeam} />
          </div>
        </div>
      </div>
    </div>
  );
}

// --- DISPLAY DE HISTÓRICO (Simplificado, sem odds) ---
function HistoryMatchDisplay({ match }) {
  const probs = calculateProbabilities(match.lambda_home, match.lambda_away);
  const result = match.scoreHome > match.scoreAway ? '1' : match.scoreAway > match.scoreHome ? '2' : 'X';
  const totalGoals = match.scoreHome + match.scoreAway;
  const isOver25 = totalGoals > 2.5;

  // Componente Simples para Histórico
  const SimpleBox = ({ label, value, highlight }) => {
    const colorClass = highlight ? "bg-purple-100 text-purple-800 border-purple-400 ring-2 ring-purple-400" : "bg-white text-gray-600 border-gray-200";
    return (
      <div className={`flex flex-col items-center p-2 rounded-lg border ${colorClass} flex-1`}>
        <span className="text-[10px] font-bold mb-0.5">{label}</span>
        <span className="text-lg font-extrabold">{value.toFixed(1)}%</span>
      </div>
    );
  };

  return (
    <div className="bg-white shadow rounded-2xl overflow-hidden border border-gray-200 mt-4 animate-fade-in-up">
      <div className="bg-gray-800 px-6 py-4 text-white text-center relative overflow-hidden">
        <span className="relative z-10 text-[10px] font-bold uppercase tracking-widest bg-black/30 px-2 py-1 rounded text-gray-200">{LEAGUE_NAMES[match.competition_code] || match.competition} • Finalizado</span>
        <div className="relative z-10 mt-2 flex justify-center items-center space-x-4">
           <span className="text-xl font-bold text-right w-1/3">{match.homeTeam}</span>
           <div className="bg-white text-gray-900 px-4 py-1 rounded-lg font-black text-2xl shadow-lg">{match.scoreHome} - {match.scoreAway}</div>
           <span className="text-xl font-bold text-left w-1/3">{match.awayTeam}</span>
        </div>
        <p className="relative z-10 text-xs font-medium text-gray-400 mt-2 uppercase tracking-wide">{new Date(match.utcDate).toLocaleDateString('pt-BR')}</p>
      </div>
      <div className="p-6">
          <p className="text-xs text-center font-bold text-gray-400 uppercase mb-4">O que o modelo previu:</p>
          <div className="grid grid-cols-4 gap-3">
            <SimpleBox label="CASA" value={probs.prob_1} highlight={result === '1'} />
            <SimpleBox label="EMPATE" value={probs.prob_X} highlight={result === 'X'} />
            <SimpleBox label="FORA" value={probs.prob_2} highlight={result === '2'} />
            <SimpleBox label="OVER 2.5" value={probs.prob_over_2_5} highlight={isOver25} />
          </div>
      </div>
    </div>
  );
}

// --- Componente para Exibir Palpites Salvos ---
function SavedMatchDisplay({ match, onDelete }) {
  const probs = calculateProbabilities(match.lambdaHome, match.lambdaAway);
  // Reutilizamos o SimpleBox para palpites salvos também (ou pode ser o OddBox se quiser salvar a odd)
  const SimpleBox = ({ label, value }) => (
    <div className="flex flex-col items-center p-2 rounded-lg border bg-white text-gray-600 border-gray-200 flex-1">
      <span className="text-[10px] font-bold mb-0.5">{label}</span>
      <span className="text-lg font-extrabold">{value.toFixed(1)}%</span>
    </div>
  );

  return (
    <div className="bg-white shadow rounded-2xl overflow-hidden border border-gray-200 mt-4 animate-fade-in-up relative group">
      <button onClick={() => onDelete(match.id)} className="absolute top-2 right-2 z-20 bg-red-100 text-red-500 p-1.5 rounded-full hover:bg-red-500 hover:text-white transition-all opacity-100 md:opacity-0 group-hover:opacity-100" title="Excluir">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
      </button>
      <div className="bg-indigo-50 px-6 py-3 text-center border-b border-indigo-100">
        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 block mb-1">{LEAGUE_NAMES[match.competition] || match.competition}</span>
        <div className="flex justify-center items-center space-x-2"><span className="text-lg font-bold text-site-primary-900">{match.homeTeam}</span><span className="text-sm text-gray-400">vs</span><span className="text-lg font-bold text-site-primary-900">{match.awayTeam}</span></div>
        <p className="text-[10px] text-gray-400 mt-1">Salvo em: {new Date(match.savedAt.seconds * 1000).toLocaleDateString('pt-BR')}</p>
      </div>
      <div className="p-4"><div className="grid grid-cols-4 gap-2">
        <SimpleBox label="CASA" value={probs.prob_1} />
        <SimpleBox label="EMPATE" value={probs.prob_X} />
        <SimpleBox label="FORA" value={probs.prob_2} />
        <SimpleBox label="OVER 2.5" value={probs.prob_over_2_5} />
      </div></div>
    </div>
  );
}

// --- Modal Login (Mantido igual) ---
function LoginModal({ isOpen, onClose, onLoginSuccess }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  if (!isOpen) return null;
  const handleSubmit = async (e) => {
    e.preventDefault(); setError("");
    try { if (isRegistering) await createUserWithEmailAndPassword(auth, email, password); else await signInWithEmailAndPassword(auth, email, password); onLoginSuccess(); onClose(); } catch (err) { setError(err.message.includes("auth/invalid-credential") ? "Email ou senha incorretos." : err.message); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md relative animate-fade-in-up">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">✕</button>
        <h2 className="text-2xl font-black text-site-primary-900 mb-2 text-center">{isRegistering ? "Criar Conta" : "Bem-vindo de volta"}</h2>
        <p className="text-sm text-gray-500 text-center mb-6">Acesse análises avançadas do ROI+</p>
        {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label><input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-site-primary-500 outline-none" placeholder="seu@email.com" /></div>
          <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Senha</label><input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-site-primary-500 outline-none" placeholder="******" /></div>
          <button type="submit" className="w-full bg-site-primary-600 hover:bg-site-primary-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-site-primary-900/20">{isRegistering ? "Cadastrar" : "Entrar"}</button>
        </form>
        <div className="mt-6 text-center text-sm"><button onClick={() => setIsRegistering(!isRegistering)} className="text-site-primary-600 font-semibold hover:underline">{isRegistering ? "Já tem conta? Faça Login" : "Não tem conta? Cadastre-se"}</button></div>
      </div>
    </div>
  );
}

// --- App (Mantido igual) ---
function App() {
  const [allMatches, setAllMatches] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [historyMatches, setHistoryMatches] = useState([]);
  const [savedMatches, setSavedMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('matches');
  const [selectedLeagueMatch, setSelectedLeagueMatch] = useState("");
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [selectedLeagueHistory, setSelectedLeagueHistory] = useState("");
  const [simLeague, setSimLeague] = useState("");
  const [simHomeTeamId, setSimHomeTeamId] = useState("");
  const [simAwayTeamId, setSimAwayTeamId] = useState("");
  const [user, setUser] = useState(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) fetchSavedMatches(currentUser.uid); else setSavedMatches([]);
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
      } catch (error) { console.error("Erro:", error); setLoading(false); }
    };
    fetchData();
    return () => unsubscribe();
  }, []);

  const fetchSavedMatches = async (uid) => {
    try {
      const q = query(collection(db, "users_saved_matches"), where("userId", "==", uid));
      const querySnapshot = await getDocs(q);
      const savedData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      savedData.sort((a, b) => b.savedAt.seconds - a.savedAt.seconds);
      setSavedMatches(savedData);
    } catch (error) { console.error("Erro ao buscar salvos:", error); }
  };
  const handleDeleteSaved = async (docId) => {
    if (!confirm("Deseja excluir?")) return;
    try { await deleteDoc(doc(db, "users_saved_matches", docId)); setSavedMatches(prev => prev.filter(m => m.id !== docId)); } catch (error) { console.error("Erro:", error); }
  };

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
  const handleLogout = async () => { await signOut(auth); };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-site-primary-50"><div className="flex flex-col items-center"><div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-site-primary-900 mb-4"></div><p className="text-gray-400 text-sm font-medium animate-pulse">Carregando dados...</p></div></div>;

  return (
    <div className="min-h-screen bg-site-primary-50 py-8 px-4 sm:px-6 lg:px-8 font-sans text-gray-800 relative">
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} onLoginSuccess={() => setIsLoginOpen(false)} />
      <div className="max-w-6xl mx-auto pb-16"> 
        <div className="flex justify-end mb-4">
          {user ? (
            <div className="flex items-center space-x-4 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-200">
              <div className="flex flex-col text-right"><span className="text-[10px] font-bold text-gray-400 uppercase">Logado como</span><span className="text-xs font-bold text-site-primary-700">{user.email.split('@')[0]}</span></div>
              <button onClick={handleLogout} className="text-xs font-bold text-red-500 hover:text-red-700">Sair</button>
            </div>
          ) : (
            <button onClick={() => setIsLoginOpen(true)} className="bg-white hover:bg-gray-50 text-site-primary-700 font-bold py-2 px-6 rounded-full shadow-sm border border-gray-200 text-sm transition-all flex items-center"><span className="mr-2">🔐</span> Entrar / Cadastrar</button>
          )}
        </div>
        <div className="flex flex-col items-center mb-8"><img src={logoImg} alt="Logo ROI+" className="w-52 mb-6 rounded-2xl shadow-sm" /></div>
        <div className="flex justify-center mb-8 overflow-x-auto">
          <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-200 inline-flex whitespace-nowrap">
            <button onClick={() => setActiveTab('matches')} className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'matches' ? 'bg-site-primary-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}>📅 Próximos Jogos</button>
            <button onClick={() => setActiveTab('simulator')} className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'simulator' ? 'bg-site-primary-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}>⚽ Simulador</button>
            <button onClick={() => setActiveTab('history')} className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'history' ? 'bg-site-primary-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}>✅ Histórico (7 Dias)</button>
            {user && <button onClick={() => setActiveTab('saved')} className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'saved' ? 'bg-site-primary-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}>💾 Meus Palpites</button>}
          </div>
        </div>

        {activeTab === 'matches' && (
          <>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-8 max-w-4xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><label className="block text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">1. Campeonato</label><select value={selectedLeagueMatch} onChange={(e) => { setSelectedLeagueMatch(e.target.value); setSelectedMatchId(""); }} className="block w-full pl-4 pr-10 py-3 text-base border-gray-200 focus:outline-none focus:ring-2 focus:ring-site-primary-500 focus:border-transparent sm:text-sm rounded-xl bg-gray-50 hover:bg-white transition-all cursor-pointer text-gray-700 font-medium border"><option value="">Selecione uma Liga...</option>{uniqueLeaguesMatches.map(code => <option key={code} value={code}>{LEAGUE_NAMES[code] || code}</option>)}</select></div>
                <div><label className="block text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">2. Partida</label><select value={selectedMatchId} onChange={(e) => setSelectedMatchId(e.target.value)} disabled={!selectedLeagueMatch} className="block w-full pl-4 pr-10 py-3 text-base border-gray-200 focus:outline-none focus:ring-2 focus:ring-site-primary-500 focus:border-transparent sm:text-sm rounded-xl bg-gray-50 hover:bg-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 font-medium border"><option value="">{selectedLeagueMatch ? (filteredMatches.length > 0 ? "Selecione o Jogo..." : "Nenhum jogo encontrado") : "Aguardando Liga..."}</option>{filteredMatches.map(m => <option key={m.id} value={m.id}>{m.homeTeam} vs {m.awayTeam}</option>)}</select></div>
              </div>
            </div>
            {currentMatch ? <AnalysisDisplay homeTeam={currentMatch.homeTeam} awayTeam={currentMatch.awayTeam} lambdaHome={currentMatch.lambda_home} lambdaAway={currentMatch.lambda_away} competition={currentMatch.competition_code} date={currentMatch.utcDate} user={user} /> : <div className="flex flex-col items-center justify-center py-20 text-gray-300 border-2 border-dashed border-gray-200 rounded-3xl bg-site-primary-900/5"><p className="font-medium text-gray-400">Selecione um jogo agendado</p></div>}
          </>
        )}

        {activeTab === 'simulator' && (
          <>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-8 max-w-4xl mx-auto border-l-4 border-l-site-primary-500">
              <h3 className="text-sm font-bold text-gray-800 uppercase mb-4 flex items-center"><span className="bg-site-primary-100 text-site-primary-700 p-1 rounded mr-2">⚽</span> Simulação Personalizada</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label className="block text-xs font-bold text-gray-400 uppercase mb-2">Campeonato</label><select value={simLeague} onChange={(e) => { setSimLeague(e.target.value); setSimHomeTeamId(""); setSimAwayTeamId(""); }} className="block w-full pl-3 pr-8 py-2 text-sm border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-site-primary-500 border"><option value="">Escolha a Liga...</option>{uniqueLeaguesSim.map(l => <option key={l} value={l}>{LEAGUE_NAMES[l] || l}</option>)}</select></div>
                <div><label className="block text-xs font-bold text-gray-400 uppercase mb-2">Time Mandante</label><select value={simHomeTeamId} onChange={(e) => setSimHomeTeamId(e.target.value)} disabled={!simLeague} className="block w-full pl-3 pr-8 py-2 text-sm border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-site-primary-500 border disabled:opacity-50"><option value="">Escolha o Mandante...</option>{teamsInSimLeague.map(t => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}</select></div>
                <div><label className="block text-xs font-bold text-gray-400 uppercase mb-2">Time Visitante</label><select value={simAwayTeamId} onChange={(e) => setSimAwayTeamId(e.target.value)} disabled={!simLeague} className="block w-full pl-3 pr-8 py-2 text-sm border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-site-primary-500 border disabled:opacity-50"><option value="">Escolha o Visitante...</option>{teamsInSimLeague.filter(t => t.team_id !== parseInt(simHomeTeamId)).map(t => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}</select></div>
              </div>
            </div>
            {(simLambdaHome > 0 && simLambdaAway > 0) ? <AnalysisDisplay homeTeam={simHomeTeamName} awayTeam={simAwayTeamName} lambdaHome={simLambdaHome} lambdaAway={simLambdaAway} competition={simLeague} date={null} user={user} /> : <div className="flex flex-col items-center justify-center py-20 text-gray-300 border-2 border-dashed border-gray-200 rounded-3xl bg-site-primary-900/5"><p className="font-medium text-gray-400">Configure a simulação acima</p></div>}
          </>
        )}

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

        {activeTab === 'saved' && user && (
          <div className="space-y-6">
            {savedMatches.length > 0 ? savedMatches.map(match => <SavedMatchDisplay key={match.id} match={match} onDelete={handleDeleteSaved} />) : <div className="flex flex-col items-center justify-center py-20 text-gray-300 border-2 border-dashed border-gray-200 rounded-3xl bg-site-primary-900/5"><p className="font-medium text-gray-400">Você ainda não salvou nenhum palpite.</p><p className="text-xs mt-2 text-gray-400">Vá em "Próximos Jogos" ou "Simulador" e clique no ícone de salvar.</p></div>}
          </div>
        )}
      </div>

      <div className="mt-12 pt-8 border-t border-gray-200 flex flex-col md:flex-row justify-between items-center text-gray-400 text-xs max-w-6xl mx-auto px-4">
        <div className="mb-4 md:mb-0">&copy; {new Date().getFullYear()} ROI+ Analytics.</div>
        <a href="https://www.instagram.com/roistats" target="_blank" rel="noopener noreferrer" className="flex items-center space-x-2 hover:text-site-primary-600 transition-colors group">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feather feather-instagram group-hover:stroke-site-primary-600 transition-colors"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
          <span className="font-bold text-lg group-hover:text-site-primary-600 transition-colors">roistats</span>
        </a>
      </div>
    </div>
  );
}

export default App;