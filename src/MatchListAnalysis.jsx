<<<<<<< HEAD
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { factorial } from 'mathjs';

// --- LÓGICA MATEMÁTICA ---
function poissonPmf(k, lambda) {
  if (isNaN(lambda) || lambda === undefined || lambda === null) return 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function calculateAdvancedStats(lambdaHome, lambdaAway) {
  if (!lambdaHome || !lambdaAway) return { prob_1: 0, prob_X: 0, prob_2: 0, o05: 0, o15: 0, o25: 0, btts: 0 };

  const maxGoals = 7; 
  let probHome = 0, probDraw = 0, probAway = 0;
  let probOver05 = 0, probOver15 = 0, probOver25 = 0, probBTTS = 0;
  let totalProb = 0;

  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const p = poissonPmf(i, lambdaHome) * poissonPmf(j, lambdaAway);
      totalProb += p;

      if (i > j) probHome += p;
      else if (i === j) probDraw += p;
      else probAway += p;

      if (i + j > 0.5) probOver05 += p;
      if (i + j > 1.5) probOver15 += p;
      if (i + j > 2.5) probOver25 += p;

      if (i > 0 && j > 0) probBTTS += p;
    }
  }

  const norm = totalProb > 0 ? 1 / totalProb : 0;

  return {
    prob_1: (probHome * norm) * 100,
    prob_X: (probDraw * norm) * 100,
    prob_2: (probAway * norm) * 100,
    o05: (probOver05 * norm) * 100,
    o15: (probOver15 * norm) * 100,
    o25: (probOver25 * norm) * 100,
    btts: (probBTTS * norm) * 100
  };
}

const LEAGUE_NAMES = {
  'WC': 'FIFA World Cup', 'CL': 'Champions League', 'BL1': 'Bundesliga',
  'DED': 'Eredivisie', 'BSA': 'Brasileirão A', 'PD': 'La Liga',
  'FL1': 'Ligue 1', 'ELC': 'Championship', 'PPL': 'Primeira Liga',
  'EC': 'Eurocopa', 'SA': 'Serie A', 'PL': 'Premier League'
};

const getHeatColor = (val, type = 'green') => {
    if (val >= 80) return type === 'red' ? 'text-red-400 font-black bg-red-900/20' : 'text-green-400 font-black bg-green-900/20';
    if (val >= 60) return type === 'red' ? 'text-red-300 font-bold' : 'text-green-300 font-bold';
    if (val >= 40) return 'text-yellow-300';
    return 'text-gray-600 opacity-60';
};

