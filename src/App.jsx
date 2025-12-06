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
    <input type="range" min={min} max={max} step="0.1" value={value} onChange={e => setValue(parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-site-primary-900" />
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

const OddBox = ({ label, probability }) => {
  const [userOdd, setUserOdd] = useState("");
  const fairOdd = probability > 0 ? (100 / probability) : 0;
  const hasValue = userOdd && parseFloat(userOdd) > fairOdd;
  const evPercentage = userOdd ? ((parseFloat(userOdd) / fairOdd) - 1) * 100 : 0;

  return (
    <div className={`flex flex-col p-3 rounded-xl border flex-1 min-w-[90px] shadow-sm transition-all ${hasValue ? 'bg-green-50 border-green-300 ring-1 ring-green-400' : 'bg-white border-gray-200'}`}>
      <div className="flex justify-between items-center mb-2 border-b border-gray-100 pb-2">
        <span className="text-[10px] font-bold uppercase text-gray-500">{label}</span>
        <span className="text-xs font-bold text-site-primary-600">{probability.toFixed(1)}%</span>
      </div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-[9px] text-gray-400 uppercase">Justa:</span>
        <span className="text-sm font-bold text-gray-700">@{fairOdd.toFixed(2)}</span>
      </div>
      <div className="relative">
        <input type="number" step="0.01" placeholder="Odd?" value={userOdd} onChange={(e) => setUserOdd(e.target.value)} className={`w-full text-center text-sm font-bold p-1 rounded border focus:outline-none ${hasValue ? 'bg-green-100 text-green-800 border-green-300' : 'bg-gray-50 text-gray-600 border-gray-200'}`} />
      </div>
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

// --- Componente de ANÁLISE COMPLETA (FT/HT, Escudos e xG) ---
function AnalysisDisplay({ homeTeam, awayTeam, homeCrest, awayCrest, lambdaHomeFT, lambdaAwayFT, lambdaHomeHT, lambdaAwayHT, competition, date, user }) {
  const [mustWinHome, setMustWinHome] = useState(1);
  const [mustWinAway, setMustWinAway] = useState(1);
  const [desfalquesHome, setDesfalquesHome] = useState(1);
  const [desfalquesAway, setDesfalquesAway] = useState(1);
  const [mando, setMando] = useState(1);
  const [saved, setSaved] = useState(false);
  
  // NOVO: Estado para controlar FT ou HT
  const [mode, setMode] = useState('ft'); // 'ft' = Full Time, 'ht' = Half Time

  useEffect(() => {
    setMustWinHome(1); setMustWinAway(1); setDesfalquesHome(1); setDesfalquesAway(1); setMando(1); setSaved(false);
    setMode('ft'); // Reseta para FT ao mudar o jogo
  }, [homeTeam, awayTeam]);

  // Define quais lambdas usar com base no modo
  const baseLambdaHome = mode === 'ft' ? lambdaHomeFT : lambdaHomeHT;
  const baseLambdaAway = mode === 'ft' ? lambdaAwayFT : lambdaAwayHT;

  const adjustedLambdaHome = baseLambdaHome * mustWinHome * desfalquesHome * mando;
  const adjustedLambdaAway = baseLambdaAway * mustWinAway * desfalquesAway;
  
  const probs = calculateProbabilities(adjustedLambdaHome, adjustedLambdaAway);

  const handleSave = async () => {
    if (!user) { alert("Faça login para salvar!"); return; }
    try {
      await addDoc(collection(db, "users_saved_matches"), {
        userId: user.uid, savedAt: new Date(), homeTeam, awayTeam, competition,
        // Salva apenas os dados do FT por padrão no histórico
        lambdaHome: lambdaHomeFT * mustWinHome * desfalquesHome * mando, 
        lambdaAway: lambdaAwayFT * mustWinAway * desfalquesAway, 
        originalDate: date
      });
      setSaved(true);
    } catch (error) { console.error("Erro:", error); }
  };

  return (
    <div className="bg-white shadow-lg rounded-2xl overflow-hidden border border-gray-200 mt-6 transition-all duration-300 animate-fade-in-up">
      {/* Cabeçalho */}
      <div className="bg-gradient-to-r from-site-primary-900 to-site-primary-700 px-6 py-6 text-white text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-white opacity-5 transform -skew-x-12"></div>
        
        {/* Topo: Liga e Botão Salvar */}
        <div className="flex justify-between items-start relative z-10 mb-2">
             <span className="text-[10px] font-bold uppercase tracking-widest bg-black/20 px-2 py-1 rounded text-site-primary-50">
               {LEAGUE_NAMES[competition] || competition}
             </span>
             <button onClick={handleSave} disabled={saved} className={`p-2 rounded-full transition-all ${saved ? 'bg-green-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`} title="Salvar Palpite">
                {saved ? <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg> : <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>}
             </button>
        </div>

        {/* Placar com Escudos */}
        <div className="flex items-center justify-center space-x-6 relative z-10">
            {/* Mandante */}
            <div className="flex flex-col items-center w-1/3">
               {homeCrest ? <img src={homeCrest} alt={homeTeam} className="h-16 w-16 object-contain mb-2 drop-shadow-md bg-white rounded-full p-1" /> : <div className="h-16 w-16 bg-white/10 rounded-full mb-2 flex items-center justify-center text-2xl">⚽</div>}
               <h2 className="text-lg md:text-2xl font-black leading-tight">{homeTeam}</h2>
            </div>

            {/* VS e xG */}
            <div className="flex flex-col items-center">
               <span className="text-site-primary-200 text-2xl font-light">vs</span>
               <div className="mt-2 bg-black/20 px-3 py-1 rounded text-xs font-mono text-site-primary-100" title="Expectativa Estatística de Gols">
                  xG: {adjustedLambdaHome.toFixed(2)} - {adjustedLambdaAway.toFixed(2)}
               </div>
            </div>

            {/* Visitante */}
            <div className="flex flex-col items-center w-1/3">
               {awayCrest ? <img src={awayCrest} alt={awayTeam} className="h-16 w-16 object-contain mb-2 drop-shadow-md bg-white rounded-full p-1" /> : <div className="h-16 w-16 bg-white/10 rounded-full mb-2 flex items-center justify-center text-2xl">⚽</div>}
               <h2 className="text-lg md:text-2xl font-black leading-tight">{awayTeam}</h2>
            </div>
        </div>

        <p className="relative z-10 text-xs font-medium text-site-primary-200 mt-4 uppercase tracking-wide">
          {date ? `${new Date(date).toLocaleDateString('pt-BR')} • ${new Date(date).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}` : 'Simulação'}
        </p>
      </div>

      {/* SELETOR HT/FT */}
      <div className="bg-gray-100 border-b border-gray-200 flex justify-center p-2">
         <div className="bg-white p-1 rounded-lg shadow-sm border border-gray-200 inline-flex">
            <button onClick={() => setMode('ft')} className={`px-4 py-1 text-xs font-bold rounded-md transition-all ${mode === 'ft' ? 'bg-site-primary-600 text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}>Jogo Completo (FT)</button>
            <button onClick={() => setMode('ht')} className={`px-4 py-1 text-xs font-bold rounded-md transition-all ${mode === 'ht' ? 'bg-site-primary-600 text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}>1º Tempo (HT)</button>
         </div>
      </div>

      <div className="p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 bg-gray-50">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-4 border-b border-gray-100 pb-2">Ajustes</h3>
            <SliderInput label={`Must Win (${homeTeam})`} value={mustWinHome} setValue={setMustWinHome} min="0.6" max="1.5" />
            <SliderInput label={`Desfalques (${homeTeam})`} value={desfalquesHome} setValue={setDesfalquesHome} min="0.5" max="1" />
            <SliderInput label="Força Mando" value={mando} setValue={setMando} min="0.8" max="1.5" />
            <div className="my-4 border-t border-gray-100"></div>
            <SliderInput label={`Must Win (${awayTeam})`} value={mustWinAway} setValue={setMustWinAway} min="0.6" max="1.5" />
            <SliderInput label={`Desfalques (${awayTeam})`} value={desfalquesAway} setValue={setDesfalquesAway} min="0.5" max="1" />
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col">
          <div className="grid grid-cols-4 gap-3 mb-6">
            <OddBox label="CASA" probability={probs.prob_1} />
            <OddBox label="EMPATE" probability={probs.prob_X} />
            <OddBox label="FORA" probability={probs.prob_2} />
            <OddBox label={mode === 'ht' ? "OVER 1.5 (HT)" : "OVER 2.5"} probability={probs.prob_over_2_5} /> 
            {/* Nota: O cálculo Over é genérico no backend, mas visualmente indicamos HT */}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex-grow flex flex-col justify-center items-center">
             <ScoreTable matrix={probs.matrix} homeTeam={homeTeam} awayTeam={awayTeam} />
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Componentes de Histórico e Salvos (Simplificados) ---
// Nota: Eles não usam escudos por enquanto pois o histórico antigo não tem
function HistoryMatchDisplay({ match }) {
  const probs = calculateProbabilities(match.lambda_home, match.lambda_away); // Histórico só tem lambda antigo por enquanto
  const result = match.scoreHome > match.scoreAway ? '1' : match.scoreAway > match.scoreHome ? '2' : 'X';
  return (
    <div className="bg-white shadow rounded-2xl overflow-hidden border border-gray-200 mt-4 animate-fade-in-up">
      <div className="bg-gray-800 px-6 py-3 text-white text-center">
        <span className="text-[10px] font-bold uppercase text-gray-400">{LEAGUE_NAMES[match.competition_code] || match.competition} • {new Date(match.utcDate).toLocaleDateString('pt-BR')}</span>
        <div className="flex justify-center items-center space-x-4 mt-1"><span className="text-lg font-bold w-1/3 text-right">{match.homeTeam}</span><span className="bg-white text-gray-900 px-3 rounded font-black text-xl">{match.scoreHome} - {match.scoreAway}</span><span className="text-lg font-bold w-1/3 text-left">{match.awayTeam}</span></div>
      </div>
      <div className="p-4 grid grid-cols-4 gap-2">
         <ProbBox label="1" value={probs.prob_1} highlight={result === '1'} />
         <ProbBox label="X" value={probs.prob_X} highlight={result === 'X'} />
         <ProbBox label="2" value={probs.prob_2} highlight={result === '2'} />
         <ProbBox label="+2.5" value={probs.prob_over_2_5} highlight={(match.scoreHome + match.scoreAway) > 2.5} />
      </div>
    </div>
  );
}

function SavedMatchDisplay({ match, onDelete }) {
    const probs = calculateProbabilities(match.lambdaHome, match.lambdaAway);
    const isFinished = match.status === 'FINISHED' || (match.finalScoreHome !== undefined);
    const result = isFinished ? (match.finalScoreHome > match.finalScoreAway ? '1' : match.finalScoreAway > match.finalScoreHome ? '2' : 'X') : null;
    const SimpleBox = ({ label, value, highlight }) => (<div className={`flex flex-col items-center p-2 rounded-lg border flex-1 ${highlight ? "bg-purple-100 text-purple-800 border-purple-400 ring-2 ring-purple-400" : "bg-white text-gray-600 border-gray-200"}`}><span className="text-[10px] font-bold">{label}</span><span className="text-lg font-extrabold">{value.toFixed(1)}%</span></div>);
    return (
      <div className="bg-white shadow rounded-2xl overflow-hidden border border-gray-200 mt-4 relative group">
        <button onClick={() => onDelete(match.id)} className="absolute top-2 right-2 z-20 bg-red-100 text-red-500 p-1 rounded-full opacity-100 md:opacity-0 group-hover:opacity-100"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
        <div className={`${isFinished ? 'bg-gray-800 text-white' : 'bg-site-primary-50 text-site-primary-900'} px-6 py-3 text-center border-b border-gray-200`}>
          <span className="text-[10px] font-bold uppercase block mb-1 opacity-70">{LEAGUE_NAMES[match.competition] || match.competition} {isFinished && "• FINALIZADO"}</span>
          <div className="flex justify-center items-center space-x-2"><span className="text-lg font-bold">{match.homeTeam}</span>{isFinished ? <span className="bg-white text-gray-900 px-2 rounded font-bold text-lg">{match.finalScoreHome}-{match.finalScoreAway}</span> : <span className="text-sm">vs</span>}<span className="text-lg font-bold">{match.awayTeam}</span></div>
        </div>
        <div className="p-4 grid grid-cols-4 gap-2"><SimpleBox label="1" value={probs.prob_1} highlight={result === '1'} /><SimpleBox label="X" value={probs.prob_X} highlight={result === 'X'} /><SimpleBox label="2" value={probs.prob_2} highlight={result === '2'} /><SimpleBox label="+2.5" value={probs.prob_over_2_5} highlight={isFinished && (match.finalScoreHome + match.finalScoreAway) > 2.5} /></div>
      </div>
    );
}

// --- Componentes Principais (Mantidos) ---
function LoginModal({ isOpen, onClose, onLoginSuccess }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  if (!isOpen) return null;
  const handleSubmit = async (e) => { e.preventDefault(); setError(""); try { if (isRegistering) await createUserWithEmailAndPassword(auth, email, password); else await signInWithEmailAndPassword(auth, email, password); onLoginSuccess(); onClose(); } catch (err) { setError(err.message); } };
  return (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4"><div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md relative"><button onClick={onClose} className="absolute top-4 right-4">✕</button><h2 className="text-2xl font-black text-center mb-2">{isRegistering ? "Criar Conta" : "Entrar"}</h2><form onSubmit={handleSubmit} className="space-y-4"><input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 border rounded" placeholder="Email" /><input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 border rounded" placeholder="Senha" /><button type="submit" className="w-full bg-site-primary-600 text-white font-bold py-3 rounded">{isRegistering ? "Cadastrar" : "Entrar"}</button></form><div className="mt-4 text-center"><button onClick={() => setIsRegistering(!isRegistering)} className="text-blue-600 text-sm">Mudar para {isRegistering ? "Login" : "Cadastro"}</button></div></div></div>);
}

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
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => { setUser(currentUser); if (currentUser) fetchSavedMatches(currentUser.uid); else setSavedMatches([]); });
    const fetchData = async () => {
      try {
        setLoading(true);
        const qMatches = query(collection(db, "jogos_analise"), orderBy("utcDate", "asc"));
        const matchesSnap = await getDocs(qMatches);
        
        const now = new Date();
        const cutoffTime = new Date(now.getTime() - 4 * 60 * 60 * 1000);

        const matchesData = matchesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(m => m.lambda_home_ft !== undefined) // VERIFICAÇÃO V4.0 (novos campos)
          .filter(m => new Date(m.utcDate) > cutoffTime);
        setAllMatches(matchesData);

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

  const fetchSavedMatches = async (uid) => { try { const q = query(collection(db, "users_saved_matches"), where("userId", "==", uid)); const s = await getDocs(q); setSavedMatches(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b)=>b.savedAt-a.savedAt)); } catch (e) {} };
  const handleDeleteSaved = async (id) => { if(confirm("Excluir?")) { await deleteDoc(doc(db, "users_saved_matches", id)); setSavedMatches(p => p.filter(m => m.id !== id)); } };

  const uniqueLeaguesMatches = [...new Set(allMatches.map(m => m.competition_code || m.competition))].sort();
  const filteredMatches = selectedLeagueMatch ? allMatches.filter(m => (m.competition_code || m.competition) === selectedLeagueMatch) : [];
  const currentMatch = allMatches.find(m => m.id === selectedMatchId);
  
  const matchesByDate = filteredMatches.reduce((acc, match) => {
    const dateStr = new Date(match.utcDate).toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric' });
    const formattedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    if (!acc[formattedDate]) acc[formattedDate] = [];
    acc[formattedDate].push(match);
    return acc;
  }, {});

  const uniqueLeaguesSim = [...new Set(allTeams.map(t => t.league))].sort();
  const teamsInSimLeague = simLeague ? allTeams.filter(t => t.league === simLeague).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const uniqueLeaguesHistory = [...new Set(historyMatches.map(m => m.competition_code || m.competition))].sort();
  const filteredHistoryMatches = selectedLeagueHistory ? historyMatches.filter(m => (m.competition_code || m.competition) === selectedLeagueHistory) : historyMatches;

  let simLambdaHomeFT = 0, simLambdaAwayFT = 0, simLambdaHomeHT = 0, simLambdaAwayHT = 0;
  let simHomeTeamName = "", simAwayTeamName = "", simHomeCrest = "", simAwayCrest = "";

  if (simHomeTeamId && simAwayTeamId && simHomeTeamId !== simAwayTeamId) {
    const h = allTeams.find(t => t.team_id === parseInt(simHomeTeamId));
    const a = allTeams.find(t => t.team_id === parseInt(simAwayTeamId));
    if (h && a) {
      simHomeTeamName = h.name; simAwayTeamName = a.name;
      simHomeCrest = h.crest; simAwayCrest = a.crest;
      // CÁLCULO FT
      simLambdaHomeFT = h.FO_home_ft * a.FD_away_ft * h.league_avg_home_ft;
      simLambdaAwayFT = a.FO_away_ft * h.FD_home_ft * a.league_avg_away_ft;
      // CÁLCULO HT
      simLambdaHomeHT = h.FO_home_ht * a.FD_away_ht * h.league_avg_home_ht;
      simLambdaAwayHT = a.FO_away_ht * h.FD_home_ht * a.league_avg_away_ht;
    }
  }

  const handleLogout = async () => { await signOut(auth); };
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-site-primary-50"><div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-site-primary-900"></div></div>;

  return (
    <div className="min-h-screen bg-site-primary-50 py-8 px-4 sm:px-6 lg:px-8 font-sans text-gray-800 relative">
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} onLoginSuccess={() => setIsLoginOpen(false)} />
      <div className="max-w-6xl mx-auto pb-16">
        <div className="flex justify-end mb-4">
          {user ? <div className="flex items-center space-x-4 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-200"><span className="text-xs font-bold text-site-primary-700">{user.email.split('@')[0]}</span><button onClick={handleLogout} className="text-xs font-bold text-red-500">Sair</button></div> : <button onClick={() => setIsLoginOpen(true)} className="bg-white text-site-primary-700 font-bold py-2 px-6 rounded-full shadow-sm border border-gray-200 text-sm">🔐 Entrar</button>}
        </div>
        <div className="flex flex-col items-center mb-8"><img src={logoImg} alt="Logo ROI+" className="w-52 mb-6 rounded-2xl shadow-sm" /></div>
        <div className="flex justify-center mb-8 overflow-x-auto"><div className="bg-white p-1 rounded-xl shadow-sm border border-gray-200 inline-flex whitespace-nowrap"><button onClick={() => setActiveTab('matches')} className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'matches' ? 'bg-site-primary-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}>📅 Próximos Jogos</button><button onClick={() => setActiveTab('simulator')} className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'simulator' ? 'bg-site-primary-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}>⚽ Simulador</button><button onClick={() => setActiveTab('history')} className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'history' ? 'bg-site-primary-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}>✅ Histórico</button>{user && <button onClick={() => setActiveTab('saved')} className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'saved' ? 'bg-site-primary-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}>💾 Palpites</button>}</div></div>

        {activeTab === 'matches' && (
          <>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-8 max-w-4xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><label className="block text-xs font-bold text-gray-400 uppercase mb-2">1. Campeonato</label><select value={selectedLeagueMatch} onChange={(e) => { setSelectedLeagueMatch(e.target.value); setSelectedMatchId(""); }} className="block w-full pl-4 pr-10 py-3 text-base border-gray-200 focus:outline-none focus:ring-2 focus:ring-site-primary-500 rounded-xl bg-gray-50 hover:bg-white border"><option value="">Selecione...</option>{uniqueLeaguesMatches.map(code => <option key={code} value={code}>{LEAGUE_NAMES[code] || code}</option>)}</select></div>
                <div><label className="block text-xs font-bold text-gray-400 uppercase mb-2">2. Partida</label><select value={selectedMatchId} onChange={(e) => setSelectedMatchId(e.target.value)} disabled={!selectedLeagueMatch} className="block w-full pl-4 pr-10 py-3 text-base border-gray-200 focus:outline-none focus:ring-2 focus:ring-site-primary-500 rounded-xl bg-gray-50 hover:bg-white border"><option value="">{selectedLeagueMatch ? "Selecione..." : "..."}</option>{Object.keys(matchesByDate).map(d => <optgroup key={d} label={d}>{matchesByDate[d].map(m => <option key={m.id} value={m.id}>{m.homeTeam} vs {m.awayTeam} ({new Date(m.utcDate).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})})</option>)}</optgroup>)}</select></div>
              </div>
            </div>
            {currentMatch ? <AnalysisDisplay 
              homeTeam={currentMatch.homeTeam} awayTeam={currentMatch.awayTeam} 
              homeCrest={currentMatch.homeTeamCrest} awayCrest={currentMatch.awayTeamCrest}
              lambdaHomeFT={currentMatch.lambda_home_ft} lambdaAwayFT={currentMatch.lambda_away_ft}
              lambdaHomeHT={currentMatch.lambda_home_ht} lambdaAwayHT={currentMatch.lambda_away_ht}
              competition={currentMatch.competition_code} date={currentMatch.utcDate} user={user} 
            /> : null}
          </>
        )}

        {activeTab === 'simulator' && (
          <>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-8 max-w-4xl mx-auto border-l-4 border-l-site-primary-500">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label className="block text-xs font-bold text-gray-400 uppercase mb-2">Campeonato</label><select value={simLeague} onChange={(e) => { setSimLeague(e.target.value); setSimHomeTeamId(""); setSimAwayTeamId(""); }} className="block w-full pl-3 pr-8 py-2 text-sm border-gray-200 rounded-lg bg-gray-50 border"><option value="">...</option>{uniqueLeaguesSim.map(l => <option key={l} value={l}>{LEAGUE_NAMES[l] || l}</option>)}</select></div>
                <div><label className="block text-xs font-bold text-gray-400 uppercase mb-2">Mandante</label><select value={simHomeTeamId} onChange={(e) => setSimHomeTeamId(e.target.value)} disabled={!simLeague} className="block w-full pl-3 pr-8 py-2 text-sm border-gray-200 rounded-lg bg-gray-50 border"><option value="">...</option>{teamsInSimLeague.map(t => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}</select></div>
                <div><label className="block text-xs font-bold text-gray-400 uppercase mb-2">Visitante</label><select value={simAwayTeamId} onChange={(e) => setSimAwayTeamId(e.target.value)} disabled={!simLeague} className="block w-full pl-3 pr-8 py-2 text-sm border-gray-200 rounded-lg bg-gray-50 border"><option value="">...</option>{teamsInSimLeague.filter(t => t.team_id !== parseInt(simHomeTeamId)).map(t => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}</select></div>
              </div>
            </div>
            {(simLambdaHomeFT > 0) ? <AnalysisDisplay 
              homeTeam={simHomeTeamName} awayTeam={simAwayTeamName} 
              homeCrest={simHomeCrest} awayCrest={simAwayCrest}
              lambdaHomeFT={simLambdaHomeFT} lambdaAwayFT={simLambdaAwayFT}
              lambdaHomeHT={simLambdaHomeHT} lambdaAwayHT={simLambdaAwayHT}
              competition={simLeague} date={null} user={user} 
            /> : null}
          </>
        )}

        {activeTab === 'history' && <div className="space-y-6">{filteredHistoryMatches.map(m => <HistoryMatchDisplay key={m.id} match={m} />)}</div>}
        {activeTab === 'saved' && <div className="space-y-6">{savedMatches.map(m => <SavedMatchDisplay key={m.id} match={m} onDelete={handleDeleteSaved} />)}</div>}
      </div>
      <div className="mt-12 pt-8 border-t border-gray-200 flex justify-between items-center text-gray-400 text-xs max-w-6xl mx-auto px-4">
        <div>&copy; {new Date().getFullYear()} ROI+ Analytics.</div>
        <a href="https://www.instagram.com/roistats" target="_blank" className="flex items-center space-x-2 hover:text-site-primary-600 font-bold"><span>roistats</span></a>
      </div>
    </div>
  );
}

export default App;
