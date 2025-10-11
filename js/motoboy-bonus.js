// js/motoboy-bonus.js
import { firestore } from './firebase-config.js';
import { collection, query, where, getDocs, doc, getDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const loggedInMotoboy = JSON.parse(sessionStorage.getItem('loggedInMotoboy'));
    if (!loggedInMotoboy) {
        window.location.href = '/html/motoboy-login.html';
        return;
    }

    // --- Seletores do DOM ---
    const motoboyNameEl = document.getElementById('motoboy-name');
    const logoutBtn = document.getElementById('logout-btn');
    const totalEarningsEl = document.getElementById('total-earnings');
    const baseSalaryEl = document.getElementById('base-salary');
    const totalBonusEl = document.getElementById('total-bonus');
    const monthFilterEl = document.getElementById('bonus-month-filter');
    const statementListEl = document.getElementById('statement-list');
    const bonusChartCanvas = document.getElementById('bonus-composition-chart');

    // --- Estado do Módulo ---
    let logisticsConfig = {};
    let allCompletedDeliveries = [];
    let bonusChartInstance = null;

    motoboyNameEl.textContent = loggedInMotoboy.nome;

    /**
     * Carrega as configurações de logística definidas no painel de admin.
     */
    async function loadLogisticsConfig() {
        const docRef = doc(firestore, "config", "logistica");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            logisticsConfig = docSnap.data();
        } else {
            console.warn("Configurações de logística não encontradas.");
        }
    }

    /**
     * Busca todas as entregas concluídas do motoboy logado.
     */
    async function fetchCompletedDeliveries() {
        const q = query(
            collection(firestore, "pedidos"),
            where("motoboy.id", "==", loggedInMotoboy.id),
            where("statusEntrega", "==", "entregue"),
            orderBy("data", "desc")
        );
        const querySnapshot = await getDocs(q);
        allCompletedDeliveries = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    /**
     * Popula o filtro de meses com base nas entregas existentes.
     */
    function setupMonthFilter() {
        const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        const now = new Date();
        const currentPeriod = `${now.getFullYear()}-${now.getMonth()}`;

        // Começa o Set com o período atual para garantir que ele sempre exista
        const availablePeriods = new Set();
        availablePeriods.add(currentPeriod);

        // Adiciona os outros períodos que têm entregas
        allCompletedDeliveries.forEach(d => {
            const date = d.data.toDate();
            availablePeriods.add(`${date.getFullYear()}-${date.getMonth()}`);
        });

        monthFilterEl.innerHTML = '';

        // Converte o Set para um array e ordena do mais recente para o mais antigo
        const sortedPeriods = Array.from(availablePeriods).sort((a, b) => {
            const [yearA, monthA] = a.split('-').map(Number);
            const [yearB, monthB] = b.split('-').map(Number);
            return new Date(yearB, monthB) - new Date(yearA, monthA);
        });

        sortedPeriods.forEach(period => {
            const [year, month] = period.split('-').map(Number);
            const option = document.createElement('option');
            option.value = period;
            option.textContent = `${months[month]} de ${year}`;
            // Seleciona o mês atual como padrão
            if (period === currentPeriod) {
                option.selected = true;
            }
            monthFilterEl.appendChild(option);
        });

        monthFilterEl.addEventListener('change', renderStatement);
    }

    /**
     * Renderiza o gráfico de pizza com a composição dos ganhos.
     * @param {number} base - O valor do salário base.
     * @param {number} bonus - O valor total dos bônus.
     */
    function renderBonusChart(base, bonus) {
        if (bonusChartInstance) {
            bonusChartInstance.destroy();
        }

        const hasData = base > 0 || bonus > 0;

        const chartData = {
            labels: ['Salário Base', 'Total em Bônus'],
            datasets: [{
                data: hasData ? [base, bonus] : [1], // Usa um valor de placeholder se não houver dados
                backgroundColor: hasData ? ['#36A2EB', '#4CAF50'] : ['#E0E0E0'],
                borderColor: hasData ? ['#FFFFFF'] : ['#E0E0E0'],
                borderWidth: 2
            }]
        };

        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.label}: ${hasData ? context.formattedValue : 'R$ 0,00'}`
                    }
                }
            }
        };

        bonusChartInstance = new Chart(bonusChartCanvas.getContext('2d'), { type: 'pie', data: chartData, options: chartOptions });
    }

    /**
     * Calcula os ganhos para uma única entrega com base nas regras.
     * Esta é uma simulação. A lógica exata pode ser mais complexa.
     * AGORA: Lê os ganhos diretamente do objeto do pedido.
     */
    function calculateEarnings(delivery) {
        // Se o pedido não tiver o campo 'earnings', retorna zero para evitar erros.
        if (!delivery.earnings) {
            return { base: 0, peak: 0, fast: 0, total: 0 };
        }

        const base = delivery.earnings.base || 0;
        const peak = delivery.earnings.peakBonus || 0;
        const fast = delivery.earnings.fastBonus || 0;
        // Adicionar outros bônus aqui quando forem implementados

        const total = base + peak + fast;

        return { base, peak, fast, total };
    }

    /**
     * Renderiza o extrato para o mês selecionado.
     */
    function renderStatement() {
        const [year, month] = monthFilterEl.value.split('-').map(Number);
        const deliveriesInMonth = allCompletedDeliveries.filter(d => {
            const deliveryDate = d.data.toDate();
            return deliveryDate.getFullYear() === year && deliveryDate.getMonth() === month;
        });

        statementListEl.innerHTML = '';
        let monthTotal = 0;
        let monthBaseSalary = 0;
        let monthBonus = 0;

        if (deliveriesInMonth.length === 0) {
            statementListEl.innerHTML = '<div class="card empty-state"><i class="material-icons">receipt_long</i><p>Nenhum ganho registrado neste período.</p></div>';
        }

        deliveriesInMonth.forEach(delivery => {
            const earnings = calculateEarnings(delivery);
            monthTotal += earnings.total;
            monthBaseSalary += earnings.base;
            monthBonus += earnings.peak + earnings.fast + earnings.ambassador;

            const date = delivery.data.toDate();
            const formattedDate = `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR').substring(0, 5)}`;

            const card = `
                <div class="statement-card">
                    <div class="statement-header">
                        <span>Pedido #${delivery.id.substring(0, 8)}</span>
                        <time>${formattedDate}</time>
                    </div>
                    <div class="statement-body">
                        <div class="earning-item"><span>Taxa Base</span><strong>${earnings.base.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>
                        ${earnings.peak > 0 ? `<div class="earning-item bonus"><span><i class="material-icons">whatshot</i>Bônus de Pico</span><strong>${earnings.peak.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>` : ''}
                        ${earnings.fast > 0 ? `<div class="earning-item bonus"><span><i class="material-icons">rocket_launch</i>Entrega Rápida</span><strong>${earnings.fast.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>` : ''}
                    </div>
                    <div class="statement-footer">
                        <span>Total da Corrida</span>
                        <strong>${earnings.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                    </div>
                </div>
            `;
            statementListEl.innerHTML += card;
        });

        totalEarningsEl.textContent = monthTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        baseSalaryEl.textContent = monthBaseSalary.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        totalBonusEl.textContent = monthBonus.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        // Renderiza o gráfico com os totais do mês
        renderBonusChart(monthBaseSalary, monthBonus);
    }

    async function init() {
        await loadLogisticsConfig();
        await fetchCompletedDeliveries();
        setupMonthFilter();
        renderStatement();

        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('loggedInMotoboy');
            window.location.href = '/html/motoboy-login.html';
        });
    }

    init();
});