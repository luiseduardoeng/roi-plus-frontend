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

const STATUS_TRANSLATE = {
  'SCHEDULED': 'Agendado', 'TIMED': 'Agendado', 'IN_PLAY': 'Em Jogo', 'PAUSED': 'Intervalo',
  'FINISHED': 'Finalizado', 'SUSPENDED': 'Suspenso', 'POSTPONED': 'Adiado'
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

// --- Componentes UI (Mantidos) ---
const SliderInput = ({ label, value, setValue, min, max }) => (
  <div className="flex flex-col mb-3 group">
    <div className="flex justify-between items-center mb-1">
      <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider group-hover:text-cyan-300 transition-colors">{label}</span>
      <span className="text-[10px] font-bold text-white bg-white/10 px-2 py-0.5 rounded-full border border-white/10 shadow-inner">{value}</span>
    </div>
    <input type="range" min={min} max={max} step="0.1" value={value} onChange={e => setValue(parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 hover:accent-cyan-400 transition-colors" />
  </div>
);

const ProbBox = ({ label, value, highlight = false }) => {
  const colorClass = highlight
    ? "bg-purple-500/20 text-purple-200 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.3)]" 
    : value > 50 
      ? "bg-green-500/10 text-green-300 border-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.1)]" 
      : "bg-slate-800/50 text-gray-400 border-gray-700";

  return (
    <div className={`flex flex-col items-center p-2 rounded-xl border ${colorClass} flex-1 min-w-[70px] transition-all duration-300 backdrop-blur-sm`}>
      <span className="text-[9px] font-bold mb-0.5 text-center uppercase tracking-widest opacity-80">{label}</span>
      <span className="text-lg font-black tracking-tight">{value.toFixed(1)}%</span>
    </div>
  );
};

const OddBox = ({ label, probability }) => {
  const [userOdd, setUserOdd] = useState("");
  const fairOdd = probability > 0 ? (100 / probability) : 0;
  const hasValue = userOdd && parseFloat(userOdd) > fairOdd;
  const evPercentage = userOdd ? ((parseFloat(userOdd) / fairOdd) - 1) * 100 : 0;

  return (
    <div className={`flex flex-col p-3 rounded-xl border flex-1 min-w-[90px] transition-all duration-300 backdrop-blur-md ${hasValue ? 'bg-green-900/20 border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : 'bg-slate-800/40 border-gray-700 hover:border-gray-600'}`}>
      <div className="flex justify-between items-center mb-2 border-b border-gray-700/50 pb-2">
        <span className="text-[10px] font-bold uppercase text-gray-400">{label}</span>
        <span className="text-xs font-bold text-cyan-400">{probability.toFixed(1)}%</span>
      </div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-[9px] text-gray-500 uppercase tracking-wider">Justa:</span>
        <span className="text-sm font-bold text-gray-200">@{fairOdd.toFixed(2)}</span>
      </div>
      <div className="relative">
        <input type="number" step="0.01" placeholder="Odd?" value={userOdd} onChange={(e) => setUserOdd(e.target.value)} className={`w-full text-center text-sm font-bold p-1.5 rounded border bg-slate-900/80 focus:outline-none focus:ring-1 transition-all ${hasValue ? 'text-green-400 border-green-500/50 focus:ring-green-500' : 'text-gray-300 border-gray-700 focus:ring-cyan-500'}`} />
      </div>
      {userOdd && (
        <div className={`text-[10px] font-bold text-center mt-2 px-1 py-0.5 rounded ${hasValue ? 'text-green-300 bg-green-500/20' : 'text-red-300 bg-red-500/20'}`}>
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
      <h4 className="text-xs font-bold text-gray-400 uppercase mb-6 text-center border-b border-gray-800 pb-2 tracking-widest w-full">
        Probabilidade do Placar Exato
      </h4>
      <div className="flex items-center">
        <div className="flex flex-col justify-center items-center mr-3"><div className="w-8 flex items-center justify-center"><span className="transform -rotate-90 whitespace-nowrap text-xs font-bold text-gray-500 uppercase tracking-wide">Gols {homeTeam}</span></div></div>
        <div>
            <div className="text-center mb-2 text-xs font-bold text-gray-500 uppercase tracking-wide pl-10">Gols {awayTeam}</div>
            <div className="overflow-x-auto">
              <table className="border-collapse text-sm">
                <thead><tr><th className="p-2"></th>{matrix[0].map((_, j) => <th key={j} className="p-2 text-gray-500 font-bold border-b border-gray-800 w-[72px] text-center">{j}</th>)}</tr></thead>
                <tbody>
                  {matrix.map((row, i) => (
                    <tr key={i}>
                      <th className="p-2 text-gray-500 font-bold border-r border-gray-800 text-right h-10 pr-3">{i}</th>
                      {row.map((prob, j) => {
                        const opacity = prob / maxVal;
                        const textColor = opacity > 0.6 ? 'text-white' : 'text-gray-300';
                        const cellStyle = { backgroundColor: `rgba(220, 38, 38, ${opacity * 0.9})` };
                        return (<td key={j} className="border border-gray-800 p-1 text-center hover:scale-110 transition-transform duration-200 cursor-default w-[72px] h-10 rounded-sm" style={cellStyle}><div className={`flex items-center justify-center h-full w-full ${textColor} font-bold text-xs`}>{prob > 0.01 ? prob.toFixed(2) + '%' : ''}</div></td>);
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

// --- Componentes de Jogo ---
function HistoryMatchDisplay({ match }) {
  const probs = calculateProbabilities(match.lambda_home, match.lambda_away);
  const result = match.scoreHome > match.scoreAway ? '1' : match.scoreAway > match.scoreHome ? '2' : 'X';
  const totalGoals = match.scoreHome + match.scoreAway;
  const isOver25 = totalGoals > 2.5;

  return (
    <div className="bg-[#16202a] shadow-lg rounded-2xl overflow-hidden border border-gray-800 mt-4 animate-fade-in-up">
      <div className="bg-slate-900/80 px-6 py-3 text-center border-b border-gray-800">
        <span className="text-[10px] font-bold uppercase text-gray-500 tracking-widest">{LEAGUE_NAMES[match.competition_code] || match.competition} • Finalizado</span>
        <div className="flex justify-center items-center space-x-4 mt-2"><span className="text-lg font-bold w-1/3 text-right text-gray-300">{match.homeTeam}</span><span className="bg-gray-800 text-cyan-400 border border-gray-700 px-3 py-0.5 rounded font-black text-xl shadow-lg shadow-cyan-900/20">{match.scoreHome} - {match.scoreAway}</span><span className="text-lg font-bold w-1/3 text-left text-gray-300">{match.awayTeam}</span></div>
        <p className="text-[10px] font-medium text-gray-600 mt-2">{new Date(match.utcDate).toLocaleDateString('pt-BR')}</p>
      </div>
      <div className="p-4 grid grid-cols-4 gap-2 bg-[#0b1219]">
         <ProbBox label="CASA" value={probs.prob_1} highlight={result === '1'} />
         <ProbBox label="EMPATE" value={probs.prob_X} highlight={result === 'X'} />
         <ProbBox label="FORA" value={probs.prob_2} highlight={result === '2'} />
         <ProbBox label="OVER 2.5" value={probs.prob_over_2_5} highlight={isOver25} />
      </div>
    </div>
  );
}

function AnalysisDisplay({ homeTeam, awayTeam, homeCrest, awayCrest, lambdaHomeFT, lambdaAwayFT, lambdaHomeHT, lambdaAwayHT, competition, date, matchDetails, user }) {
  const [mustWinHome, setMustWinHome] = useState(1);
  const [mustWinAway, setMustWinAway] = useState(1);
  const [desfalquesHome, setDesfalquesHome] = useState(1);
  const [desfalquesAway, setDesfalquesAway] = useState(1);
  const [mando, setMando] = useState(1);
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState('ft');

  useEffect(() => {
    setMustWinHome(1); setMustWinAway(1); setDesfalquesHome(1); setDesfalquesAway(1); setMando(1); setSaved(false); setMode('ft');
  }, [homeTeam, awayTeam]);

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
        lambdaHome: lambdaHomeFT * mustWinHome * desfalquesHome * mando, 
        lambdaAway: lambdaAwayFT * mustWinAway * desfalquesAway, 
        originalDate: date
      });
      setSaved(true);
    } catch (error) { console.error("Erro:", error); }
  };

  return (
    <div className="bg-[#16202a] shadow-2xl rounded-3xl overflow-hidden border border-gray-800 mt-8 transition-all duration-300 animate-fade-in-up">
      {/* Cabeçalho Tech */}
      <div className="relative bg-[#10283E] px-6 py-8 text-white text-center overflow-hidden">
         <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-[#10283E] to-[#10283E]"></div>
         <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50"></div>
        
        <div className="relative z-10 flex justify-between items-start mb-4">
             <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400 bg-cyan-900/20 px-3 py-1 rounded-full border border-cyan-900/30">
               {LEAGUE_NAMES[competition] || competition}
             </span>
             <button onClick={handleSave} disabled={saved} className={`p-2 rounded-full transition-all ${saved ? 'bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white'}`} title="Salvar Palpite">
                {saved ? <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg> : <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>}
             </button>
        </div>

        <div className="flex items-center justify-center space-x-8 relative z-10">
            {/* Escudos Mandante */}
            <div className="flex flex-col items-center w-1/3 group">
               <div className="relative">
                  {homeCrest ? <img src={homeCrest} alt={homeTeam} className="h-20 w-20 object-contain mb-3 drop-shadow-2xl transform group-hover:scale-110 transition-transform duration-300" /> : <div className="h-20 w-20 bg-white/5 rounded-full mb-3 flex items-center justify-center text-3xl border border-white/10">⚽</div>}
                  <div className="absolute inset-0 bg-cyan-500 blur-2xl opacity-0 group-hover:opacity-20 transition-opacity duration-500 rounded-full"></div>
               </div>
               <h2 className="text-xl md:text-2xl font-bold leading-tight text-gray-100">{homeTeam}</h2>
            </div>

            {/* VS e xG */}
            <div className="flex flex-col items-center">
               <span className="text-gray-600 text-xl font-thin">vs</span>
               <div className="mt-3 bg-black/40 border border-white/5 px-4 py-1.5 rounded-full text-xs font-mono text-cyan-300 tracking-wider shadow-inner" title="Expectativa Estatística de Gols">
                  xG: <span className="text-white">{adjustedLambdaHome.toFixed(2)}</span> - <span className="text-white">{adjustedLambdaAway.toFixed(2)}</span>
               </div>
               
               {/* Detalhes do Jogo */}
               {date && matchDetails && (
                  <div className="mt-4 flex flex-col items-center space-y-1 text-gray-400">
                    <span className="text-[10px] font-medium tracking-widest uppercase text-gray-500">
                       {matchDetails.matchday ? `Rodada ${matchDetails.matchday}` : STATUS_TRANSLATE[matchDetails.status] || matchDetails.status}
                    </span>
                    
                    <div className="flex space-x-2 items-center text-[10px]">
                        <span className={`uppercase tracking-wider ${matchDetails.status === 'IN_PLAY' ? 'text-red-500 animate-pulse font-bold' : 'text-gray-600'}`}>
                            {STATUS_TRANSLATE[matchDetails.status] || matchDetails.status}
                        </span>
                        <span>•</span>
                        <span className="flex items-center space-x-1" title="Estádio">
                           <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                           <span>{matchDetails.venue || 'Local Desconhecido'}</span>
                        </span>
                    </div>
                    
                    {matchDetails.referee && matchDetails.referee !== "Árbitro não informado" && (
                         <span className="flex items-center space-x-1 text-[10px] text-gray-600">
                           <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                           <span>{matchDetails.referee}</span>
                        </span>
                    )}
                  </div>
               )}
            </div>

            {/* Escudos Visitante */}
            <div className="flex flex-col items-center w-1/3 group">
               <div className="relative">
                  {awayCrest ? <img src={awayCrest} alt={awayTeam} className="h-20 w-20 object-contain mb-3 drop-shadow-2xl transform group-hover:scale-110 transition-transform duration-300" /> : <div className="h-20 w-20 bg-white/5 rounded-full mb-3 flex items-center justify-center text-3xl border border-white/10">⚽</div>}
                  <div className="absolute inset-0 bg-purple-500 blur-2xl opacity-0 group-hover:opacity-20 transition-opacity duration-500 rounded-full"></div>
               </div>
               <h2 className="text-xl md:text-2xl font-bold leading-tight text-gray-100">{awayTeam}</h2>
            </div>
        </div>

        <p className="relative z-10 text-[10px] font-bold text-gray-500 mt-6 uppercase tracking-[0.15em]">
          {date ? `${new Date(date).toLocaleDateString('pt-BR')} • ${new Date(date).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}` : 'Simulação'}
        </p>
      </div>

      {/* Seletor HT/FT Dark */}
      <div className="bg-[#0f172a] border-b border-gray-800 flex justify-center p-3">
         <div className="bg-black/20 p-1 rounded-lg shadow-inner border border-white/5 inline-flex">
            <button onClick={() => setMode('ft')} className={`px-6 py-1.5 text-xs font-bold rounded-md transition-all ${mode === 'ft' ? 'bg-gradient-to-r from-cyan-600 to-cyan-700 text-white shadow-lg shadow-cyan-900/50' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>Jogo Completo (FT)</button>
            <button onClick={() => setMode('ht')} className={`px-6 py-1.5 text-xs font-bold rounded-md transition-all ${mode === 'ht' ? 'bg-gradient-to-r from-cyan-600 to-cyan-700 text-white shadow-lg shadow-cyan-900/50' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>1º Tempo (HT)</button>
         </div>
      </div>

      <div className="p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 bg-[#0b1219]">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#16202a] p-5 rounded-2xl border border-gray-800 shadow-xl">
            <h3 className="text-[10px] font-black text-gray-500 uppercase mb-5 border-b border-gray-800 pb-2 tracking-wider flex items-center">
               <span className="w-2 h-2 bg-cyan-500 rounded-full mr-2"></span> Ajustes de Cenário
            </h3>
            <SliderInput label={`Must Win (${homeTeam})`} value={mustWinHome} setValue={setMustWinHome} min="0.6" max="1.5" />
            <SliderInput label={`Desfalques (${homeTeam})`} value={desfalquesHome} setValue={setDesfalquesHome} min="0.5" max="1" />
            <SliderInput label="Força Mando" value={mando} setValue={setMando} min="0.8" max="1.5" />
            <div className="my-6 border-t border-gray-800"></div>
            <SliderInput label={`Must Win (${awayTeam})`} value={mustWinAway} setValue={setMustWinAway} min="0.6" max="1.5" />
            <SliderInput label={`Desfalques (${awayTeam})`} value={desfalquesAway} setValue={setDesfalquesAway} min="0.5" max="1" />
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col">
          <div className="grid grid-cols-4 gap-4 mb-6">
            <OddBox label="CASA" probability={probs.prob_1} />
            <OddBox label="EMPATE" probability={probs.prob_X} />
            <OddBox label="FORA" probability={probs.prob_2} />
            <OddBox label={mode === 'ht' ? "OVER 1.5 (HT)" : "OVER 2.5"} probability={probs.prob_over_2_5} /> 
          </div>
          <div className="bg-[#16202a] rounded-2xl border border-gray-800 p-6 shadow-inner flex-grow flex flex-col justify-center items-center">
             <ScoreTable matrix={probs.matrix} homeTeam={homeTeam} awayTeam={awayTeam} />
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Outros Componentes (Histórico, Salvos, Modal) (Adaptados) ---

function HistoryMatchDisplay({ match }) {
  const probs = calculateProbabilities(match.lambda_home, match.lambda_away);
  const result = match.scoreHome > match.scoreAway ? '1' : match.scoreAway > match.scoreHome ? '2' : 'X';
  const isOver25 = (match.scoreHome + match.scoreAway) > 2.5;

  return (
    <div className="bg-[#16202a] shadow-lg rounded-2xl overflow-hidden border border-gray-800 mt-4 animate-fade-in-up">
      <div className="bg-slate-900/80 px-6 py-3 text-center border-b border-gray-800">
        <span className="text-[10px] font-bold uppercase text-gray-500 tracking-widest">{LEAGUE_NAMES[match.competition_code] || match.competition} • Finalizado</span>
        <div className="flex justify-center items-center space-x-4 mt-2"><span className="text-lg font-bold w-1/3 text-right text-gray-300">{match.homeTeam}</span><span className="bg-gray-800 text-cyan-400 border border-gray-700 px-3 py-0.5 rounded font-black text-xl shadow-lg shadow-cyan-900/20">{match.scoreHome} - {match.scoreAway}</span><span className="text-lg font-bold w-1/3 text-left text-gray-300">{match.awayTeam}</span></div>
        <p className="text-[10px] font-medium text-gray-600 mt-2">{new Date(match.utcDate).toLocaleDateString('pt-BR')}</p>
      </div>
      <div className="p-4 grid grid-cols-4 gap-2 bg-[#0b1219]">
         <ProbBox label="CASA" value={probs.prob_1} highlight={result === '1'} />
         <ProbBox label="EMPATE" value={probs.prob_X} highlight={result === 'X'} />
         <ProbBox label="FORA" value={probs.prob_2} highlight={result === '2'} />
         <ProbBox label="OVER 2.5" value={probs.prob_over_2_5} highlight={isOver25} />
      </div>
    </div>
  );
}

function SavedMatchDisplay({ match, onDelete }) {
    const probs = calculateProbabilities(match.lambdaHome, match.lambdaAway);
    const isFinished = match.status === 'FINISHED' || (match.finalScoreHome !== undefined);
    const result = isFinished ? (match.finalScoreHome > match.finalScoreAway ? '1' : match.finalScoreAway > match.finalScoreHome ? '2' : 'X') : null;
    const SimpleBox = ({ label, value, highlight }) => (<div className={`flex flex-col items-center p-2 rounded-lg border flex-1 transition-all ${highlight ? "bg-purple-500/20 text-purple-300 border-purple-500/50 ring-1 ring-purple-500" : "bg-slate-800/40 text-gray-500 border-gray-800"}`}><span className="text-[10px] font-bold mb-0.5 opacity-70">{label}</span><span className="text-lg font-extrabold">{value.toFixed(1)}%</span></div>);
    return (
      <div className="bg-[#16202a] shadow-lg rounded-2xl overflow-hidden border border-gray-800 mt-4 relative group">
        <button onClick={() => onDelete(match.id)} className="absolute top-2 right-2 z-20 bg-red-500/10 text-red-500 p-1.5 rounded-full hover:bg-red-500 hover:text-white transition-all opacity-100 md:opacity-0 group-hover:opacity-100"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
        <div className={`${isFinished ? 'bg-slate-950' : 'bg-slate-900'} px-6 py-3 text-center border-b border-gray-800 transition-colors`}>
          <span className={`text-[10px] font-bold uppercase tracking-widest block mb-1 ${isFinished ? 'text-gray-600' : 'text-cyan-600'}`}>{LEAGUE_NAMES[match.competition] || match.competition} {isFinished && "• FINALIZADO"}</span>
          <div className="flex justify-center items-center space-x-2"><span className="text-lg font-bold text-gray-200">{match.homeTeam}</span>{isFinished ? <span className="bg-gray-800 text-white border border-gray-700 px-3 py-0.5 rounded font-black text-lg">{match.finalScoreHome}-{match.finalScoreAway}</span> : <span className="text-sm text-gray-600">vs</span>}<span className="text-lg font-bold text-gray-200">{match.awayTeam}</span></div>
          <p className={`text-[10px] mt-1 ${isFinished ? 'text-gray-600' : 'text-gray-500'}`}>Salvo em: {new Date(match.savedAt.seconds * 1000).toLocaleDateString('pt-BR')}</p>
        </div>
        <div className="p-4 bg-[#0b1219]"><div className="grid grid-cols-4 gap-2"><SimpleBox label="1" value={probs.prob_1} highlight={result === '1'} /><SimpleBox label="X" value={probs.prob_X} highlight={result === 'X'} /><SimpleBox label="2" value={probs.prob_2} highlight={result === '2'} /><SimpleBox label="+2.5" value={probs.prob_over_2_5} highlight={isFinished && (match.finalScoreHome + match.finalScoreAway) > 2.5} /></div></div>
      </div>
    );
}

function LoginModal({ isOpen, onClose, onLoginSuccess }) { /* Login Modal */ }

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
        const matchesData = matchesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(m => m.lambda_home_ft !== undefined).filter(m => new Date(m.utcDate) > cutoffTime);
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
      simHomeTeamName = h.name; simAwayTeamName = a.name; simHomeCrest = h.crest; simAwayCrest = a.crest;
      simLambdaHomeFT = h.FO_home_ft * a.FD_away_ft * h.league_avg_home_ft;
      simLambdaAwayFT = a.FO_away_ft * h.FD_home_ft * a.league_avg_away_ft;
      simLambdaHomeHT = h.FO_home_ht * a.FD_away_ht * h.league_avg_home_ht;
      simLambdaAwayHT = a.FO_away_ht * h.FD_home_ht * a.league_avg_away_ht;
    }
  }
  const handleLogout = async () => { await signOut(auth); };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#0a1018]"><div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-cyan-600"></div></div>;

  return (
    <div className="min-h-screen bg-[#0a1018] py-8 px-4 sm:px-6 lg:px-8 font-sans text-gray-300 relative">
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} onLoginSuccess={() => setIsLoginOpen(false)} />
      <div className="max-w-6xl mx-auto pb-16">
        <div className="flex justify-end mb-4">
          {user ? <div className="flex items-center space-x-4 bg-[#16202a] px-4 py-2 rounded-full shadow-sm border border-gray-800"><span className="text-xs font-bold text-gray-300">{user.email.split('@')[0]}</span><button onClick={handleLogout} className="text-xs font-bold text-red-400 hover:text-red-300">Sair</button></div> : <button onClick={() => setIsLoginOpen(true)} className="bg-[#16202a] hover:bg-[#1c2936] text-cyan-400 border border-gray-700 font-bold py-2 px-6 rounded-full shadow-lg text-sm flex items-center transition-all"><span className="mr-2">🔐</span> Entrar</button>}
        </div>
        <div className="flex flex-col items-center mb-10"><img src={logoImg} alt="Logo ROI+" className="w-52 mb-6 rounded-2xl shadow-2xl shadow-cyan-900/20" /></div>
        
        {/* Navegação Dark */}
        <div className="flex justify-center mb-10 overflow-x-auto">
          <div className="bg-[#16202a] p-1.5 rounded-2xl shadow-lg border border-gray-800 inline-flex whitespace-nowrap">
            <button onClick={() => setActiveTab('matches')} className={`px-6 py-2.5 text-xs font-bold rounded-xl transition-all ${activeTab === 'matches' ? 'bg-gradient-to-r from-cyan-600 to-cyan-700 text-white shadow-lg shadow-cyan-900/40' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>📅 Próximos Jogos</button>
            <button onClick={() => setActiveTab('simulator')} className={`px-6 py-2.5 text-xs font-bold rounded-xl transition-all ${activeTab === 'simulator' ? 'bg-gradient-to-r from-cyan-600 to-cyan-700 text-white shadow-lg shadow-cyan-900/40' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>⚽ Simulador</button>
            <button onClick={() => setActiveTab('history')} className={`px-6 py-2.5 text-xs font-bold rounded-xl transition-all ${activeTab === 'history' ? 'bg-gradient-to-r from-cyan-600 to-cyan-700 text-white shadow-lg shadow-cyan-900/40' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>✅ Histórico</button>
            {user && <button onClick={() => setActiveTab('saved')} className={`px-6 py-2.5 text-xs font-bold rounded-xl transition-all ${activeTab === 'saved' ? 'bg-gradient-to-r from-cyan-600 to-cyan-700 text-white shadow-lg shadow-cyan-900/40' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>💾 Palpites</button>}
          </div>
        </div>

        {activeTab === 'matches' && (
          <>
            <div className="bg-[#16202a] p-6 rounded-2xl shadow-lg border border-gray-800 mb-8 max-w-4xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-2 tracking-wider">1. Campeonato</label><select value={selectedLeagueMatch} onChange={(e) => { setSelectedLeagueMatch(e.target.value); setSelectedMatchId(""); }} className="block w-full pl-4 pr-10 py-3 text-base border-gray-700 bg-[#0a1018] text-gray-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded-xl hover:border-gray-600 transition-colors cursor-pointer"><option value="">Selecione...</option>{uniqueLeaguesMatches.map(code => <option key={code} value={code}>{LEAGUE_NAMES[code] || code}</option>)}</select></div>
                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-2 tracking-wider">2. Partida</label><select value={selectedMatchId} onChange={(e) => setSelectedMatchId(e.target.value)} disabled={!selectedLeagueMatch} className="block w-full pl-4 pr-10 py-3 text-base border-gray-700 bg-[#0a1018] text-gray-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded-xl hover:border-gray-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"><option value="">{selectedLeagueMatch ? "Selecione..." : "..."}</option>{Object.keys(matchesByDate).map(d => <optgroup key={d} label={d} className="bg-slate-800 text-gray-400">{matchesByDate[d].map(m => <option key={m.id} value={m.id} className="text-white">{m.homeTeam} vs {m.awayTeam} ({new Date(m.utcDate).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})})</option>)}</optgroup>)}</select></div>
              </div>
            </div>
            {currentMatch ? <AnalysisDisplay 
              homeTeam={currentMatch.homeTeam} awayTeam={currentMatch.awayTeam} 
              homeCrest={currentMatch.homeTeamCrest} awayCrest={currentMatch.awayTeamCrest}
              lambdaHomeFT={currentMatch.lambda_home_ft} lambdaAwayFT={currentMatch.lambda_away_ft}
              lambdaHomeHT={currentMatch.lambda_home_ht} lambdaAwayHT={currentMatch.lambda_away_ht}
              competition={currentMatch.competition_code} date={currentMatch.utcDate} 
              matchDetails={{matchday: currentMatch.matchday, status: currentMatch.status, venue: currentMatch.venue, referee: currentMatch.referee}} user={user} 
            /> : <div className="flex flex-col items-center justify-center py-24 text-gray-600 border border-dashed border-gray-800 rounded-3xl bg-[#16202a]/50"><p className="font-medium">Selecione um jogo para analisar</p></div>}
          </>
        )}

        {activeTab === 'simulator' && (
          <>
            <div className="bg-[#16202a] p-6 rounded-2xl shadow-lg border border-gray-800 mb-8 max-w-4xl mx-auto border-l-4 border-l-cyan-600">
              <h3 className="text-sm font-bold text-gray-300 uppercase mb-4 flex items-center"><span className="bg-cyan-500/10 text-cyan-400 p-1.5 rounded mr-3">⚽</span> Simulação Personalizada</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-2">Campeonato</label><select value={simLeague} onChange={(e) => { setSimLeague(e.target.value); setSimHomeTeamId(""); setSimAwayTeamId(""); }} className="block w-full pl-3 pr-8 py-2.5 text-sm border-gray-700 bg-[#0a1018] text-gray-200 rounded-lg focus:ring-1 focus:ring-cyan-500 border"><option value="">...</option>{uniqueLeaguesSim.map(l => <option key={l} value={l}>{LEAGUE_NAMES[l] || l}</option>)}</select></div>
                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-2">Mandante</label><select value={simHomeTeamId} onChange={(e) => setSimHomeTeamId(e.target.value)} disabled={!simLeague} className="block w-full pl-3 pr-8 py-2.5 text-sm border-gray-700 bg-[#0a1018] text-gray-200 rounded-lg focus:ring-1 focus:ring-cyan-500 border disabled:opacity-50"><option value="">...</option>{teamsInSimLeague.map(t => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}</select></div>
                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-2">Visitante</label><select value={simAwayTeamId} onChange={(e) => setSimAwayTeamId(e.target.value)} disabled={!simLeague} className="block w-full pl-3 pr-8 py-2.5 text-sm border-gray-700 bg-[#0a1018] text-gray-200 rounded-lg focus:ring-1 focus:ring-cyan-500 border disabled:opacity-50"><option value="">...</option>{teamsInSimLeague.filter(t => t.team_id !== parseInt(simHomeTeamId)).map(t => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}</select></div>
              </div>
            </div>
            {(simLambdaHomeFT > 0) ? <AnalysisDisplay homeTeam={simHomeTeamName} awayTeam={simAwayTeamName} homeCrest={simHomeCrest} awayCrest={simAwayCrest} lambdaHomeFT={simLambdaHomeFT} lambdaAwayFT={simLambdaAwayFT} lambdaHomeHT={simLambdaHomeHT} lambdaAwayHT={simLambdaAwayHT} competition={simLeague} date={null} user={user} /> : <div className="flex flex-col items-center justify-center py-24 text-gray-600 border border-dashed border-gray-800 rounded-3xl bg-[#16202a]/50"><p className="font-medium">Configure a simulação acima</p></div>}
          </>
        )}

        {activeTab === 'history' && (
          <>
            <div className="bg-[#16202a] p-6 rounded-2xl shadow-lg border border-gray-800 mb-8 max-w-4xl mx-auto">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2 tracking-wider">Filtrar por Campeonato</label>
              <select value={selectedLeagueHistory} onChange={(e) => setSelectedLeagueHistory(e.target.value)} className="block w-full pl-4 pr-10 py-3 text-base border-gray-700 bg-[#0a1018] text-gray-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded-xl hover:border-gray-600 transition-colors cursor-pointer"><option value="">Todas as Ligas</option>{uniqueLeaguesHistory.map(code => <option key={code} value={code}>{LEAGUE_NAMES[code] || code}</option>)}</select>
            </div>
            <div className="space-y-6">
              {filteredHistoryMatches.length > 0 ? filteredHistoryMatches.map(match => <HistoryMatchDisplay key={match.id} match={match} />) : <div className="flex flex-col items-center justify-center py-24 text-gray-600 border border-dashed border-gray-800 rounded-3xl bg-[#16202a]/50"><p className="font-medium">Nenhum jogo encontrado.</p></div>}
            </div>
          </>
        )}

        {activeTab === 'saved' && user && (
          <div className="space-y-6">
            {savedMatches.length > 0 ? savedMatches.map(match => <SavedMatchDisplay key={match.id} match={match} onDelete={handleDeleteSaved} />) : <div className="flex flex-col items-center justify-center py-24 text-gray-600 border border-dashed border-gray-800 rounded-3xl bg-[#16202a]/50"><p className="font-medium">Você ainda não salvou nenhum palpite.</p></div>}
          </div>
        )}
      </div>

      {/* Footer Dark */}
      <div className="mt-20 pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center text-gray-600 text-xs max-w-6xl mx-auto px-4">
        <div className="mb-4 md:mb-0">&copy; {new Date().getFullYear()} ROI+ Analytics.</div>
        <a href="https://www.instagram.com/roistats" target="_blank" className="flex items-center space-x-2 hover:text-cyan-500 transition-colors group">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:stroke-cyan-500 transition-colors"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
          <span className="font-bold text-lg group-hover:text-cyan-500 transition-colors">roistats</span>
        </a>
      </div>
    </div>
  );
}

export default App;