export default function MatchListAnalysis({ matches }) {
  const [selectedLeagues, setSelectedLeagues] = useState([]); 
  const [isLeagueDropdownOpen, setIsLeagueDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [sortConfig, setSortConfig] = useState({ key: 'utcDate', direction: 'asc' });

  useEffect(() => {
    function handleClickOutside(event) {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
            setIsLeagueDropdownOpen(false);
        }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  const processedMatches = useMemo(() => {
      return matches.map(match => {
          const stats = calculateAdvancedStats(match.lambda_home_ft, match.lambda_away_ft);
          return { ...match, ...stats }; 
      });
  }, [matches]);

  const uniqueLeagues = useMemo(() => {
      return [...new Set(matches.map(m => m.competition_code || m.competition))].sort();
  }, [matches]);

  const finalData = useMemo(() => {
      let data = [...processedMatches];

      if (filterDate) {
          data = data.filter(m => m.utcDate.startsWith(filterDate));
      }

      if (selectedLeagues.length > 0) {
          data = data.filter(m => selectedLeagues.includes(m.competition_code || m.competition));
      }

      if (sortConfig.key) {
          data.sort((a, b) => {
              let valA = a[sortConfig.key];
              let valB = b[sortConfig.key];

              if (sortConfig.key === 'utcDate') {
                  valA = new Date(valA);
                  valB = new Date(valB);
              }

              if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
              if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
              return 0;
          });
      }

      return data;
  }, [processedMatches, filterDate, selectedLeagues, sortConfig]);

  const toggleLeague = (leagueCode) => {
      setSelectedLeagues(prev => {
          if (prev.includes(leagueCode)) {
              return prev.filter(l => l !== leagueCode);
          } else {
              return [...prev, leagueCode];
          }
      });
  };

  const requestSort = (key) => {
      let direction = 'desc'; 
      if (sortConfig.key === key && sortConfig.direction === 'desc') {
          direction = 'asc';
      }
      setSortConfig({ key, direction });
  };

  const SortIcon = ({ column }) => {
      if (sortConfig.key !== column) return <span className="opacity-20 ml-1">⇅</span>;
      return sortConfig.direction === 'asc' ? <span className="text-cyan-400 ml-1">▲</span> : <span className="text-cyan-400 ml-1">▼</span>;
  };

  // --- NOVA FUNÇÃO COPY WHATSAPP ATUALIZADA ---
  const handleCopyToWhatsApp = () => {
      if (finalData.length === 0) {
          alert("Nenhum jogo na tabela para copiar.");
          return;
      }

      const dateStr = new Date(filterDate).toLocaleDateString('pt-BR');
      let text = `📊 *ANÁLISE ROI+* (${dateStr})\n`;
      text += `Jogos Selecionados: ${finalData.length}\n\n`;

      finalData.forEach(m => {
          const time = new Date(m.utcDate).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
          const league = LEAGUE_NAMES[m.competition_code] || m.competition;
          
          text += `🏆 *${league}* - ${time}\n`;
          text += `⚽ ${m.homeTeam} x ${m.awayTeam}\n`;
          // --- LINHA DE XG ADICIONADA ---
          text += `📊 xG: ${m.lambda_home_ft?.toFixed(2)} x ${m.lambda_away_ft?.toFixed(2)}\n`;
          
          text += `🔥 *Probabilidades:*\n`;
          
          // --- PROBABILIDADES 1X2 SEMPRE VISÍVEIS ---
          text += `   🏠 Casa: ${m.prob_1.toFixed(0)}%\n`;
          text += `   🤝 Empate: ${m.prob_X.toFixed(0)}%\n`;
          text += `   ✈️ Fora: ${m.prob_2.toFixed(0)}%\n`;
          
          text += `   🥅 Over 1.5: ${m.o15.toFixed(0)}%\n`;
          text += `   🥅 Over 2.5: ${m.o25.toFixed(0)}%\n`;
          text += `   🔁 Ambas: ${m.btts.toFixed(0)}%\n`;
          text += `----------------------------------\n`;
      });

      text += `\n_Gerado por ROI+ Analytics_`;

      navigator.clipboard.writeText(text)
          .then(() => alert("✅ Tabela copiada com sucesso!"))
          .catch(err => alert("Erro ao copiar: " + err));
  };

  return (
    <div className="animate-fade-in-up mt-8 pb-20">
        {/* --- BARRA DE FERRAMENTAS --- */}
        <div className="bg-[#16202a] p-5 rounded-2xl shadow-lg border border-gray-800 mb-6 flex flex-col xl:flex-row items-center justify-between gap-6">
            
            <div className="flex items-center gap-3 w-full md:w-auto">
                <span className="bg-purple-500/10 text-purple-400 p-2 rounded-lg text-xl">📊</span>
                <h2 className="text-lg font-bold text-gray-100">Raio-X de Probabilidades</h2>
            </div>

            <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto items-center">
                
                {/* 1. Filtro Data */}
                <div className="w-full md:w-auto">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Data</label>
                    <input 
                        type="date" 
                        value={filterDate} 
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="block w-full p-2.5 text-sm border-gray-700 bg-[#0a1018] text-white rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition-all cursor-pointer"
                    />
                </div>

                {/* 2. Filtro Ligas (Multi-Select) */}
                <div className="relative w-full md:w-64" ref={dropdownRef}>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Ligas ({selectedLeagues.length === 0 ? 'Todas' : selectedLeagues.length})
                    </label>
                    <button 
                        onClick={() => setIsLeagueDropdownOpen(!isLeagueDropdownOpen)}
                        className="w-full p-2.5 text-sm text-left border border-gray-700 bg-[#0a1018] text-white rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition-all flex justify-between items-center"
                    >
                        <span className="truncate">
                            {selectedLeagues.length === 0 ? "Todas as Ligas" : selectedLeagues.map(l => LEAGUE_NAMES[l] || l).join(', ')}
                        </span>
                        <span className="text-gray-500 text-xs">▼</span>
                    </button>

                    {isLeagueDropdownOpen && (
                        <div className="absolute z-50 mt-2 w-full bg-[#1c2936] border border-gray-700 rounded-xl shadow-2xl max-h-64 overflow-y-auto p-2">
                            <div 
                                onClick={() => setSelectedLeagues([])}
                                className={`p-2 rounded-lg cursor-pointer text-sm mb-1 ${selectedLeagues.length === 0 ? 'bg-cyan-600 text-white font-bold' : 'text-gray-300 hover:bg-white/5'}`}
                            >
                                Todas as Ligas
                            </div>
                            <div className="border-b border-gray-700 my-1"></div>
                            {uniqueLeagues.map(l => (
                                <div 
                                    key={l} 
                                    onClick={() => toggleLeague(l)}
                                    className={`flex items-center p-2 rounded-lg cursor-pointer text-sm mb-1 ${selectedLeagues.includes(l) ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-gray-300 hover:bg-white/5'}`}
                                >
                                    <input 
                                        type="checkbox" 
                                        checked={selectedLeagues.includes(l)} 
                                        readOnly 
                                        className="mr-2 rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-0"
                                    />
                                    {LEAGUE_NAMES[l] || l}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 3. Botão Copiar */}
                <div className="w-full md:w-auto mt-4 md:mt-0">
                    <button 
                        onClick={handleCopyToWhatsApp}
                        className="w-full md:w-auto flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-green-900/30 transition-all active:scale-95"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                        Copiar para WhatsApp
                    </button>
                </div>
            </div>
        </div>

        {/* --- TABELA --- */}
        <div className="bg-[#16202a] border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
                <table className="min-w-full text-xs text-left text-gray-300">
                    <thead className="bg-[#0f172a] text-gray-400 uppercase font-bold sticky top-0 z-10 border-b border-gray-700 select-none">
                        <tr>
                            <th className="px-4 py-4 text-purple-400 cursor-pointer hover:text-white transition-colors" onClick={() => requestSort('utcDate')}>
                                Data <SortIcon column="utcDate"/>
                            </th>
                            <th className="px-4 py-4 text-purple-400">Confronto</th>
                            
                            {/* xG */}
                            <th className="px-2 py-4 text-center border-l border-gray-800 text-cyan-400 cursor-pointer hover:bg-white/5" title="xG Mandante" onClick={() => requestSort('lambda_home_ft')}>
                                xG H <SortIcon column="lambda_home_ft"/>
                            </th>
                            <th className="px-2 py-4 text-center text-red-400 cursor-pointer hover:bg-white/5" title="xG Visitante" onClick={() => requestSort('lambda_away_ft')}>
                                xG A <SortIcon column="lambda_away_ft"/>
                            </th>

                            {/* Probabilidades 1x2 */}
                            <th className="px-2 py-4 text-center border-l border-gray-800 cursor-pointer hover:bg-white/5" onClick={() => requestSort('prob_1')}>
                                Home <SortIcon column="prob_1"/>
                            </th>
                            <th className="px-2 py-4 text-center cursor-pointer hover:bg-white/5" onClick={() => requestSort('prob_X')}>
                                Draw <SortIcon column="prob_X"/>
                            </th>
                            <th className="px-2 py-4 text-center cursor-pointer hover:bg-white/5" onClick={() => requestSort('prob_2')}>
                                Away <SortIcon column="prob_2"/>
                            </th>

                            {/* Probabilidades Gols */}
                            <th className="px-2 py-4 text-center border-l border-gray-800 text-blue-300 cursor-pointer hover:bg-white/5" onClick={() => requestSort('o05')}>
                                Ov 0.5 <SortIcon column="o05"/>
                            </th>
                            <th className="px-2 py-4 text-center text-blue-300 cursor-pointer hover:bg-white/5" onClick={() => requestSort('o15')}>
                                Ov 1.5 <SortIcon column="o15"/>
                            </th>
                            <th className="px-2 py-4 text-center text-blue-300 cursor-pointer hover:bg-white/5" onClick={() => requestSort('o25')}>
                                Ov 2.5 <SortIcon column="o25"/>
                            </th>

                            {/* BTTS */}
                            <th className="px-2 py-4 text-center border-l border-gray-800 text-yellow-300 cursor-pointer hover:bg-white/5" onClick={() => requestSort('btts')}>
                                Ambas <SortIcon column="btts"/>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                        {finalData.length === 0 ? (
                            <tr><td colSpan="12" className="p-8 text-center text-gray-500">Nenhum jogo encontrado para esta data/filtro.</td></tr>
                        ) : (
                            finalData.map(match => {
                                const dateObj = new Date(match.utcDate);
                                return (
                                    <tr key={match.id} className="hover:bg-white/5 transition-colors group">
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="font-bold text-gray-300">{dateObj.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}</div>
                                            <div className="text-[9px] text-gray-500 uppercase">{dateObj.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-200 group-hover:text-white flex items-center gap-2">
                                                    {match.homeTeam}
                                                    <span className="text-[9px] text-gray-600 font-normal uppercase border border-gray-700 px-1 rounded">{LEAGUE_NAMES[match.competition_code] || match.competition}</span>
                                                </span>
                                                <span className="font-bold text-gray-200 group-hover:text-white">{match.awayTeam}</span>
                                            </div>
                                        </td>
                                        
                                        {/* xG */}
                                        <td className="px-2 py-3 text-center font-mono font-bold bg-gray-900/30 border-l border-gray-800 text-cyan-500">
                                            {match.lambda_home_ft?.toFixed(2)}
                                        </td>
                                        <td className="px-2 py-3 text-center font-mono font-bold bg-gray-900/30 text-red-500">
                                            {match.lambda_away_ft?.toFixed(2)}
                                        </td>

                                        {/* 1x2 */}
                                        <td className={`px-2 py-3 text-center border-l border-gray-800 ${getHeatColor(match.prob_1)}`}>
                                            {match.prob_1.toFixed(0)}%
                                        </td>
                                        <td className={`px-2 py-3 text-center ${getHeatColor(match.prob_X)}`}>
                                            {match.prob_X.toFixed(0)}%
                                        </td>
                                        <td className={`px-2 py-3 text-center ${getHeatColor(match.prob_2)}`}>
                                            {match.prob_2.toFixed(0)}%
                                        </td>

                                        {/* Gols */}
                                        <td className={`px-2 py-3 text-center border-l border-gray-800 ${getHeatColor(match.o05)}`}>
                                            {match.o05.toFixed(0)}%
                                        </td>
                                        <td className={`px-2 py-3 text-center ${getHeatColor(match.o15)}`}>
                                            {match.o15.toFixed(0)}%
                                        </td>
                                        <td className={`px-2 py-3 text-center ${getHeatColor(match.o25)}`}>
                                            {match.o25.toFixed(0)}%
                                        </td>

                                        {/* BTTS */}
                                        <td className={`px-2 py-3 text-center border-l border-gray-800 ${getHeatColor(match.btts)}`}>
                                            {match.btts.toFixed(0)}%
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
            
            <div className="bg-[#0f172a] p-3 flex justify-between items-center text-[10px] text-gray-500 border-t border-gray-800">
                <span>Exibindo {finalData.length} jogos</span>
                <div className="flex gap-4">
                    <div className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded-full"></span> >80% (Muito Alta)</div>
                    <div className="flex items-center gap-1"><span className="w-2 h-2 bg-green-300 rounded-full"></span> >60% (Alta)</div>
                    <div className="flex items-center gap-1"><span className="w-2 h-2 bg-yellow-300 rounded-full"></span> >40% (Média)</div>
                </div>
            </div>
        </div>
    </div>
  );
=======
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { factorial } from 'mathjs';

// --- LÓGICA MATEMÁTICA ---
function poissonPmf(k, lambda) {
  if (isNaN(lambda) || lambda === undefined || lambda === null) return 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function calculateAdvancedStats(lambdaHome, lambdaAway) {
  if (!lambdaHome || !lambdaAway) return { prob_1: 0, prob_X: 0, prob_2: 0, o05: 0, o15: 0, o25: 0, btts: 0 };

  const maxGoals = 7; 
  let probHome = 0, probDraw = 0, probAway = 0;
  let probOver05 = 0, probOver15 = 0, probOver25 = 0, probBTTS = 0;
  let totalProb = 0;

  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const p = poissonPmf(i, lambdaHome) * poissonPmf(j, lambdaAway);
      totalProb += p;

      if (i > j) probHome += p;
      else if (i === j) probDraw += p;
      else probAway += p;

      if (i + j > 0.5) probOver05 += p;
      if (i + j > 1.5) probOver15 += p;
      if (i + j > 2.5) probOver25 += p;

      if (i > 0 && j > 0) probBTTS += p;
    }
  }

  const norm = totalProb > 0 ? 1 / totalProb : 0;

  return {
    prob_1: (probHome * norm) * 100,
    prob_X: (probDraw * norm) * 100,
    prob_2: (probAway * norm) * 100,
    o05: (probOver05 * norm) * 100,
    o15: (probOver15 * norm) * 100,
    o25: (probOver25 * norm) * 100,
    btts: (probBTTS * norm) * 100
  };
}

const LEAGUE_NAMES = {
  'WC': 'FIFA World Cup', 'CL': 'Champions League', 'BL1': 'Bundesliga',
  'DED': 'Eredivisie', 'BSA': 'Brasileirão A', 'PD': 'La Liga',
  'FL1': 'Ligue 1', 'ELC': 'Championship', 'PPL': 'Primeira Liga',
  'EC': 'Eurocopa', 'SA': 'Serie A', 'PL': 'Premier League'
};

const getHeatColor = (val, type = 'green') => {
    if (val >= 80) return type === 'red' ? 'text-red-400 font-black bg-red-900/20' : 'text-green-400 font-black bg-green-900/20';
    if (val >= 60) return type === 'red' ? 'text-red-300 font-bold' : 'text-green-300 font-bold';
    if (val >= 40) return 'text-yellow-300';
    return 'text-gray-600 opacity-60';
};

export default function MatchListAnalysis({ matches }) {
  const [selectedLeagues, setSelectedLeagues] = useState([]); 
  const [isLeagueDropdownOpen, setIsLeagueDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [sortConfig, setSortConfig] = useState({ key: 'utcDate', direction: 'asc' });

  useEffect(() => {
    function handleClickOutside(event) {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
            setIsLeagueDropdownOpen(false);
        }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  const processedMatches = useMemo(() => {
      return matches.map(match => {
          const stats = calculateAdvancedStats(match.lambda_home_ft, match.lambda_away_ft);
          return { ...match, ...stats }; 
      });
  }, [matches]);

  const uniqueLeagues = useMemo(() => {
      return [...new Set(matches.map(m => m.competition_code || m.competition))].sort();
  }, [matches]);

  const finalData = useMemo(() => {
      let data = [...processedMatches];

      if (filterDate) {
          data = data.filter(m => m.utcDate.startsWith(filterDate));
      }

      if (selectedLeagues.length > 0) {
          data = data.filter(m => selectedLeagues.includes(m.competition_code || m.competition));
      }

      if (sortConfig.key) {
          data.sort((a, b) => {
              let valA = a[sortConfig.key];
              let valB = b[sortConfig.key];

              if (sortConfig.key === 'utcDate') {
                  valA = new Date(valA);
                  valB = new Date(valB);
              }

              if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
              if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
              return 0;
          });
      }

      return data;
  }, [processedMatches, filterDate, selectedLeagues, sortConfig]);

  const toggleLeague = (leagueCode) => {
      setSelectedLeagues(prev => {
          if (prev.includes(leagueCode)) {
              return prev.filter(l => l !== leagueCode);
          } else {
              return [...prev, leagueCode];
          }
      });
  };

  const requestSort = (key) => {
      let direction = 'desc'; 
      if (sortConfig.key === key && sortConfig.direction === 'desc') {
          direction = 'asc';
      }
      setSortConfig({ key, direction });
  };

  const SortIcon = ({ column }) => {
      if (sortConfig.key !== column) return <span className="opacity-20 ml-1">⇅</span>;
      return sortConfig.direction === 'asc' ? <span className="text-cyan-400 ml-1">▲</span> : <span className="text-cyan-400 ml-1">▼</span>;
  };

  // --- NOVA FUNÇÃO COPY WHATSAPP ATUALIZADA ---
  const handleCopyToWhatsApp = () => {
      if (finalData.length === 0) {
          alert("Nenhum jogo na tabela para copiar.");
          return;
      }

      const dateStr = new Date(filterDate).toLocaleDateString('pt-BR');
      let text = `📊 *ANÁLISE ROI+* (${dateStr})\n`;
      text += `Jogos Selecionados: ${finalData.length}\n\n`;

      finalData.forEach(m => {
          const time = new Date(m.utcDate).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
          const league = LEAGUE_NAMES[m.competition_code] || m.competition;
          
          text += `🏆 *${league}* - ${time}\n`;
          text += `⚽ ${m.homeTeam} x ${m.awayTeam}\n`;
          // --- LINHA DE XG ADICIONADA ---
          text += `📊 xG: ${m.lambda_home_ft?.toFixed(2)} x ${m.lambda_away_ft?.toFixed(2)}\n`;
          
          text += `🔥 *Probabilidades:*\n`;
          
          // --- PROBABILIDADES 1X2 SEMPRE VISÍVEIS ---
          text += `   🏠 Casa: ${m.prob_1.toFixed(0)}%\n`;
          text += `   🤝 Empate: ${m.prob_X.toFixed(0)}%\n`;
          text += `   ✈️ Fora: ${m.prob_2.toFixed(0)}%\n`;
          
          text += `   🥅 Over 1.5: ${m.o15.toFixed(0)}%\n`;
          text += `   🥅 Over 2.5: ${m.o25.toFixed(0)}%\n`;
          text += `   🔁 Ambas: ${m.btts.toFixed(0)}%\n`;
          text += `----------------------------------\n`;
      });

      text += `\n_Gerado por ROI+ Analytics_`;

      navigator.clipboard.writeText(text)
          .then(() => alert("✅ Tabela copiada com sucesso!"))
          .catch(err => alert("Erro ao copiar: " + err));
  };

  return (
    <div className="animate-fade-in-up mt-8 pb-20">
        {/* --- BARRA DE FERRAMENTAS --- */}
        <div className="bg-[#16202a] p-5 rounded-2xl shadow-lg border border-gray-800 mb-6 flex flex-col xl:flex-row items-center justify-between gap-6">
            
            <div className="flex items-center gap-3 w-full md:w-auto">
                <span className="bg-purple-500/10 text-purple-400 p-2 rounded-lg text-xl">📊</span>
                <h2 className="text-lg font-bold text-gray-100">Raio-X de Probabilidades</h2>
            </div>

            <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto items-center">
                
                {/* 1. Filtro Data */}
                <div className="w-full md:w-auto">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Data</label>
                    <input 
                        type="date" 
                        value={filterDate} 
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="block w-full p-2.5 text-sm border-gray-700 bg-[#0a1018] text-white rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition-all cursor-pointer"
                    />
                </div>

                {/* 2. Filtro Ligas (Multi-Select) */}
                <div className="relative w-full md:w-64" ref={dropdownRef}>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Ligas ({selectedLeagues.length === 0 ? 'Todas' : selectedLeagues.length})
                    </label>
                    <button 
                        onClick={() => setIsLeagueDropdownOpen(!isLeagueDropdownOpen)}
                        className="w-full p-2.5 text-sm text-left border border-gray-700 bg-[#0a1018] text-white rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition-all flex justify-between items-center"
                    >
                        <span className="truncate">
                            {selectedLeagues.length === 0 ? "Todas as Ligas" : selectedLeagues.map(l => LEAGUE_NAMES[l] || l).join(', ')}
                        </span>
                        <span className="text-gray-500 text-xs">▼</span>
                    </button>

                    {isLeagueDropdownOpen && (
                        <div className="absolute z-50 mt-2 w-full bg-[#1c2936] border border-gray-700 rounded-xl shadow-2xl max-h-64 overflow-y-auto p-2">
                            <div 
                                onClick={() => setSelectedLeagues([])}
                                className={`p-2 rounded-lg cursor-pointer text-sm mb-1 ${selectedLeagues.length === 0 ? 'bg-cyan-600 text-white font-bold' : 'text-gray-300 hover:bg-white/5'}`}
                            >
                                Todas as Ligas
                            </div>
                            <div className="border-b border-gray-700 my-1"></div>
                            {uniqueLeagues.map(l => (
                                <div 
                                    key={l} 
                                    onClick={() => toggleLeague(l)}
                                    className={`flex items-center p-2 rounded-lg cursor-pointer text-sm mb-1 ${selectedLeagues.includes(l) ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-gray-300 hover:bg-white/5'}`}
                                >
                                    <input 
                                        type="checkbox" 
                                        checked={selectedLeagues.includes(l)} 
                                        readOnly 
                                        className="mr-2 rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-0"
                                    />
                                    {LEAGUE_NAMES[l] || l}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 3. Botão Copiar */}
                <div className="w-full md:w-auto mt-4 md:mt-0">
                    <button 
                        onClick={handleCopyToWhatsApp}
                        className="w-full md:w-auto flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-green-900/30 transition-all active:scale-95"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                        Copiar para WhatsApp
                    </button>
                </div>
            </div>
        </div>

        {/* --- TABELA --- */}
        <div className="bg-[#16202a] border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
                <table className="min-w-full text-xs text-left text-gray-300">
                    <thead className="bg-[#0f172a] text-gray-400 uppercase font-bold sticky top-0 z-10 border-b border-gray-700 select-none">
                        <tr>
                            <th className="px-4 py-4 text-purple-400 cursor-pointer hover:text-white transition-colors" onClick={() => requestSort('utcDate')}>
                                Data <SortIcon column="utcDate"/>
                            </th>
                            <th className="px-4 py-4 text-purple-400">Confronto</th>
                            
                            {/* xG */}
                            <th className="px-2 py-4 text-center border-l border-gray-800 text-cyan-400 cursor-pointer hover:bg-white/5" title="xG Mandante" onClick={() => requestSort('lambda_home_ft')}>
                                xG H <SortIcon column="lambda_home_ft"/>
                            </th>
                            <th className="px-2 py-4 text-center text-red-400 cursor-pointer hover:bg-white/5" title="xG Visitante" onClick={() => requestSort('lambda_away_ft')}>
                                xG A <SortIcon column="lambda_away_ft"/>
                            </th>

                            {/* Probabilidades 1x2 */}
                            <th className="px-2 py-4 text-center border-l border-gray-800 cursor-pointer hover:bg-white/5" onClick={() => requestSort('prob_1')}>
                                Home <SortIcon column="prob_1"/>
                            </th>
                            <th className="px-2 py-4 text-center cursor-pointer hover:bg-white/5" onClick={() => requestSort('prob_X')}>
                                Draw <SortIcon column="prob_X"/>
                            </th>
                            <th className="px-2 py-4 text-center cursor-pointer hover:bg-white/5" onClick={() => requestSort('prob_2')}>
                                Away <SortIcon column="prob_2"/>
                            </th>

                            {/* Probabilidades Gols */}
                            <th className="px-2 py-4 text-center border-l border-gray-800 text-blue-300 cursor-pointer hover:bg-white/5" onClick={() => requestSort('o05')}>
                                Ov 0.5 <SortIcon column="o05"/>
                            </th>
                            <th className="px-2 py-4 text-center text-blue-300 cursor-pointer hover:bg-white/5" onClick={() => requestSort('o15')}>
                                Ov 1.5 <SortIcon column="o15"/>
                            </th>
                            <th className="px-2 py-4 text-center text-blue-300 cursor-pointer hover:bg-white/5" onClick={() => requestSort('o25')}>
                                Ov 2.5 <SortIcon column="o25"/>
                            </th>

                            {/* BTTS */}
                            <th className="px-2 py-4 text-center border-l border-gray-800 text-yellow-300 cursor-pointer hover:bg-white/5" onClick={() => requestSort('btts')}>
                                Ambas <SortIcon column="btts"/>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                        {finalData.length === 0 ? (
                            <tr><td colSpan="12" className="p-8 text-center text-gray-500">Nenhum jogo encontrado para esta data/filtro.</td></tr>
                        ) : (
                            finalData.map(match => {
                                const dateObj = new Date(match.utcDate);
                                return (
                                    <tr key={match.id} className="hover:bg-white/5 transition-colors group">
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="font-bold text-gray-300">{dateObj.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}</div>
                                            <div className="text-[9px] text-gray-500 uppercase">{dateObj.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-200 group-hover:text-white flex items-center gap-2">
                                                    {match.homeTeam}
                                                    <span className="text-[9px] text-gray-600 font-normal uppercase border border-gray-700 px-1 rounded">{LEAGUE_NAMES[match.competition_code] || match.competition}</span>
                                                </span>
                                                <span className="font-bold text-gray-200 group-hover:text-white">{match.awayTeam}</span>
                                            </div>
                                        </td>
                                        
                                        {/* xG */}
                                        <td className="px-2 py-3 text-center font-mono font-bold bg-gray-900/30 border-l border-gray-800 text-cyan-500">
                                            {match.lambda_home_ft?.toFixed(2)}
                                        </td>
                                        <td className="px-2 py-3 text-center font-mono font-bold bg-gray-900/30 text-red-500">
                                            {match.lambda_away_ft?.toFixed(2)}
                                        </td>

                                        {/* 1x2 */}
                                        <td className={`px-2 py-3 text-center border-l border-gray-800 ${getHeatColor(match.prob_1)}`}>
                                            {match.prob_1.toFixed(0)}%
                                        </td>
                                        <td className={`px-2 py-3 text-center ${getHeatColor(match.prob_X)}`}>
                                            {match.prob_X.toFixed(0)}%
                                        </td>
                                        <td className={`px-2 py-3 text-center ${getHeatColor(match.prob_2)}`}>
                                            {match.prob_2.toFixed(0)}%
                                        </td>

                                        {/* Gols */}
                                        <td className={`px-2 py-3 text-center border-l border-gray-800 ${getHeatColor(match.o05)}`}>
                                            {match.o05.toFixed(0)}%
                                        </td>
                                        <td className={`px-2 py-3 text-center ${getHeatColor(match.o15)}`}>
                                            {match.o15.toFixed(0)}%
                                        </td>
                                        <td className={`px-2 py-3 text-center ${getHeatColor(match.o25)}`}>
                                            {match.o25.toFixed(0)}%
                                        </td>

                                        {/* BTTS */}
                                        <td className={`px-2 py-3 text-center border-l border-gray-800 ${getHeatColor(match.btts)}`}>
                                            {match.btts.toFixed(0)}%
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
            
            <div className="bg-[#0f172a] p-3 flex justify-between items-center text-[10px] text-gray-500 border-t border-gray-800">
                <span>Exibindo {finalData.length} jogos</span>
                <div className="flex gap-4">
                    <div className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded-full"></span> >80% (Muito Alta)</div>
                    <div className="flex items-center gap-1"><span className="w-2 h-2 bg-green-300 rounded-full"></span> >60% (Alta)</div>
                    <div className="flex items-center gap-1"><span className="w-2 h-2 bg-yellow-300 rounded-full"></span> >40% (Média)</div>
                </div>
            </div>
        </div>
    </div>
  );
>>>>>>> 7b259bf36a3609da272dc14728abd757f0fb7828
}