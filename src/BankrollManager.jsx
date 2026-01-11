import { useState, useMemo, useEffect } from 'react';
import { db } from './firebaseConfig';
import { 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    query, 
    where, 
    onSnapshot,
    writeBatch,
    getDocs
} from 'firebase/firestore';

// --- Funções Auxiliares ---

const safeNumber = (value) => {
    if (typeof value === 'number') return value;
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
        month: Number(month),
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

export default function BankrollManager({ user }) {
    const currentYear = new Date().getFullYear().toString();
    
    const yearsOptions = useMemo(() => {
        const lastYears = Array.from({ length: 7 }, (_, i) => (currentYear - i).toString());
        return ['Total Geral', ...lastYears];
    }, [currentYear]);

    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [selectedBanca, setSelectedBanca] = useState('Todas as Bancas');
    const [editingRecordId, setEditingRecordId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [historicalData, setHistoricalData] = useState({});

    const [newMonthInputs, setNewMonthInputs] = useState({
        bancaName: 'Banca Principal',
        month: new Date().getMonth().toString(),
        inicio: 1000.00,
        externo: 0.00,
        aposta: 0.00,
        investimento: 0.00,
        divisao: 50,
    });

    useEffect(() => {
        if (!user) {
            setHistoricalData({});
            return;
        }

        setLoading(true);
        const q = query(
            collection(db, "bankroll_records"),
            where("userId", "==", user.uid)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const dataByYear = {};
            snapshot.forEach((doc) => {
                const data = doc.data();
                const record = { id: doc.id, ...data };
                const year = String(record.year);
                if (!dataByYear[year]) dataByYear[year] = [];
                dataByYear[year].push(record);
            });

            Object.keys(dataByYear).forEach(year => {
                dataByYear[year].sort((a, b) => a.month - b.month);
            });

            setHistoricalData(dataByYear);
            setLoading(false);
        }, (error) => {
            console.error("Erro ao sincronizar dados:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const handleInputChange = (e) => {
        const { name, value, type } = e.target;
        const newValue = type === 'number' ? safeNumber(value) : value;
        setNewMonthInputs(prev => ({ ...prev, [name]: newValue }));
    };
    
    const handleDeleteRecord = async (recordId) => {
        if (!confirm("Tem certeza que deseja excluir este registro?")) return;
        try {
            await deleteDoc(doc(db, "bankroll_records", recordId));
            alert("Registro excluído com sucesso.");
        } catch (error) {
            console.error("Erro ao excluir:", error);
            alert("Erro ao excluir registro.");
        }
    };

    const handleSaveMonth = async () => {
        if (!user) {
            alert("Você precisa estar logado para salvar dados.");
            return;
        }
        if (selectedYear === 'Total Geral') {
            alert("Selecione um ano específico para salvar registros.");
            return;
        }

        const year = parseInt(selectedYear);
        const monthIndex = parseInt(newMonthInputs.month);
        const currentBancaName = newMonthInputs.bancaName.trim();
        
        const metrics = calculateMetrics({ 
            ...newMonthInputs, 
            month: monthIndex 
        });

        const recordData = {
            userId: user.uid,
            year: year,
            month: monthIndex,
            ...metrics,
            updatedAt: new Date()
        };

        try {
            let docIdToUpdate = editingRecordId;

            if (!docIdToUpdate) {
                const checkQuery = query(
                    collection(db, "bankroll_records"),
                    where("userId", "==", user.uid),
                    where("year", "==", year),
                    where("month", "==", monthIndex),
                    where("bancaName", "==", currentBancaName)
                );
                
                const querySnapshot = await getDocs(checkQuery);
                if (!querySnapshot.empty) {
                    docIdToUpdate = querySnapshot.docs[0].id;
                }
            }

            if (docIdToUpdate) {
                const docRef = doc(db, "bankroll_records", docIdToUpdate);
                await updateDoc(docRef, recordData);
                alert("Registro atualizado com sucesso!");
            } else {
                await addDoc(collection(db, "bankroll_records"), {
                    ...recordData,
                    createdAt: new Date()
                });
                alert("Novo mês registrado com sucesso!");
            }
            
            handleCancelEdit();
        } catch (error) {
            console.error("Erro ao salvar:", error);
            alert("Erro ao salvar no banco de dados.");
        }
    };

    const handleResetHistory = async () => {
        if (!user) return;
        
        if (confirm("ATENÇÃO: Isso apagará TODOS os seus registros de banca na nuvem. Essa ação não pode ser desfeita. Tem certeza?")) {
            try {
                const allIds = Object.values(historicalData).flat().map(r => r.id);
                if (allIds.length === 0) {
                    alert("Não há registros para apagar.");
                    return;
                }

                const chunkSize = 400;
                for (let i = 0; i < allIds.length; i += chunkSize) {
                    const chunk = allIds.slice(i, i + chunkSize);
                    const batch = writeBatch(db);
                    chunk.forEach(id => {
                        const ref = doc(db, "bankroll_records", id);
                        batch.delete(ref);
                    });
                    await batch.commit();
                }

                alert("Histórico limpo com sucesso!");
                setHistoricalData({});
                setSelectedBanca('Todas as Bancas');
                handleCancelEdit();

            } catch (error) {
                console.error("Erro ao resetar:", error);
                alert("Erro ao limpar histórico.");
            }
        }
    };

    const handleEditRecord = (record) => {
        if (selectedYear === 'Total Geral') {
            alert("Não é possível editar registros na visualização de Total Geral.");
            return;
        }
        if (selectedBanca === 'Todas as Bancas') {
             alert("A edição só está disponível ao filtrar por uma única banca.");
             return;
        }
        
        setNewMonthInputs({
            bancaName: record.bancaName,
            month: record.month.toString(),
            inicio: record.inicio,
            externo: record.externo || 0,
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
    
    // --- IMPORTAÇÃO DE CSV ---
    const handleImportCSV = (e) => {
        const file = e.target.files[0];
        if (!file || !user) {
            if(!user) alert("Faça login para importar.");
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            const csvText = event.target.result;
            const lines = csvText.trim().split('\n');
            let SEPARATOR = lines[0].includes(';') ? ';' : lines[0].includes(',') ? ',' : /\s{2,}/;
            const isRegexSplit = SEPARATOR instanceof RegExp;
            const dataLines = lines.slice(1); 
            
            const recordsToSave = [];
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
                let monthIndex = monthNumber;
                if (monthNumber >= 1 && monthNumber <= 12) monthIndex = monthNumber - 1;

                const rawRecord = {
                    year: safeNumber(parts[0]),        
                    month: monthIndex, 
                    inicio: safeNumber(parts[2]),       
                    externo: safeNumber(parts[3]),      
                    aposta: safeNumber(parts[4]),       
                    investimento: safeNumber(parts[5]), 
                    divisao: safeNumber(parts[6]),      
                    bancaName: parts[7] ? parts[7].trim().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim() : 'Banca Importada', 
                };

                const metrics = calculateMetrics(rawRecord);
                
                recordsToSave.push({
                    userId: user.uid,
                    ...metrics,
                    year: parseInt(rawRecord.year),
                    createdAt: new Date()
                });
            });

            const CHUNK_SIZE = 450;
            let importedCount = 0;

            try {
                for (let i = 0; i < recordsToSave.length; i += CHUNK_SIZE) {
                    const chunk = recordsToSave.slice(i, i + CHUNK_SIZE);
                    const batch = writeBatch(db);

                    chunk.forEach(record => {
                        const docRef = doc(collection(db, "bankroll_records"));
                        batch.set(docRef, record);
                    });

                    await batch.commit();
                    importedCount += chunk.length;
                }

                alert(`${importedCount} registros importados com sucesso!`);
                
                const allYears = Object.keys(historicalData).sort().reverse();
                if (allYears.length > 0 && selectedYear !== 'Total Geral') {
                    setSelectedYear(allYears[0]);
                }
            } catch (error) {
                console.error("Erro na importação em lote:", error);
                alert("Erro ao enviar dados para a nuvem. Verifique o console para detalhes.");
            }
        };
        reader.readAsText(file);
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

    const availableBancas = useMemo(() => {
        const allRecords = Object.values(historicalData).flat();
        const names = [...new Set(allRecords.map(d => d.bancaName).filter(name => name))];
        return names.sort();
    }, [historicalData]);
    
    // --- CÁLCULO DE SAQUES (ANO A ANO: Final Prev - Inicio Curr) ---
    const withdrawalsData = useMemo(() => {
        const years = Object.keys(historicalData).sort();
        const banks = availableBancas;
        const result = [];

        for (let i = 0; i < years.length - 1; i++) {
            const currentYear = years[i];
            const nextYear = years[i+1];
            const rowData = { year: currentYear, banks: {}, total: 0 };

            const currentYearRecords = historicalData[currentYear] || [];
            const nextYearRecords = historicalData[nextYear] || [];

            banks.forEach(bank => {
                const bankRecordsCurr = currentYearRecords.filter(r => r.bancaName === bank);
                bankRecordsCurr.sort((a,b) => a.month - b.month);
                const lastRecord = bankRecordsCurr[bankRecordsCurr.length - 1];
                const finalVal = lastRecord ? lastRecord.finalBanca : 0;

                const bankRecordsNext = nextYearRecords.filter(r => r.bancaName === bank);
                bankRecordsNext.sort((a,b) => a.month - b.month);
                const firstRecord = bankRecordsNext[0]; 
                const startVal = firstRecord ? firstRecord.inicio : 0;

                // SAQUE: FINAL ANO ANTERIOR - INICIO ANO SEGUINTE (POSITIVO)
                let diff = 0;
                if (lastRecord && firstRecord) {
                    const rawDiff = finalVal - startVal;
                    if (rawDiff > 0) diff = rawDiff;
                }

                rowData.banks[bank] = diff;
                rowData.total += diff;
            });
            result.push(rowData);
        }
        return result;
    }, [historicalData, availableBancas]);

    const withdrawalsTotal = useMemo(() => {
        if (withdrawalsData.length === 0) return null;
        return withdrawalsData.reduce((acc, row) => {
            availableBancas.forEach(banca => {
                acc[banca] = (acc[banca] || 0) + (row.banks[banca] || 0);
            });
            acc.total += row.total;
            return acc;
        }, { total: 0 });
    }, [withdrawalsData, availableBancas]);

    // --- CÁLCULO DE INVESTIMENTOS ---
    const investmentsTableData = useMemo(() => {
        const years = Object.keys(historicalData).sort();
        const banks = availableBancas;
        const result = [];

        for (let i = 0; i < years.length; i++) {
            const currentYear = years[i];
            const prevYear = i > 0 ? years[i-1] : null;
            const rowData = { year: currentYear, banks: {}, total: 0 };

            const currentYearRecords = historicalData[currentYear] || [];
            const prevYearRecords = prevYear ? (historicalData[prevYear] || []) : [];

            banks.forEach(bank => {
                const bankRecordsCurr = currentYearRecords.filter(r => r.bancaName === bank);
                bankRecordsCurr.sort((a,b) => a.month - b.month);
                const firstRecord = bankRecordsCurr[0];
                const startVal = firstRecord ? firstRecord.inicio : 0;

                let finalVal = 0;
                let hasPrevRecord = false;
                
                if (prevYear) {
                    const bankRecordsPrev = prevYearRecords.filter(r => r.bancaName === bank);
                    bankRecordsPrev.sort((a,b) => a.month - b.month);
                    const lastRecord = bankRecordsPrev[bankRecordsPrev.length - 1];
                    if (lastRecord) {
                        finalVal = lastRecord.finalBanca;
                        hasPrevRecord = true;
                    }
                }

                let investment = 0;
                if (firstRecord) {
                    if (!hasPrevRecord) {
                        investment = startVal;
                    } else {
                        const diff = startVal - finalVal;
                        if (diff > 0) investment = diff;
                    }
                }

                rowData.banks[bank] = investment;
                rowData.total += investment;
            });
            
            result.push(rowData);
        }
        return result;
    }, [historicalData, availableBancas]);

    const investmentsTotal = useMemo(() => {
        if (investmentsTableData.length === 0) return null;
        return investmentsTableData.reduce((acc, row) => {
            availableBancas.forEach(banca => {
                acc[banca] = (acc[banca] || 0) + (row.banks[banca] || 0);
            });
            acc.total += row.total;
            return acc;
        }, { total: 0 });
    }, [investmentsTableData, availableBancas]);

    // --- DASHBOARD GERAL (4 QUADRADOS) ---
    const dashboardStats = useMemo(() => {
        const totalInvestido = investmentsTotal ? investmentsTotal.total : 0;
        const totalSaques = withdrawalsTotal ? withdrawalsTotal.total : 0;

        let currentEquity = 0;
        const years = Object.keys(historicalData).sort();
        if (years.length > 0) {
            const lastYear = years[years.length - 1];
            const lastYearRecords = historicalData[lastYear] || [];
            
            availableBancas.forEach(bank => {
                const bankRecords = lastYearRecords.filter(r => r.bancaName === bank);
                bankRecords.sort((a, b) => a.month - b.month);
                const lastRecord = bankRecords[bankRecords.length - 1];
                if (lastRecord) {
                    currentEquity += lastRecord.finalBanca;
                }
            });
        }

        // FÓRMULA ATUALIZADA: ((Saldo + Saques) / Investido) 
        // OBS: Removemos o *100 daqui porque o formatValue já faz isso quando isPercentage=true
        const rawReturn = currentEquity + totalSaques;
        const roi = totalInvestido > 0 ? (rawReturn / totalInvestido) : 0;

        return {
            totalInvestido,
            totalSaques,
            currentEquity, // Saldo Atual das Bancas
            roi
        };
    }, [investmentsTotal, withdrawalsTotal, historicalData, availableBancas]);


    const filteredData = useMemo(() => {
        if (selectedYear === 'Total Geral') {
            const availableYears = Object.keys(historicalData).sort();
            return availableYears.map(year => {
                let yearRecords = historicalData[year] || [];
                if (selectedBanca !== 'Todas as Bancas') {
                    yearRecords = yearRecords.filter(d => d.bancaName === selectedBanca);
                }
                if (yearRecords.length === 0) return null;
                yearRecords.sort((a, b) => a.month - b.month);

                const totalInvestimento = yearRecords.reduce((sum, r) => sum + r.investimento, 0);
                const totalResBruto = yearRecords.reduce((sum, r) => sum + r.resultadoBruto, 0);
                const totalResLiquido = yearRecords.reduce((sum, r) => sum + r.resultadoLiquido, 0);

                const bankGroups = yearRecords.reduce((acc, r) => {
                    if (!acc[r.bancaName]) acc[r.bancaName] = [];
                    acc[r.bancaName].push(r);
                    return acc;
                }, {});

                let totalInicioAno = 0;
                let lastFinal = 0;
                let lastAposta = 0;
                let lastExterno = 0; 
                let lastDivisao = 0;
                
                Object.values(bankGroups).forEach(recs => {
                    recs.sort((a, b) => a.month - b.month);
                    const firstActive = recs.find(r => r.inicio > 0) || recs[0];
                    if (firstActive) totalInicioAno += firstActive.inicio;
                    const last = [...recs].reverse().find(r => r.finalBanca > 0);
                    if (last) {
                        lastFinal += last.finalBanca;
                        lastAposta += last.aposta;
                        lastExterno += last.externo;
                        lastDivisao = last.divisao; 
                    }
                });

                const variacaoLiquida = totalInicioAno > 0 ? totalResLiquido / totalInicioAno : 0;
                
                const yearUnidadeValor = lastDivisao > 0 ? lastAposta / lastDivisao : 0;
                
                const totalUnidadesBruto = yearUnidadeValor > 0 ? totalResBruto / yearUnidadeValor : 0;
                const totalUnidadesLiq = yearUnidadeValor > 0 ? totalResLiquido / yearUnidadeValor : 0;

                return {
                    id: `summary-${year}`,
                    isYearRow: true,
                    month: -1,
                    displayLabel: year,
                    bancaName: selectedBanca === 'Todas as Bancas' ? 'Múltiplas' : selectedBanca,
                    inicio: totalInicioAno,
                    externo: lastExterno,
                    divisao: lastDivisao,
                    aposta: lastAposta,
                    investimento: totalInvestimento,
                    resultadoBruto: totalResBruto,
                    resultadoLiquido: totalResLiquido,
                    finalBanca: lastFinal,
                    unidadeValor: yearUnidadeValor, 
                    unidadesBruto: totalUnidadesBruto,
                    unidadesLiquida: totalUnidadesLiq,
                    variacaoLiquida: variacaoLiquida
                };
            }).filter(Boolean);
        }

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
            acc[monthKey].inicio += current.inicio;
            acc[monthKey].externo += current.externo;
            acc[monthKey].investimento += current.investimento;
            acc[monthKey].divisao = current.divisao; 
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
    
    // --- LÓGICA DO TOTAL GERAL (ANNUAL TOTALS) ---
    const annualTotals = useMemo(() => {
        if (filteredData.length === 0) return { inicio: 0, externo: 0, aposta: 0, investimento: 0, resultadoBruto: 0, resultadoLiquido: 0, final: 0, divisao: 0 };
        
        const totals = filteredData.reduce((acc, current) => {
            acc.investimento += current.investimento;
            acc.resultadoBruto += current.resultadoBruto;
            acc.resultadoLiquido += current.resultadoLiquido;
            return acc;
        }, { inicio: 0, externo: 0, aposta: 0, investimento: 0, resultadoBruto: 0, resultadoLiquido: 0, final: 0, divisao: 0 });
        
        let dataSource = [];
        if (selectedYear === 'Total Geral') dataSource = Object.values(historicalData).flat();
        else dataSource = historicalData[selectedYear] || [];

        if (selectedBanca !== 'Todas as Bancas') dataSource = dataSource.filter(d => d.bancaName === selectedBanca);

        const recordsByBank = dataSource.reduce((acc, r) => {
            if (!acc[r.bancaName]) acc[r.bancaName] = [];
            acc[r.bancaName].push(r);
            return acc;
        }, {});

        let sumFinal = 0;
        let sumAposta = 0;
        let sumInicio = 0;
        let sumExterno = 0;
        let lastDivisao = 0;

        Object.values(recordsByBank).forEach(bankRecords => {
            bankRecords.sort((a, b) => {
                if (Number(a.year) !== Number(b.year)) return Number(a.year) - Number(b.year);
                return a.month - b.month;
            });
            if (bankRecords.length > 0) {
                const first = bankRecords.find(r => r.inicio > 0) || bankRecords[0];
                if (first) sumInicio += first.inicio;
            }
            const lastActiveRecord = [...bankRecords].reverse().find(r => r.finalBanca > 0);
            if (lastActiveRecord) {
                sumFinal += lastActiveRecord.finalBanca;
                sumAposta += lastActiveRecord.aposta;
                sumExterno += lastActiveRecord.externo;
                lastDivisao = lastActiveRecord.divisao; 
            }
        });

        if (selectedYear !== 'Total Geral') {
             sumInicio = 0;
             Object.values(recordsByBank).forEach(bankRecords => {
                const firstOfYear = bankRecords.find(r => r.inicio > 0) || bankRecords[0];
                if (firstOfYear) sumInicio += firstOfYear.inicio;
             });
        }
        
        totals.inicio = sumInicio;
        totals.final = sumFinal;
        totals.aposta = sumAposta;
        totals.externo = sumExterno;
        totals.divisao = lastDivisao;

        // --- CÁLCULOS ESPECÍFICOS PARA O TOTAL ---
        const totalUnidadeValor = totals.divisao > 0 ? totals.aposta / totals.divisao : 0;
        
        // --- MÉDIA DA UNIDADE PARA O TOTAL GERAL ---
        let averageUnitValue = 0;
        if (selectedYear === 'Total Geral') {
            const validUnitRows = filteredData.filter(r => r.unidadeValor > 0);
            const sumUnits = validUnitRows.reduce((acc, r) => acc + r.unidadeValor, 0);
            averageUnitValue = validUnitRows.length > 0 ? sumUnits / validUnitRows.length : 0;
        }

        const divisorParaUnidades = selectedYear === 'Total Geral' ? averageUnitValue : totalUnidadeValor;

        const totalUnidadesBruto = divisorParaUnidades > 0 ? totals.resultadoBruto / divisorParaUnidades : 0;
        const totalUnidadesLiquida = divisorParaUnidades > 0 ? totals.resultadoLiquido / divisorParaUnidades : 0;
        
        const annualVariacaoLiquida = totals.inicio > 0 ? totals.resultadoLiquido / totals.inicio : 0;

        return { 
            ...totals, 
            annualVariacaoLiquida, 
            totalUnidadeValor, 
            totalUnidadesBruto, 
            totalUnidadesLiquida,
            averageUnitValue 
        };
    }, [filteredData, selectedBanca, historicalData, selectedYear]);

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-[#16202a] rounded-2xl border border-gray-800 shadow-xl max-w-4xl mx-auto mt-8">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 text-cyan-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <h3 className="text-xl font-bold text-gray-200 mb-2">Acesso Restrito</h3>
                <p className="text-sm">Faça login para gerenciar sua banca na nuvem.</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto pb-16 pt-6 px-4">
            {loading && <div className="text-xs text-center text-cyan-500 mb-2 animate-pulse">Sincronizando dados...</div>}

            <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-[#16202a] p-4 rounded-2xl border border-gray-800 shadow-md">
                <h2 className="text-xl font-bold text-gray-100 mb-4 md:mb-0">
                    <span className="bg-cyan-500/10 text-cyan-400 p-2 rounded mr-3">📊</span> 
                    Gerenciamento {selectedYear}
                </h2>
                <div className="flex space-x-4">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 tracking-wider">Período</label>
                        <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="block w-32 p-2 text-sm border-gray-700 bg-gray-900 text-white rounded-lg focus:ring-2 focus:ring-cyan-500" disabled={editingRecordId !== null}>
                            {yearsOptions.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 tracking-wider">Banca</label>
                        <select value={selectedBanca} onChange={(e) => setSelectedBanca(e.target.value)} className="block w-48 p-2 text-sm border-gray-700 bg-gray-900 text-white rounded-lg focus:ring-2 focus:ring-cyan-500">
                            <option value="Todas as Bancas">Todas as Bancas</option>
                            {availableBancas.map(banca => <option key={banca} value={banca}>{banca}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* --- DASHBOARD (4 QUADRADOS) --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-[#16202a] p-4 rounded-xl border border-gray-800 shadow-lg flex flex-col items-center justify-center">
                    <span className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">Total Investido</span>
                    <span className="text-2xl font-black text-cyan-400">{formatValue(dashboardStats.totalInvestido)}</span>
                </div>
                {/* NOVO QUADRADO: SALDO BANCAS */}
                <div className="bg-[#16202a] p-4 rounded-xl border border-gray-800 shadow-lg flex flex-col items-center justify-center">
                    <span className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">Saldo Bancas</span>
                    <span className="text-2xl font-black text-indigo-400">{formatValue(dashboardStats.currentEquity)}</span>
                </div>
                <div className="bg-[#16202a] p-4 rounded-xl border border-gray-800 shadow-lg flex flex-col items-center justify-center">
                    <span className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">Total Saques</span>
                    <span className="text-2xl font-black text-green-400">{formatValue(dashboardStats.totalSaques)}</span>
                </div>
                <div className="bg-[#16202a] p-4 rounded-xl border border-gray-800 shadow-lg flex flex-col items-center justify-center">
                    <span className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">ROI Geral</span>
                    <span className={`text-2xl font-black ${getTrendClass(dashboardStats.roi)}`}>{formatValue(dashboardStats.roi, true)}</span>
                </div>
            </div>

            <div className="bg-[#16202a] p-4 rounded-2xl border border-gray-800 mb-8 shadow-xl overflow-hidden">
                {filteredData.length === 0 ? (
                    <p className="text-gray-500 text-center py-10">Nenhum registro encontrado para {selectedYear}.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-xs text-left text-gray-400">
                            <thead className="text-xs text-cyan-400 uppercase bg-gray-900/50 sticky top-0">
                                <tr>
                                    <th className="px-2 py-3">{selectedYear === 'Total Geral' ? 'Ano' : 'Mês'}</th>
                                    <th className="px-2 py-3">Banca</th> 
                                    <th className="px-2 py-3 text-center whitespace-nowrap">Início</th>
                                    {/* COLUNA EXTERNO OCULTA */}
                                    <th className="px-2 py-3 text-center whitespace-nowrap">Aposta</th>
                                    <th className="px-2 py-3 text-center whitespace-nowrap">Inv.</th>
                                    <th className="px-2 py-3 text-center whitespace-nowrap text-gray-500">Divisão</th>
                                    <th className="px-2 py-3 text-center whitespace-nowrap">R$ Unidade</th>
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
                                        <td className={`px-2 py-2 whitespace-nowrap max-w-[120px] truncate ${row.bancaName === 'Total Consolidado' ? 'font-black text-orange-400 bg-gray-800' : 'text-cyan-400'}`}>{row.bancaName}</td> 
                                        <td className="px-2 py-2 text-center whitespace-nowrap">{formatValue(row.inicio)}</td>
                                        
                                        {/* COLUNA EXTERNO OCULTA */}
                                        <td className="px-2 py-2 text-center whitespace-nowrap">{formatValue(row.aposta)}</td>
                                        <td className="px-2 py-2 text-center whitespace-nowrap">{formatValue(row.investimento)}</td>
                                        <td className="px-2 py-2 text-center whitespace-nowrap text-gray-500">{row.divisao}</td>
                                        <td className="px-2 py-2 text-center whitespace-nowrap text-cyan-400">{formatValue(row.unidadeValor)}</td>
                                        
                                        <td className={`px-2 py-2 text-center whitespace-nowrap ${getTrendClass(row.resultadoBruto)}`}>{formatValue(row.resultadoBruto)}</td>
                                        <td className={`px-2 py-2 text-center whitespace-nowrap ${getTrendClass(row.resultadoLiquido)}`}>{formatValue(row.resultadoLiquido)}</td>
                                        <td className={`px-2 py-2 text-center ${getTrendClass(row.unidadesBruto)}`}>{row.unidadesBruto.toFixed(1)}</td>
                                        <td className={`px-2 py-2 text-center ${getTrendClass(row.unidadesLiquida)}`}>{row.unidadesLiquida.toFixed(1)}</td>
                                        <td className={`px-2 py-2 text-center ${getTrendClass(row.variacaoLiquida)}`}>{formatValue(row.variacaoLiquida, true)}</td>
                                        <td className="px-2 py-2 text-center whitespace-nowrap font-black text-white bg-gray-800/30">{formatValue(row.finalBanca)}</td>
                                        <td className="px-2 py-2 text-center">
                                            {row.bancaName !== 'Total Consolidado' && selectedYear !== 'Total Geral' && (
                                                <button onClick={() => handleDeleteRecord(row.id)} className="text-red-500 hover:text-red-400 transition-colors" title="Excluir">🗑️</button>
                                            )}
                                            {row.bancaName !== 'Total Consolidado' && selectedYear !== 'Total Geral' && (
                                                <button onClick={() => handleEditRecord(row)} className="text-orange-400 hover:text-orange-300 transition-colors ml-2" title="Editar">✏️</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                <tr className="bg-cyan-900/40 border-t-2 border-cyan-500/80 font-black">
                                     <td className="px-2 py-3 text-white uppercase tracking-wider" colSpan="2">Total {selectedYear === 'Total Geral' ? 'Geral' : selectedYear}</td>
                                     
                                     <td className="px-2 py-3 text-center whitespace-nowrap text-cyan-300">{selectedYear === 'Total Geral' ? '-' : formatValue(annualTotals.inicio)}</td>
                                     
                                     {/* COLUNA EXTERNO OCULTA */}
                                     
                                     <td className="px-2 py-3 text-center whitespace-nowrap text-cyan-300">{selectedYear === 'Total Geral' ? '-' : formatValue(annualTotals.aposta)}</td>
                                     
                                     <td className="px-2 py-3 text-center whitespace-nowrap text-cyan-300">{formatValue(annualTotals.investimento)}</td>
                                     <td className="px-2 py-3 text-center whitespace-nowrap text-gray-500">{annualTotals.divisao}</td>
                                     
                                     <td className="px-2 py-3 text-center whitespace-nowrap text-cyan-300">
                                         {selectedYear === 'Total Geral' 
                                            ? formatValue(annualTotals.averageUnitValue) 
                                            : formatValue(annualTotals.totalUnidadeValor)}
                                     </td>
                                     
                                     <td className={`px-2 py-3 text-center whitespace-nowrap ${getTrendClass(annualTotals.resultadoBruto)}`}>{formatValue(annualTotals.resultadoBruto)}</td>
                                     <td className={`px-2 py-3 text-center whitespace-nowrap ${getTrendClass(annualTotals.resultadoLiquido)}`}>{formatValue(annualTotals.resultadoLiquido)}</td>
                                     
                                     <td className={`px-2 py-3 text-center ${getTrendClass(annualTotals.totalUnidadesBruto)}`}>{annualTotals.totalUnidadesBruto.toFixed(1)}</td>
                                     <td className={`px-2 py-3 text-center ${getTrendClass(annualTotals.totalUnidadesLiquida)}`}>{annualTotals.totalUnidadesLiquida.toFixed(1)}</td>
                                     
                                     <td className={`px-2 py-3 text-center ${getTrendClass(annualTotals.annualVariacaoLiquida)}`}>{formatValue(annualTotals.annualVariacaoLiquida, true)}</td>
                                     <td className="px-2 py-3 text-center whitespace-nowrap text-white bg-gray-800/50">{formatValue(annualTotals.final)}</td>
                                     <td className="px-2 py-3 text-center">-</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* --- TABELA DE SAQUES --- */}
            {withdrawalsData.length > 0 && selectedYear === 'Total Geral' && (
                <div className="mb-8 bg-[#16202a] p-4 rounded-2xl border border-gray-800 shadow-xl">
                    <h3 className="text-lg font-bold text-gray-100 mb-4 flex items-center">
                        <span className="bg-green-500/10 text-green-400 p-2 rounded mr-3">💸</span> Histórico de Saques
                        <span className="text-[10px] font-normal text-gray-500 ml-2 uppercase tracking-wide">(Final Ano Anterior - Início Ano Seguinte)</span>
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-xs text-left text-gray-400">
                            <thead className="text-xs text-green-400 uppercase bg-gray-900/50">
                                <tr>
                                    <th className="px-4 py-3">Ano Ref.</th>
                                    {availableBancas.map(b => <th key={b} className="px-4 py-3 text-center">{b}</th>)}
                                    <th className="px-4 py-3 text-center text-white">Total Saques</th>
                                </tr>
                            </thead>
                            <tbody>
                                {withdrawalsData.map((row) => (
                                    <tr key={row.year} className="border-b border-gray-800 hover:bg-slate-800/50 transition-colors">
                                        <td className="px-4 py-3 font-bold text-gray-300">{row.year}</td>
                                        {availableBancas.map(b => (
                                            <td key={b} className={`px-4 py-3 text-center ${getTrendClass(row.banks[b])}`}>
                                                {formatValue(row.banks[b] || 0)}
                                            </td>
                                        ))}
                                        <td className={`px-4 py-3 text-center font-black bg-gray-800/50 ${getTrendClass(row.total)}`}>
                                            {formatValue(row.total)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            {withdrawalsTotal && (
                                <tfoot>
                                    <tr className="bg-green-900/30 font-black border-t-2 border-green-700">
                                        <td className="px-4 py-3 text-white uppercase tracking-wider">Total Geral</td>
                                        {availableBancas.map(b => (
                                            <td key={b} className={`px-4 py-3 text-center ${getTrendClass(withdrawalsTotal[b])}`}>
                                                {formatValue(withdrawalsTotal[b])}
                                            </td>
                                        ))}
                                        <td className={`px-4 py-3 text-center text-white bg-green-900/50 ${getTrendClass(withdrawalsTotal.total)}`}>
                                            {formatValue(withdrawalsTotal.total)}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}

            {/* --- TABELA DE INVESTIMENTOS --- */}
            {investmentsTableData.length > 0 && selectedYear === 'Total Geral' && (
                <div className="mb-8 bg-[#16202a] p-4 rounded-2xl border border-gray-800 shadow-xl">
                    <h3 className="text-lg font-bold text-gray-100 mb-4 flex items-center">
                        <span className="bg-cyan-500/10 text-cyan-400 p-2 rounded mr-3">💰</span> Histórico de Aportes
                        <span className="text-[10px] font-normal text-gray-500 ml-2 uppercase tracking-wide">(Injeção de capital novo)</span>
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-xs text-left text-gray-400">
                            <thead className="text-xs text-cyan-400 uppercase bg-gray-900/50">
                                <tr>
                                    <th className="px-4 py-3">Ano Ref.</th>
                                    {availableBancas.map(b => <th key={b} className="px-4 py-3 text-center">{b}</th>)}
                                    <th className="px-4 py-3 text-center text-white">Total Aportes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {investmentsTableData.map((row) => (
                                    <tr key={row.year} className="border-b border-gray-800 hover:bg-slate-800/50 transition-colors">
                                        <td className="px-4 py-3 font-bold text-gray-300">{row.year}</td>
                                        {availableBancas.map(b => (
                                            <td key={b} className={`px-4 py-3 text-center ${getTrendClass(row.banks[b])}`}>
                                                {formatValue(row.banks[b] || 0)}
                                            </td>
                                        ))}
                                        <td className={`px-4 py-3 text-center font-black bg-gray-800/50 ${getTrendClass(row.total)}`}>
                                            {formatValue(row.total)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            {investmentsTotal && (
                                <tfoot>
                                    <tr className="bg-cyan-900/30 font-black border-t-2 border-cyan-700">
                                        <td className="px-4 py-3 text-white uppercase tracking-wider">Total Geral</td>
                                        {availableBancas.map(b => (
                                            <td key={b} className={`px-4 py-3 text-center ${getTrendClass(investmentsTotal[b])}`}>
                                                {formatValue(investmentsTotal[b])}
                                            </td>
                                        ))}
                                        <td className={`px-4 py-3 text-center text-white bg-cyan-900/50 ${getTrendClass(investmentsTotal.total)}`}>
                                            {formatValue(investmentsTotal.total)}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}

            {selectedYear !== 'Total Geral' ? (
                <div id="manual-form" className="bg-[#16202a] p-6 rounded-2xl shadow-lg border border-gray-800 mb-8 border-l-4 border-l-cyan-600">
                    <h3 className="text-sm font-bold text-gray-300 uppercase mb-4 flex items-center">
                        <span className="bg-cyan-500/10 text-cyan-400 p-1.5 rounded mr-3">{editingRecordId ? '✏️' : '➕'}</span> 
                        {editingRecordId ? 'Editando Registro' : 'Novo Registro Mensal'}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
                        <div className="col-span-2 md:col-span-2">
                             <InputField label="Banca (Nome)" value={newMonthInputs.bancaName} onChange={(e) => setNewMonthInputs(prev => ({ ...prev, bancaName: e.target.value }))} type="text" />
                        </div>
                        <div className="col-span-2 md:col-span-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1 tracking-wider">Mês</label>
                            <select name="month" value={newMonthInputs.month} onChange={handleInputChange} className="block w-full p-3 text-sm border-gray-700 bg-gray-900 text-white rounded-lg focus:ring-2 focus:ring-cyan-500" disabled={editingRecordId !== null}>
                                {MONTHS_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                            </select>
                        </div>
                        <InputField label="Início (R$)" value={newMonthInputs.inicio} onChange={handleInputChange} name="inicio" />
                        <InputField label="Externo (+/-)" value={newMonthInputs.externo} onChange={handleInputChange} name="externo" />
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

            <div className="bg-[#16202a] p-6 rounded-2xl shadow-lg border border-gray-800 mb-8 border-l-4 border-l-orange-500">
                <h3 className="text-sm font-bold text-gray-300 uppercase mb-4 flex items-center"><span className="bg-orange-500/10 text-orange-400 p-1.5 rounded mr-3">📥</span> Importar Histórico</h3>
                <div className="flex justify-between items-center mb-4">
                    <p className="text-xs text-gray-500">Formato CSV: Ano; Mês; Início; Externo; Aposta; Inv; Divisão; Banca</p>
                    <div className="flex space-x-3">
                        <button onClick={handleResetHistory} className="text-xs font-semibold text-red-400 hover:text-red-300">Resetar (Nuvem)</button>
                        <button onClick={handleDownloadTemplate} className="text-xs font-semibold text-cyan-400 hover:text-cyan-300">Baixar Modelo</button>
                    </div>
                </div>
                <input key={selectedYear} type="file" accept=".csv" onChange={handleImportCSV} className="block w-full text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-cyan-500/20 file:text-cyan-400 hover:file:bg-cyan-500/30" />
            </div>
        </div>
    );
}
