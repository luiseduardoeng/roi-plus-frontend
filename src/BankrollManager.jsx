import { useState, useMemo } from 'react';

// --- Funções Auxiliares ---

const safeNumber = (value) => {
    const cleanValue = String(value).replace(',', '.');
    const num = parseFloat(cleanValue);
    return isNaN(num) ? 0 : num;
};

const MONTHS_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const MONTHS_ABBREVIATED = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

const MONTH_ABBREVIATIONS = {
    'JAN': 1, 'FEV': 2, 'MAR': 3, 'ABR': 4, 'MAI': 5, 'JUN': 6,
    'JUL': 7, 'AGO': 8, 'SET': 9, 'OUT': 10, 'NOV': 11, 'DEZ': 12,
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
    '7': 7, '8': 8, '9': 9, '10': 10, '11': 11, '12': 12,
};

const CSV_HEADERS = [
    "Ano", "Mês (1-12)", "Início", "Externo", "Aposta", "Investimento", "Divisão", "Banca (Nome)"
];
const CSV_EXAMPLE_ROW = [
    new Date().getFullYear(), 1, 1000.00, 0.00, 50.00, 100.00, 50, "Banca Principal"
];

const calculateMetrics = (inputs) => {
    const { month, inicio, externo, aposta, investimento, divisao } = inputs;
    const safeInicio = safeNumber(inicio);
    const safeDivisao = safeNumber(divisao);
    
    const initialInputs = {
        month: month,
        inicio: safeInicio,
        externo: safeNumber(externo),
        aposta: safeNumber(aposta),
        investimento: safeNumber(investimento),
        divisao: safeDivisao,
        bancaName: inputs.bancaName || 'Banca Padrão',
    };

    const resultadoBruto = initialInputs.aposta + initialInputs.externo - safeInicio;
    const resultadoLiquido = resultadoBruto - initialInputs.investimento;
    const finalBanca = safeInicio + resultadoLiquido;
    const unidadeValor = safeDivisao > 0 ? safeInicio / safeDivisao : 0;
    const unidadesBruto = unidadeValor > 0 ? resultadoBruto / unidadeValor : 0;
    const variacaoBruto = safeInicio > 0 ? resultadoBruto / safeInicio : 0;
    const unidadesLiquida = unidadeValor > 0 ? resultadoLiquido / unidadeValor : 0;
    const variacaoLiquida = safeInicio > 0 ? resultadoLiquido / safeInicio : 0;

    return {
        ...initialInputs,
        resultadoBruto,
        resultadoLiquido,
        finalBanca,
        unidadeValor,
        unidadesBruto,
        variacaoBruto,
        unidadesLiquida,
        variacaoLiquida,
    };
};

const InputField = ({ label, value, onChange, type = "number", min = "0", name }) => (
    <div className="flex flex-col">
        <label className="text-xs font-bold text-gray-500 uppercase mb-1 tracking-wider">{label}</label>
        <input
            type={type}
            value={value}
            onChange={onChange}
            min={min}
            name={name}
            className="w-full p-3 rounded-lg border border-gray-700 bg-gray-900 text-white focus:ring-2 focus:ring-cyan-500 outline-none placeholder-gray-600"
        />
    </div>
);

