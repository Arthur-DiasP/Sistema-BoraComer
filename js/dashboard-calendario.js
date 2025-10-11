// js/dashboard-calendario.js

import { firestore as db } from './firebase-config.js';
import { collection, query, where, onSnapshot, Timestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const monthYearDisplay = document.getElementById('month-year-display');
const calendarDaysGrid = document.getElementById('calendar-days-grid');
const prevMonthBtn = document.getElementById('prev-month-btn');
const nextMonthBtn = document.getElementById('next-month-btn');
const selectedDateInfo = document.getElementById('selected-date-info');
const dailyStats = document.getElementById('daily-stats');
const pizzasSoldCount = document.getElementById('pizzas-sold-count');
const dailyRevenue = document.getElementById('daily-revenue');
let currentDate = new Date();
let orderData = {}; // Armazena os dados processados dos pedidos

/**
 * Renderiza a estrutura do calendário (dias, mês, ano) na tela.
 */
const renderCalendar = () => {
    const today = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthName = new Date(year, month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    monthYearDisplay.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    
    calendarDaysGrid.innerHTML = '';
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const lastDateOfMonth = new Date(year, month + 1, 0).getDate();
    const lastDateOfPrevMonth = new Date(year, month, 0).getDate();

    // Preenche os dias do mês anterior
    for (let i = firstDayOfMonth; i > 0; i--) {
        const dayEl = document.createElement('div');
        dayEl.classList.add('calendar-day', 'day-not-in-month');
        dayEl.textContent = lastDateOfPrevMonth - i + 1;
        calendarDaysGrid.appendChild(dayEl);
    }

    // Preenche os dias do mês atual
    for (let i = 1; i <= lastDateOfMonth; i++) {
        const dayEl = document.createElement('div');
        dayEl.classList.add('calendar-day', 'day-in-month');
        dayEl.textContent = i;
        const dayDate = new Date(year, month, i);
        const dateString = dayDate.toISOString().split('T')[0];
        dayEl.dataset.date = dateString;

        const isToday = i === today.getDate() && month === today.getMonth() && year === today.getFullYear();

        if (isToday) {
            dayEl.classList.add('today');
        }
        
        if (orderData[dateString] && orderData[dateString].orderCount > 0) {
            const dot = document.createElement('span');
            dot.classList.add('data-dot');
            dayEl.appendChild(dot);
        }
        calendarDaysGrid.appendChild(dayEl);

        // =========================================================================
        //  ALTERAÇÃO PRINCIPAL AQUI: Se o dia renderizado é hoje, seleciona-o.
        // =========================================================================
        if (isToday) {
            updateSidePanel(dateString);
        }
    }
};

/**
 * Escuta as alterações nos pedidos em tempo real e processa os dados.
 */
const listenToOrderData = () => {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const pedidosRef = collection(db, 'pedidos');
    const q = query(pedidosRef, where("data", ">=", Timestamp.fromDate(ninetyDaysAgo)), orderBy("data", "desc"));

    onSnapshot(q, (querySnapshot) => {
        const processedData = {};
        querySnapshot.forEach(doc => {
            const pedido = doc.data();
            
            if (pedido.status === 'Concluído' && pedido.data) {
                const date = pedido.data.toDate();
                const dateString = date.toISOString().split('T')[0];

                if (!processedData[dateString]) {
                    processedData[dateString] = { orderCount: 0, revenue: 0 };
                }
                
                processedData[dateString].orderCount += 1;
                processedData[dateString].revenue += pedido.total || 0;
            }
        });
        
        orderData = processedData;
        renderCalendar(); // Re-renderiza o calendário com os dados atualizados

        // =========================================================================
        //  ALTERAÇÃO SECUNDÁRIA: Atualiza o painel se um dia já estiver selecionado
        //  após uma atualização de dados em tempo real.
        // =========================================================================
        const selectedDay = document.querySelector('.calendar-day.selected');
        if (selectedDay) {
            updateSidePanel(selectedDay.dataset.date);
        }

    }, (error) => {
        console.error("Erro ao escutar dados para o calendário:", error);
    });
};

/**
 * Atualiza o painel lateral com as informações do dia selecionado.
 * @param {string} dateStr - A data no formato "YYYY-MM-DD".
 */
const updateSidePanel = (dateStr) => {
    const dataDoDia = orderData[dateStr];
    const date = new Date(dateStr + 'T12:00:00'); 
    const formattedDate = date.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    // Remove a seleção de qualquer outro dia
    document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
    
    // Adiciona a classe 'selected' ao dia clicado/selecionado
    const selectedDayEl = document.querySelector(`.calendar-day[data-date="${dateStr}"]`);
    if (selectedDayEl) {
        selectedDayEl.classList.add('selected');
    }

    selectedDateInfo.textContent = `Resumo para: ${formattedDate}`;

    if (dataDoDia && dataDoDia.orderCount > 0) {
        pizzasSoldCount.textContent = dataDoDia.orderCount;
        dailyRevenue.textContent = formatCurrency(dataDoDia.revenue);
        dailyStats.style.display = 'block';
    } else {
        dailyStats.style.display = 'none';
        selectedDateInfo.textContent += ' - Nenhum pedido concluído encontrado.';
    }
};

export function init() {
    prevMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); });
    nextMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); });
    calendarDaysGrid.addEventListener('click', (e) => { 
        const dayEl = e.target.closest('.day-in-month'); 
        if (dayEl && dayEl.dataset.date) { 
            updateSidePanel(dayEl.dataset.date); 
        } 
    });
    
    // A primeira renderização já vai selecionar o dia atual, se aplicável.
    // O listener de dados garante que os dados sejam carregados primeiro.
    listenToOrderData(); 
}