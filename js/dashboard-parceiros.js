// js/dashboard-parceiros.js

import { firestore } from './firebase-config.js';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let allPartners = [];

const form = document.getElementById('partner-form');
const formTitle = document.getElementById('partner-form-title');
const partnerIdInput = document.getElementById('partner-id');
const clearFormBtn = document.getElementById('clear-partner-form-btn');
const tableBody = document.getElementById('partners-table-body');

const fetchAndRenderPartners = async () => {
    tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Carregando parceiros...</td></tr>';
    try {
        const querySnapshot = await getDocs(collection(firestore, 'parceiros'));
        allPartners = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allPartners.sort((a, b) => a.nome.localeCompare(b.nome));
        renderTable();
    } catch (error) {
        console.error("Erro ao buscar parceiros:", error);
        tableBody.innerHTML = '<tr><td colspan="4" class="error-message">Falha ao carregar parceiros.</td></tr>';
    }
};

const renderTable = () => {
    tableBody.innerHTML = '';
    if (allPartners.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum parceiro cadastrado.</td></tr>';
        return;
    }

    allPartners.forEach(partner => {
        const tr = document.createElement('tr');
        tr.dataset.id = partner.id;
        const statusClass = partner.ativo ? 'status-concluído' : 'status-cancelado';
        const statusText = partner.ativo ? 'Ativo' : 'Inativo';

        tr.innerHTML = `
            <td>
                <div class="partner-table-info">
                    <img src="${partner.logoUrl}" alt="Logo ${partner.nome}" class="partner-table-logo">
                    <strong>${partner.nome}</strong>
                </div>
            </td>
            <td class="partner-offer-cell">${partner.oferta}</td>
            <td><span class="order-status ${statusClass}">${statusText}</span></td>
            <td>
                <div class="product-actions-admin">
                    <button class="btn-icon edit-btn" title="Editar Parceiro"><i class="material-icons">edit</i></button>
                    <button class="btn-icon delete-btn" title="Excluir Parceiro"><i class="material-icons">delete</i></button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
};

const resetForm = () => {
    form.reset();
    partnerIdInput.value = '';
    formTitle.textContent = 'Adicionar Novo Parceiro';
    document.getElementById('partner-status').value = 'true';
};

const populateFormForEdit = (id) => {
    const partner = allPartners.find(p => p.id === id);
    if (!partner) return;

    partnerIdInput.value = id;
    formTitle.textContent = 'Editar Parceiro';
    document.getElementById('partner-name').value = partner.nome;
    document.getElementById('partner-logo').value = partner.logoUrl;
    document.getElementById('partner-offer').value = partner.oferta;
    document.getElementById('partner-status').value = partner.ativo.toString();

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

export function init() {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = partnerIdInput.value;

        const partnerData = {
            nome: document.getElementById('partner-name').value,
            logoUrl: document.getElementById('partner-logo').value,
            oferta: document.getElementById('partner-offer').value,
            ativo: document.getElementById('partner-status').value === 'true',
        };

        if (!partnerData.nome || !partnerData.logoUrl || !partnerData.oferta) {
            alert("Todos os campos são obrigatórios.");
            return;
        }

        try {
            if (id) {
                await updateDoc(doc(firestore, 'parceiros', id), partnerData);
                alert('Parceiro atualizado com sucesso!');
            } else {
                await addDoc(collection(firestore, 'parceiros'), partnerData);
                alert('Parceiro criado com sucesso!');
            }
            resetForm();
            await fetchAndRenderPartners();
        } catch (error) {
            console.error("Erro ao salvar parceiro:", error);
            alert("Ocorreu um erro ao salvar o parceiro.");
        }
    });

    tableBody.addEventListener('click', async (e) => {
        const row = e.target.closest('tr');
        if (!row) return;
        const id = row.dataset.id;

        if (e.target.closest('.edit-btn')) {
            populateFormForEdit(id);
        }

        if (e.target.closest('.delete-btn')) {
            if (confirm('Tem certeza que deseja excluir este parceiro?')) {
                try {
                    await deleteDoc(doc(firestore, 'parceiros', id));
                    alert('Parceiro excluído com sucesso.');
                    await fetchAndRenderPartners();
                } catch (error) {
                    console.error("Erro ao excluir parceiro:", error);
                    alert("Ocorreu um erro ao excluir.");
                }
            }
        }
    });

    clearFormBtn.addEventListener('click', resetForm);
    fetchAndRenderPartners();
}