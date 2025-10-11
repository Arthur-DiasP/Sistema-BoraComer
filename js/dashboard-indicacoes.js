// js/dashboard-indicacoes.js

import { firestore } from './firebase-config.js';
import { collection, getDocs, query, orderBy, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let allUsersWithReferrals = [];

const tableBody = document.getElementById('referrals-table-body');

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const fetchAndRenderReferrals = async () => {
    tableBody.innerHTML = '<tr><td colspan="4">Buscando dados de indicações...</td></tr>';
    try {
        const q = query(collection(firestore, "users"), orderBy("referralCredit", "desc"));
        const querySnapshot = await getDocs(q);

        allUsersWithReferrals = querySnapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(u => (u.successfulReferrals && u.successfulReferrals.length > 0) || u.referralCredit > 0);
        
        renderTable();

    } catch (error) {
        console.error("Erro ao buscar dados de indicações:", error);
        tableBody.innerHTML = '<tr><td colspan="4" class="error-message">Falha ao carregar dados.</td></tr>';
    }
};

const renderTable = () => {
    tableBody.innerHTML = '';
    if (allUsersWithReferrals.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4">Nenhum usuário com indicações ou crédito.</td></tr>';
        return;
    }

    allUsersWithReferrals.forEach(user => {
        const tr = document.createElement('tr');
        const referralCount = user.successfulReferrals ? user.successfulReferrals.length : 0;
        const credit = user.referralCredit || 0;

        tr.innerHTML = `
            <td>
                <strong>${user.nome}</strong><br>
                <small>${user.email}</small>
            </td>
            <td>${referralCount}</td>
            <td>${formatCurrency(credit)}</td>
            <td>
                <button class="btn btn-secondary btn-sm" disabled>Ver Detalhes</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
};

export function init() {
    fetchAndRenderReferrals();
}