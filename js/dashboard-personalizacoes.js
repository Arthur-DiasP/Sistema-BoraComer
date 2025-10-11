// js/dashboard-personalizacoes.js

// ALTERAÇÃO: Importando funções do FIRESTORE
import { firestore } from './firebase-config.js';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- SELETORES DO DOM ---
const form = document.getElementById('personalizacao-form');
const formTitle = document.getElementById('personalizacao-form-title');
const idInput = document.getElementById('personalizacao-id');
const nameInput = document.getElementById('personalizacao-name');
const priceInput = document.getElementById('personalizacao-price');
const clearFormBtn = document.getElementById('clear-personalizacao-form-btn');
const tableBody = document.getElementById('personalizacoes-table-body');
const aplicarPizzasCheckbox = document.getElementById('aplicar-todas-pizzas');
const aplicarEsfihasCheckbox = document.getElementById('aplicar-todas-esfihas');
const aplicarTodosCheckbox = document.getElementById('aplicar-todos-produtos');

// --- ESTADO LOCAL DO MÓDULO ---
let allOptions = []; // Armazena todas as opções para edição rápida

// Função auxiliar para formatar moeda
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

// --- FUNÇÕES DE RENDERIZAÇÃO DA UI ---

/**
 * Renderiza a tabela de opções de personalização a partir dos dados do Firestore.
 */
const renderTable = () => {
    tableBody.innerHTML = '';

    if (allOptions.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhuma opção cadastrada.</td></tr>';
        return;
    }
    
    // Ordena a lista de opções por nome
    const sortedList = [...allOptions].sort((a, b) => a.nome.localeCompare(b.nome));

    sortedList.forEach(item => {
        const tr = document.createElement('tr');
        tr.dataset.id = item.id;

        // Monta as tags de aplicação com base nos campos booleanos
        let tagsHtml = '<div class="application-tags">';
        if (item.aplicaPizza) tagsHtml += '<span class="tag tag-pizza">Pizzas</span>';
        if (item.aplicaEsfiha) tagsHtml += '<span class="tag tag-esfiha">Esfihas</span>';
        if (item.aplicaTodos) tagsHtml += '<span class="tag tag-todos">Todos</span>';
        tagsHtml += '</div>';

        tr.innerHTML = `
            <td>${item.nome}</td>
            <td>${item.preco > 0 ? formatCurrency(item.preco) : 'Grátis'}</td>
            <td>${tagsHtml}</td>
            <td>
                <div class="product-actions-admin">
                    <button class="btn-icon edit-btn" title="Editar"><i class="material-icons">edit</i></button>
                    <button class="btn-icon delete-btn" title="Excluir"><i class="material-icons">delete</i></button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
};

/**
 * Preenche o formulário com os dados de uma opção existente para edição.
 * @param {string} id - O ID do documento da opção a ser editada.
 */
const populateFormForEdit = (id) => {
    const item = allOptions.find(opt => opt.id === id);
    if (!item) return;

    idInput.value = id;
    nameInput.value = item.nome;
    priceInput.value = item.preco;
    formTitle.textContent = 'Editar Opção';

    // Marca os checkboxes com base nos dados do Firestore
    aplicarPizzasCheckbox.checked = !!item.aplicaPizza;
    aplicarEsfihasCheckbox.checked = !!item.aplicaEsfiha;
    aplicarTodosCheckbox.checked = !!item.aplicaTodos;
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// --- FUNÇÕES DE DADOS (FIREBASE FIRESTORE) ---

/**
 * Busca todos os documentos da coleção 'personalizacoes' e atualiza a UI.
 */
const fetchData = async () => {
    try {
        const querySnapshot = await getDocs(collection(firestore, 'personalizacoes'));
        allOptions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTable();
    } catch (error) {
        console.error("Erro ao buscar dados de personalizações:", error);
        alert("Falha ao carregar dados. Verifique o console.");
    }
};

/**
 * Limpa o formulário, resetando-o para o estado de "Adicionar Nova Opção".
 */
const resetForm = () => {
    form.reset();
    idInput.value = '';
    formTitle.textContent = 'Adicionar Nova Opção';
};

// --- INICIALIZAÇÃO E EVENT LISTENERS ---

export function init() {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = idInput.value;
        
        // ALTERAÇÃO: O objeto de dados agora inclui os campos booleanos para regras de aplicação.
        const data = {
            nome: nameInput.value.trim(),
            preco: parseFloat(priceInput.value) || 0,
            aplicaPizza: aplicarPizzasCheckbox.checked,
            aplicaEsfiha: aplicarEsfihasCheckbox.checked,
            aplicaTodos: aplicarTodosCheckbox.checked,
        };

        if (!data.nome) {
            alert("O nome da opção é obrigatório.");
            return;
        }

        try {
            if (id) { // Editando uma opção existente
                await updateDoc(doc(firestore, 'personalizacoes', id), data);
            } else { // Criando uma nova opção
                await addDoc(collection(firestore, 'personalizacoes'), data);
            }

            alert('Opção salva com sucesso!');
            resetForm();
            await fetchData(); // Recarrega todos os dados para refletir as mudanças
        } catch (error) {
            console.error("Erro ao salvar opção no Firestore:", error);
            alert('Erro ao salvar opção.');
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
            if (confirm('Tem certeza que deseja excluir esta opção?')) {
                try {
                    // ALTERAÇÃO: Simplesmente deleta o documento pelo ID.
                    await deleteDoc(doc(firestore, 'personalizacoes', id));
                    alert('Opção removida com sucesso.');
                    await fetchData(); // Recarrega os dados
                } catch (err) {
                    console.error("Erro ao remover do Firestore:", err);
                    alert('Erro ao remover opção.');
                }
            }
        }
    });

    clearFormBtn.addEventListener('click', resetForm);
    
    // Carrega os dados iniciais assim que o módulo é inicializado
    fetchData();
}