export default function BankrollManager() {
    const currentYear = new Date().getFullYear().toString();
    
    const yearsOptions = useMemo(() => {
        const last5Years = Array.from({ length: 5 }, (_, i) => (currentYear - i).toString());
        return ['Total Geral', ...last5Years];
    }, [currentYear]);

    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [selectedBanca, setSelectedBanca] = useState('Todas as Bancas');
    const [editingRecordId, setEditingRecordId] = useState(null);

    const [newMonthInputs, setNewMonthInputs] = useState({
        bancaName: 'Banca Principal',
        month: new Date().getMonth().toString(),
        inicio: 1000.00,
        externo: 0.00,
        aposta: 0.00,
        investimento: 0.00,
        divisao: 50,
    });

    const [historicalData, setHistoricalData] = useState(() => {
        const savedData = localStorage.getItem('bankrollHistory');
        return savedData ? JSON.parse(savedData) : {};
    });

    const handleInputChange = (e) => {
        const { name, value, type } = e.target;
        const newValue = type === 'number' ? safeNumber(value) : value;
        setNewMonthInputs(prev => ({ ...prev, [name]: newValue }));
    };
    
    const saveSingleRecord = (record, history) => {
        const year = record.year.toString();
        const monthIndex = record.month - 1; 
        
        if (isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) return history; 

        const calculatedMetrics = calculateMetrics({ ...record, month: monthIndex });

        const newRecord = {
            ...calculatedMetrics,
            year: year,
            month: monthIndex,
            id: record.id || `${year}-${monthIndex}-${calculatedMetrics.bancaName}`,
        };

        if (!history[year]) history[year] = [];

        const recordIndex = history[year].findIndex(r => 
            (r.month === newRecord.month && r.bancaName === newRecord.bancaName) || r.id === newRecord.id
        );
        
        if (recordIndex !== -1) {
            history[year][recordIndex] = newRecord;
        } else {
            history[year].push(newRecord);
        }
        
        return history;
    }

    const handleEditRecord = (record) => {
        if (selectedYear === 'Total Geral') {
            alert("Não é possível editar registros na visualização de Total Geral.");
            return;
        }

        if (selectedBanca === 'Todas as Bancas') {
             alert("A edição só está disponível ao filtrar por uma única banca.");
             return;
        }
        
        const monthString = record.month.toString(); 
        
        setNewMonthInputs({
            bancaName: record.bancaName,
            month: monthString,
            inicio: record.inicio,
            externo: record.externo,
            aposta: record.aposta,
            investimento: record.investimento,
            divisao: record.divisao,
        });
        
        setEditingRecordId(record.id);
        document.getElementById('manual-form').scrollIntoView({ behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingRecordId(null);
        setNewMonthInputs({
            bancaName: 'Banca Principal',
            month: new Date().getMonth().toString(), 
            inicio: 1000.00,
            externo: 0.00,
            aposta: 0.00,
            investimento: 0.00,
            divisao: 50,
        });
    }

    const handleResetHistory = () => {
        if (confirm("ATENÇÃO: Isso apagará TODOS os registros. Tem certeza?")) {
            localStorage.removeItem('bankrollHistory');
            setHistoricalData({});
            setSelectedBanca('Todas as Bancas');
            handleCancelEdit();
            alert("Histórico limpo!");
        }
    };
    
    const handleSaveMonth = () => {
        if (selectedYear === 'Total Geral') {
            alert("Selecione um ano específico para salvar registros.");
            return;
        }

        const year = selectedYear;
        const monthIndex = newMonthInputs.month;
        let updatedHistory = { ...historicalData };
        
        const recordToSave = {
            ...newMonthInputs,
            year: year,
            month: parseInt(monthIndex) + 1,
            id: editingRecordId,
        };
        
        updatedHistory = saveSingleRecord(recordToSave, updatedHistory);
        const yearRecords = updatedHistory[year];
        if (yearRecords) yearRecords.sort((a, b) => a.month - b.month);

        localStorage.setItem('bankrollHistory', JSON.stringify(updatedHistory));
        setHistoricalData(updatedHistory);
        handleCancelEdit();
        alert("Registro salvo com sucesso!");
    };
    
    const handleDownloadTemplate = () => {
        const SEPARATOR = ';'; 
        const header = CSV_HEADERS.join(SEPARATOR) + '\n';
        const exampleRow = CSV_EXAMPLE_ROW.join(SEPARATOR) + '\n';
        const csvContent = "\uFEFF" + header + exampleRow;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'template_gestao_banca_roi.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportCSV = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const csvText = event.target.result;
            const lines = csvText.trim().split('\n');
            let SEPARATOR = lines[0].includes(';') ? ';' : lines[0].includes(',') ? ',' : /\s{2,}/;
            const isRegexSplit = SEPARATOR instanceof RegExp;
            const dataLines = lines.slice(1); 
            let importedCount = 0;
            let currentHistory = { ...historicalData };

            dataLines.forEach((line) => {
                let parts;
                if (isRegexSplit) {
                    parts = line.split(/\s+/).filter(p => p.length > 0);
                } else {
                    parts = line.split(SEPARATOR);
                }
                
                if (parts.length < 8 || parts.every(p => p.trim() === '')) return; 
                
                const monthString = parts[1]?.trim().toUpperCase();
                const monthNumber = MONTH_ABBREVIATIONS[monthString] || safeNumber(parts[1]); 

                const record = {
                    year: safeNumber(parts[0]),       
                    month: monthNumber, 
                    inicio: safeNumber(parts[2]),     
                    externo: safeNumber(parts[3]),    
                    aposta: safeNumber(parts[4]),     
                    investimento: safeNumber(parts[5]), 
                    divisao: safeNumber(parts[6]),    
                    bancaName: parts[7] ? parts[7].trim().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim() : 'Banca Importada', 
                };
                currentHistory = saveSingleRecord(record, currentHistory);
                importedCount++;
            });

            Object.keys(currentHistory).forEach(year => {
                currentHistory[year].sort((a, b) => a.month - b.month);
            });

            localStorage.setItem('bankrollHistory', JSON.stringify(currentHistory));
            setHistoricalData(currentHistory);
            
            const allYears = Object.keys(currentHistory).sort().reverse();
            if (allYears.length > 0 && selectedYear !== 'Total Geral') {
                setSelectedYear(allYears[0]);
            }
            alert(`${importedCount} registros importados com sucesso!`);
        };
        reader.readAsText(file);
    };

    const availableBancas = useMemo(() => {
        const allRecords = Object.keys(historicalData).flatMap(year => historicalData[year] || []);
        const names = [...new Set(allRecords.map(d => d.bancaName).filter(name => name))];
        return names.sort();
    }, [historicalData]);
    
    // ------------------------------------------------------------------
    // LÓGICA DE DADOS DA TABELA
    // ------------------------------------------------------------------
    const filteredData = useMemo(() => {
        
        // >>> MODO TOTAL GERAL: Agrupa por ANO
        if (selectedYear === 'Total Geral') {
            const availableYears = Object.keys(historicalData).sort();
            
            return availableYears.map(year => {
                let yearRecords = historicalData[year] || [];
                
                if (selectedBanca !== 'Todas as Bancas') {
                    yearRecords = yearRecords.filter(d => d.bancaName === selectedBanca);
                }

                if (yearRecords.length === 0) return null;

                // Ordena registros do ano
                yearRecords.sort((a, b) => a.month - b.month);

                // --- Somas de Fluxo ---
                const totalInvestimento = yearRecords.reduce((sum, r) => sum + r.investimento, 0);
                const totalExterno = yearRecords.reduce((sum, r) => sum + r.externo, 0);
                const totalResBruto = yearRecords.reduce((sum, r) => sum + r.resultadoBruto, 0);
                const totalResLiquido = yearRecords.reduce((sum, r) => sum + r.resultadoLiquido, 0);
                const totalUnidadesLiq = yearRecords.reduce((sum, r) => sum + r.unidadesLiquida, 0);
                const totalUnidadesBruto = yearRecords.reduce((sum, r) => sum + r.unidadesBruto, 0);

                // --- CORREÇÃO DO INÍCIO, FINAL e APOSTA ---
                // Agrupa por Banca para calcular corretamente o Início Total e o Final Total
                const bankGroups = yearRecords.reduce((acc, r) => {
                    if (!acc[r.bancaName]) acc[r.bancaName] = [];
                    acc[r.bancaName].push(r);
                    return acc;
                }, {});

                let totalInicioAno = 0;
                let lastFinal = 0;
                let lastAposta = 0;

                Object.values(bankGroups).forEach(recs => {
                    // Ordena cronologicamente
                    recs.sort((a, b) => a.month - b.month);

                    // 1. INÍCIO: Pega o PRIMEIRO mês que tenha valor de início > 0 (ou o primeiro cronológico)
                    // Isso resolve o problema de somar apenas o primeiro registro da lista geral.
                    // Agora somamos o primeiro registro de CADA banca.
                    const firstActive = recs.find(r => r.inicio > 0) || recs[0];
                    if (firstActive) {
                        totalInicioAno += firstActive.inicio;
                    }

                    // 2. FINAL: Pega o ÚLTIMO mês com saldo
                    const last = [...recs].reverse().find(r => r.finalBanca > 0);
                    if (last) {
                        lastFinal += last.finalBanca;
                        lastAposta += last.aposta;
                    }
                });

                const variacaoLiquida = totalInicioAno > 0 ? totalResLiquido / totalInicioAno : 0;

                return {
                    id: `summary-${year}`,
                    isYearRow: true,
                    month: -1,
                    displayLabel: year,
                    bancaName: selectedBanca === 'Todas as Bancas' ? 'Múltiplas' : selectedBanca,
                    
                    inicio: totalInicioAno, // VALOR AGORA CORRETO
                    externo: totalExterno,
                    aposta: lastAposta,
                    investimento: totalInvestimento,
                    
                    resultadoBruto: totalResBruto,
                    resultadoLiquido: totalResLiquido,
                    finalBanca: lastFinal,
                    
                    unidadeValor: 0,
                    unidadesBruto: totalUnidadesBruto,
                    unidadesLiquida: totalUnidadesLiq,
                    variacaoLiquida: variacaoLiquida
                };
            }).filter(Boolean);
        }

        // >>> MODO ANO ESPECÍFICO (Lógica Mês a Mês)
        const yearlyData = historicalData[selectedYear] || [];
        
        let dataToProcess = yearlyData;
        if (selectedBanca !== 'Todas as Bancas') {
             return dataToProcess
                .filter(d => d.bancaName === selectedBanca)
                .map(d => calculateMetrics(d)) 
                .sort((a, b) => a.month - b.month);
        }

        const aggregatedByMonth = yearlyData.reduce((acc, current) => {
            const monthKey = current.month;
            if (monthKey < 0 || monthKey > 11) return acc;

            if (!acc[monthKey]) {
                acc[monthKey] = {
                    id: `${selectedYear}-${monthKey}-total`, 
                    month: monthKey,
                    year: selectedYear,
                    bancaName: 'Total Consolidado', 
                    divisao: 0, inicio: 0, externo: 0, aposta: 0, investimento: 0,
                };
            }
            // Soma simples para o consolidado mensal
            acc[monthKey].inicio += current.inicio;
            acc[monthKey].externo += current.externo;
            acc[monthKey].investimento += current.investimento;
            acc[monthKey].divisao += current.divisao; 
            acc[monthKey].aposta += current.aposta; 
            return acc;
        }, {});

        return Object.values(aggregatedByMonth)
            .map(d => calculateMetrics(d)) 
            .sort((a, b) => a.month - b.month);
        
    }, [historicalData, selectedYear, selectedBanca]);

    const formatValue = (value, isPercentage = false) => {
        const v = safeNumber(value);
        if (isPercentage) return `${(v * 100).toFixed(2)}%`;
        return `R$ ${v.toFixed(2)}`;
    };

    const getTrendClass = (value) => {
        if (value > 0) return 'text-green-400 font-bold';
        if (value < 0) return 'text-red-400 font-bold';
        return 'text-yellow-400';
    };
    
    // --- TOTAIS DO RODAPÉ (FOOTER) ---
    const annualTotals = useMemo(() => {
        if (filteredData.length === 0) {
            return {
                inicio: 0, externo: 0, aposta: 0, investimento: 0, 
                resultadoBruto: 0, resultadoLiquido: 0, final: 0
            };
        }
        
        const totals = filteredData.reduce((acc, current) => {
            // Se for Total Geral, o 'inicio' da linha já é um agregado calculado corretamente, então podemos somar.
            // Mas para garantir precisão absoluta, vamos recalcular o Início Total Geral do zero abaixo.
            if (selectedYear !== 'Total Geral') {
                 // Modo Ano: Soma normal não faz sentido para Inicio, ignoramos aqui
            } else {
                 // Modo Total Geral: As linhas já são "Por Ano", somar início de 2023 + 2024 pode duplicar se a banca continuou.
                 // Então ignoramos a soma de início aqui também.
            }

            acc.externo += current.externo;
            acc.investimento += current.investimento;
            acc.resultadoBruto += current.resultadoBruto;
            acc.resultadoLiquido += current.resultadoLiquido;
            return acc;
        }, {
            inicio: 0, externo: 0, aposta: 0, investimento: 0, 
            resultadoBruto: 0, resultadoLiquido: 0, final: 0
        });
        
        // --- LÓGICA DE TOTALIZAÇÃO FINAL ---
        
        let dataSource = [];
        if (selectedYear === 'Total Geral') {
             dataSource = Object.values(historicalData).flat();
        } else {
             dataSource = historicalData[selectedYear] || [];
        }

        if (selectedBanca !== 'Todas as Bancas') {
            dataSource = dataSource.filter(d => d.bancaName === selectedBanca);
        }

        const recordsByBank = dataSource.reduce((acc, r) => {
            if (!acc[r.bancaName]) acc[r.bancaName] = [];
            acc[r.bancaName].push(r);
            return acc;
        }, {});

        let sumFinal = 0;
        let sumAposta = 0;
        let sumInicio = 0;

        Object.values(recordsByBank).forEach(bankRecords => {
            bankRecords.sort((a, b) => {
                if (Number(a.year) !== Number(b.year)) return Number(a.year) - Number(b.year);
                return a.month - b.month;
            });

            // 1. Início Total: Pega o PRIMEIRO registro cronológico absoluto desta banca
            // Se eu tenho Banca A em 2023 (1k) e continua em 2024, o Início do "Total Geral" é 1k (capital original).
            // Se o usuário quer somar aportes anuais, a lógica seria diferente, mas geralmente "Início" é o capital inicial daquele ciclo.
            // Se estamos vendo "Total Geral" (All time), o Início deve ser o capital inicial PRIMORDIAL.
            if (bankRecords.length > 0) {
                 // Procura o primeiro com valor > 0
                const first = bankRecords.find(r => r.inicio > 0) || bankRecords[0];
                if (first) sumInicio += first.inicio;
            }

            // 2. Final Total: Pega o ÚLTIMO registro ativo
            const lastActiveRecord = [...bankRecords].reverse().find(r => r.finalBanca > 0);
            if (lastActiveRecord) {
                sumFinal += lastActiveRecord.finalBanca;
                sumAposta += lastActiveRecord.aposta;
            }
        });

        // Caso especial: Se estivermos visualizando UM ANO específico (não total geral), 
        // o Início do rodapé deve ser a soma dos inícios DESTE ANO.
        if (selectedYear !== 'Total Geral') {
             sumInicio = 0;
             Object.values(recordsByBank).forEach(bankRecords => {
                // Filtra apenas registros deste ano (já garantido pelo dataSource, mas reforçando lógica)
                const firstOfYear = bankRecords.find(r => r.inicio > 0) || bankRecords[0];
                if (firstOfYear) sumInicio += firstOfYear.inicio;
             });
        }
        // Se for Total Geral, e quisermos mostrar a soma de todos os inícios anuais (ex: aportes de 2023 + aportes de 2024)
        // Isso depende da interpretação. Se for "Capital Total Injetado", devemos somar os inícios de cada ano.
        // Vou assumir que para a LINHA DA TABELA (Ano 2025), o início é a soma das bancas de 2025.
        // Para o FOOTER do Total Geral, o início deve ser a soma de todo capital inicial já colocado (Soma dos Inícios de cada banca).
        
        totals.inicio = sumInicio;
        totals.final = sumFinal;
        totals.aposta = sumAposta;
        
        const annualVariacaoLiquida = totals.inicio > 0 ? totals.resultadoLiquido / totals.inicio : 0;
        
        return { ...totals, annualVariacaoLiquida };
    }, [filteredData, selectedBanca, historicalData, selectedYear]);

    // -----------------------------------------------------
    // RENDERIZAÇÃO
    // -----------------------------------------------------

    return (
        <div className="max-w-7xl mx-auto pb-16 pt-6 px-4">
            
            {/* 1. SEÇÃO DE FILTROS E TÍTULO */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-[#16202a] p-4 rounded-2xl border border-gray-800 shadow-md">
                <h2 className="text-xl font-bold text-gray-100 mb-4 md:mb-0">
                    <span className="bg-cyan-500/10 text-cyan-400 p-2 rounded mr-3">📊</span> 
                    Gerenciamento {selectedYear}
                </h2>

                <div className="flex space-x-4">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 tracking-wider">Período</label>
                        <select 
                            value={selectedYear} 
                            onChange={(e) => setSelectedYear(e.target.value)} 
                            className="block w-32 p-2 text-sm border-gray-700 bg-gray-900 text-white rounded-lg focus:ring-2 focus:ring-cyan-500"
                            disabled={editingRecordId !== null} 
                        >
                            {yearsOptions.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 tracking-wider">Banca</label>
                        <select 
                            value={selectedBanca} 
                            onChange={(e) => setSelectedBanca(e.target.value)} 
                            className="block w-48 p-2 text-sm border-gray-700 bg-gray-900 text-white rounded-lg focus:ring-2 focus:ring-cyan-500"
                        >
                            <option value="Todas as Bancas">Todas as Bancas</option>
                            {availableBancas.map(banca => (
                                <option key={banca} value={banca}>{banca}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* 2. TABELA */}
            <div className="bg-[#16202a] p-4 rounded-2xl border border-gray-800 mb-8 shadow-xl overflow-hidden">
                {filteredData.length === 0 ? (
                    <p className="text-gray-500 text-center py-10">
                        Nenhum registro encontrado para {selectedYear} com a banca "{selectedBanca}". 
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-xs text-left text-gray-400">
                            <thead className="text-xs text-cyan-400 uppercase bg-gray-900/50 sticky top-0">
                                <tr>
                                    <th className="px-2 py-3">{selectedYear === 'Total Geral' ? 'Ano' : 'Mês'}</th>
                                    <th className="px-2 py-3">Banca</th> 
                                    <th className="px-2 py-3 text-center whitespace-nowrap">Início</th>
                                    <th className="px-2 py-3 text-center whitespace-nowrap">R$ Unidade</th>
                                    <th className="px-2 py-3 text-center whitespace-nowrap">Inv.</th>
                                    <th className="px-2 py-3 text-center whitespace-nowrap">Aposta</th>
                                    <th className="px-2 py-3 text-center font-bold whitespace-nowrap">Res. Bruto</th>
                                    <th className="px-2 py-3 text-center font-bold whitespace-nowrap">R. Líquido</th>
                                    <th className="px-2 py-3 text-center">U. Bruto</th>
                                    <th className="px-2 py-3 text-center">U. Líq</th>
                                    <th className="px-2 py-3 text-center">% Líq</th>
                                    <th className="px-2 py-3 text-center font-black text-white whitespace-nowrap bg-gray-800/50">Final (R$)</th>
                                    <th className="px-2 py-3 text-center">Ação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.map((row) => (
                                    <tr key={row.id} className="border-b border-gray-800 hover:bg-slate-800/50 transition-colors">
                                        <td className={`px-2 py-2 whitespace-nowrap ${row.isYearRow ? 'font-black text-white text-sm' : (row.bancaName === 'Total Consolidado' ? 'font-black text-white bg-gray-800' : 'font-bold text-gray-300')}`}>
                                            {row.isYearRow ? row.displayLabel : MONTHS_ABBREVIATED[row.month]} 
                                            {selectedYear === 'Total Geral' && <span className="text-[9px] text-gray-500 ml-1">(Resumo)</span>}
                                        </td>

                                        <td className={`px-2 py-2 whitespace-nowrap max-w-[120px] truncate ${row.bancaName === 'Total Consolidado' ? 'font-black text-orange-400 bg-gray-800' : 'text-cyan-400'}`}>
                                            {row.bancaName}
                                        </td> 
                                        
                                        <td className="px-2 py-2 text-center whitespace-nowrap">{formatValue(row.inicio)}</td>
                                        <td className="px-2 py-2 text-center whitespace-nowrap text-cyan-400">{row.isYearRow ? '-' : formatValue(row.unidadeValor)}</td>
                                        <td className="px-2 py-2 text-center whitespace-nowrap">{formatValue(row.investimento)}</td>
                                        <td className="px-2 py-2 text-center whitespace-nowrap">{formatValue(row.aposta)}</td>
                                        <td className={`px-2 py-2 text-center whitespace-nowrap ${getTrendClass(row.resultadoBruto)}`}>{formatValue(row.resultadoBruto)}</td>
                                        <td className={`px-2 py-2 text-center whitespace-nowrap ${getTrendClass(row.resultadoLiquido)}`}>{formatValue(row.resultadoLiquido)}</td>
                                        
                                        <td className={`px-2 py-2 text-center ${getTrendClass(row.unidadesBruto)}`}>{row.unidadesBruto.toFixed(1)}</td>
                                        <td className={`px-2 py-2 text-center ${getTrendClass(row.unidadesLiquida)}`}>{row.unidadesLiquida.toFixed(1)}</td>
                                        <td className={`px-2 py-2 text-center ${getTrendClass(row.variacaoLiquida)}`}>{formatValue(row.variacaoLiquida, true)}</td>
                                        
                                        <td className="px-2 py-2 text-center whitespace-nowrap font-black text-white bg-gray-800/30">{formatValue(row.finalBanca)}</td>
                                        <td className="px-2 py-2 text-center">
                                            {row.bancaName !== 'Total Consolidado' && selectedYear !== 'Total Geral' && (
                                                <button onClick={() => handleEditRecord(row)} className="text-orange-400 hover:text-orange-300 transition-colors" title="Editar">
                                                    ✏️
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {/* Footer Totais */}
                                <tr className="bg-cyan-900/40 border-t-2 border-cyan-500/80 font-black">
                                     <td className="px-2 py-3 text-white uppercase tracking-wider" colSpan="2">
                                         Total {selectedYear === 'Total Geral' ? 'Geral' : selectedYear}
                                     </td>
                                     <td className="px-2 py-3 text-center whitespace-nowrap text-cyan-300">{formatValue(annualTotals.inicio)}</td>
                                     <td className="px-2 py-3 text-center text-cyan-300">-</td>
                                     <td className="px-2 py-3 text-center whitespace-nowrap text-cyan-300">{formatValue(annualTotals.investimento)}</td>
                                     <td className="px-2 py-3 text-center whitespace-nowrap text-cyan-300">{formatValue(annualTotals.aposta)}</td>
                                     <td className={`px-2 py-3 text-center whitespace-nowrap ${getTrendClass(annualTotals.resultadoBruto)}`}>{formatValue(annualTotals.resultadoBruto)}</td>
                                     <td className={`px-2 py-3 text-center whitespace-nowrap ${getTrendClass(annualTotals.resultadoLiquido)}`}>{formatValue(annualTotals.resultadoLiquido)}</td>
                                     <td className="px-2 py-3 text-center text-cyan-300">-</td> 
                                     <td className="px-2 py-3 text-center text-cyan-300">-</td>
                                     <td className={`px-2 py-3 text-center ${getTrendClass(annualTotals.annualVariacaoLiquida)}`}>{formatValue(annualTotals.annualVariacaoLiquida, true)}</td>
                                     <td className="px-2 py-3 text-center whitespace-nowrap text-white bg-gray-800/50">{formatValue(annualTotals.final)}</td>
                                     <td className="px-2 py-3 text-center">-</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <hr className="border-gray-800 my-10" />

            {/* 3. FORMULÁRIO */}
            {selectedYear !== 'Total Geral' ? (
                <div id="manual-form" className="bg-[#16202a] p-6 rounded-2xl shadow-lg border border-gray-800 mb-8 border-l-4 border-l-cyan-600">
                    <h3 className="text-sm font-bold text-gray-300 uppercase mb-4 flex items-center">
                        <span className="bg-cyan-500/10 text-cyan-400 p-1.5 rounded mr-3">{editingRecordId ? '✏️' : '➕'}</span> 
                        {editingRecordId ? 'Editando Registro' : 'Novo Registro Mensal'}
                    </h3>
                    
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
                        <InputField label="Banca (Nome)" value={newMonthInputs.bancaName} onChange={(e) => setNewMonthInputs(prev => ({ ...prev, bancaName: e.target.value }))} type="text" />
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1 tracking-wider">Mês</label>
                            <select name="month" value={newMonthInputs.month} onChange={handleInputChange} className="block w-full p-3 text-sm border-gray-700 bg-gray-900 text-white rounded-lg focus:ring-2 focus:ring-cyan-500" disabled={editingRecordId !== null}>
                                {MONTHS_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                            </select>
                        </div>
                        <InputField label="Início (R$)" value={newMonthInputs.inicio} onChange={handleInputChange} name="inicio" />
                        <InputField label="Aposta Final (R$)" value={newMonthInputs.aposta} onChange={handleInputChange} name="aposta" />
                        <InputField label="Investimento (R$)" value={newMonthInputs.investimento} onChange={handleInputChange} name="investimento" />
                        <InputField label="Divisão" value={newMonthInputs.divisao} onChange={handleInputChange} name="divisao" />
                    </div>
                    
                    <div className="mt-4 flex justify-end space-x-3">
                        {editingRecordId && <button onClick={handleCancelEdit} className="text-gray-400 hover:text-gray-300 font-bold py-3 px-6 rounded-xl transition-all">Cancelar</button>}
                        <button onClick={handleSaveMonth} className={`font-bold py-3 px-6 rounded-xl transition-all shadow-lg ${editingRecordId ? 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-900/20' : 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-cyan-900/20'}`}>{editingRecordId ? 'Atualizar' : `Salvar em ${selectedYear}`}</button>
                    </div>
                </div>
            ) : (
                <div className="bg-yellow-900/20 p-4 rounded-xl border border-yellow-800 text-center text-yellow-400 mb-8">
                    <p className="text-sm">Você está visualizando o <strong>Total Geral</strong>. Selecione um ano específico para adicionar ou editar.</p>
                </div>
            )}

            {/* 4. IMPORTAÇÃO */}
            <div className="bg-[#16202a] p-6 rounded-2xl shadow-lg border border-gray-800 mb-8 border-l-4 border-l-orange-500">
                <h3 className="text-sm font-bold text-gray-300 uppercase mb-4 flex items-center">
                    <span className="bg-orange-500/10 text-orange-400 p-1.5 rounded mr-3">📥</span> Importar Histórico
                </h3>
                <div className="flex justify-between items-center mb-4">
                    <p className="text-xs text-gray-500">Formato CSV: Ano; Mês; Início; Externo; Aposta; Inv; Divisão; Banca</p>
                    <div className="flex space-x-3">
                        <button onClick={handleResetHistory} className="text-xs font-semibold text-red-400 hover:text-red-300">Resetar</button>
                        <button onClick={handleDownloadTemplate} className="text-xs font-semibold text-cyan-400 hover:text-cyan-300">Baixar Modelo</button>
                    </div>
                </div>
                <input key={selectedYear} type="file" accept=".csv" onChange={handleImportCSV} className="block w-full text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-cyan-500/20 file:text-cyan-400 hover:file:bg-cyan-500/30" />
            </div>

        </div>
    );
}
