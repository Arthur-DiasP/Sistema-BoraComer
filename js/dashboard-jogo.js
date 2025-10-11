// js/dashboard-jogo.js

import { firestore } from './firebase-config.js';
import { collection, getDocs, query, where, doc, updateDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let weeklyParticipants = [];

const participantsTableBody = document.getElementById('participants-table-body');
const drawWinnerBtn = document.getElementById('draw-winner-btn');
const winnerDisplay = document.getElementById('winner-display');
const winnerNameEl = document.getElementById('winner-name');
const winnerCouponEl = document.getElementById('winner-coupon-code');

function getWeekIdentifier(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${weekNo}`;
}

const fetchWeeklyParticipants = async () => {
    participantsTableBody.innerHTML = '<tr><td colspan="3">Buscando participantes...</td></tr>';
    const currentWeekId = getWeekIdentifier(new Date());

    try {
        const q = query(collection(firestore, "jogoDaVelhaParticipations"), where("weekIdentifier", "==", currentWeekId));
        const querySnapshot = await getDocs(q);

        weeklyParticipants = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderTable();

    } catch (error) {
        console.error("Erro ao buscar participantes:", error);
        participantsTableBody.innerHTML = '<tr><td colspan="3" class="error-message">Falha ao carregar.</td></tr>';
    }
};

const renderTable = () => {
    participantsTableBody.innerHTML = '';
    if (weeklyParticipants.length === 0) {
        participantsTableBody.innerHTML = '<tr><td colspan="3">Nenhum participante esta semana.</td></tr>';
        drawWinnerBtn.disabled = true;
        return;
    }

    weeklyParticipants.forEach(p => {
        const tr = document.createElement('tr');
        const entryType = p.type === 'paid' ? 'Paga (R$ 5)' : 'Ficha Grátis';
        const entryDate = p.date.toDate().toLocaleString('pt-BR');
        tr.innerHTML = `
            <td>${p.userName}</td>
            <td>${entryType}</td>
            <td>${entryDate}</td>
        `;
        participantsTableBody.appendChild(tr);
    });
    drawWinnerBtn.disabled = false;
};

const drawWinner = async () => {
    if (weeklyParticipants.length === 0) {
        alert("Não há participantes para sortear.");
        return;
    }

    if (!confirm("Tem certeza que deseja realizar o sorteio agora? Esta ação gerará um cupom para o vencedor.")) {
        return;
    }

    const winner = weeklyParticipants[Math.floor(Math.random() * weeklyParticipants.length)];

    // Gerar um cupom de 100%
    const couponCode = `GANHADOR${new Date().getDate()}${new Date().getMonth() + 1}`;
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 7); // Válido por 7 dias

    const couponData = {
        codigo: couponCode,
        desconto: 100,
        dataValidade: expirationDate.toISOString().split('T')[0],
        ativa: true,
        origem: 'Sorteio Jogo da Velha',
        vencedor: {
            id: winner.userId,
            nome: winner.userName
        }
    };
    
    try {
        await addDoc(collection(firestore, 'cupons_promocionais'), couponData);

        winnerNameEl.textContent = winner.userName;
        winnerCouponEl.textContent = couponCode;
        winnerDisplay.style.display = 'block';

        alert(`O vencedor é ${winner.userName}! Um cupom de 100% de desconto (${couponCode}) foi gerado e é válido por 7 dias.`);
        drawWinnerBtn.disabled = true; // Desabilita após o sorteio
    } catch (error) {
        console.error("Erro ao gerar cupom do vencedor:", error);
        alert("Houve um erro ao gerar o cupom do vencedor.");
    }
};


export function init() {
    drawWinnerBtn.addEventListener('click', drawWinner);
    fetchWeeklyParticipants();
}