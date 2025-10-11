// js/dashboard-entregadores.js
import { firestore } from './firebase-config.js';
import { collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Armazena a lista de todos os entregadores para edição e exclusão
let allMotoboys = [];

// --- SELETORES DO DOM ---
const form = document.getElementById('motoboy-form');
const formTitle = document.getElementById('motoboy-form-title');
const motoboyIdInput = document.getElementById('motoboy-id');
const clearFormBtn = document.getElementById('clear-motoboy-form-btn');
const tableBody = document.getElementById('motoboys-table-body');
const passwordInput = document.getElementById('motoboy-password');

/**
 * Renderiza a tabela com a lista de entregadores.
 */
function renderTable() {
    tableBody.innerHTML = '';
    if (allMotoboys.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum entregador cadastrado.</td></tr>';
        return;
    }
    allMotoboys.forEach(m => {
        const tr = document.createElement('tr');
        tr.dataset.id = m.id;
        tr.innerHTML = `
            <td>${m.nome}</td>
            <td>${m.email}</td>
            <td>${m.telefone}</td>
            <td>
                <div class="product-actions-admin">
                    <button class="btn-icon edit-btn" title="Editar Entregador"><i class="material-icons">edit</i></button>
                    <button class="btn-icon delete-btn" title="Excluir Entregador"><i class="material-icons">delete</i></button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

/**
 * Limpa o formulário, retornando ao estado de "Adicionar".
 */
function resetForm() {
    form.reset();
    motoboyIdInput.value = '';
    formTitle.textContent = 'Adicionar Entregador';
    passwordInput.placeholder = "";
    passwordInput.required = true; // Senha volta a ser obrigatória para novos cadastros
}

/**
 * Preenche o formulário com os dados de um entregador para edição.
 * @param {string} id - O ID do entregador a ser editado.
 */
function populateFormForEdit(id) {
    const motoboy = allMotoboys.find(m => m.id === id);
    if (!motoboy) return;
    
    motoboyIdInput.value = id;
    document.getElementById('motoboy-name').value = motoboy.nome;
    document.getElementById('motoboy-email').value = motoboy.email;
    document.getElementById('motoboy-phone').value = motoboy.telefone;
    
    // A senha não é preenchida por segurança
    passwordInput.placeholder = "Deixe em branco para não alterar";
    passwordInput.required = false; // Senha se torna opcional na edição
    formTitle.textContent = 'Editar Entregador';
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Função principal de inicialização do módulo.
 */
export function init() {
    // Escuta por alterações na coleção de 'motoboys' em tempo real
    const q = query(collection(firestore, 'motoboys'), orderBy('nome'));
    onSnapshot(q, (snapshot) => {
        allMotoboys = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTable();
    });

    // Event listener para o envio do formulário (Adicionar/Editar)
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = motoboyIdInput.value;
        const password = passwordInput.value;

        const data = {
            nome: document.getElementById('motoboy-name').value,
            email: document.getElementById('motoboy-email').value,
            telefone: document.getElementById('motoboy-phone').value,
        };

        // Adiciona a senha ao objeto de dados apenas se ela foi digitada
        if (password) {
            data.senha = password;
        }

        try {
            if (id) { // Modo de Edição
                if (!password) {
                    // Se a senha estiver vazia na edição, não atualiza esse campo
                    delete data.senha; 
                }
                await updateDoc(doc(firestore, 'motoboys', id), data);
            } else { // Modo de Criação
                if (!password) {
                    alert("A senha é obrigatória para novos cadastros.");
                    return;
                }
                await addDoc(collection(firestore, 'motoboys'), data);
            }
            alert("Entregador salvo com sucesso!");
            resetForm();
        } catch (error) {
            console.error("Erro ao salvar entregador:", error);
            alert("Ocorreu um erro ao salvar o entregador.");
        }
    });

    // Delegação de eventos para os botões na tabela
    tableBody.addEventListener('click', e => {
        const row = e.target.closest('tr');
        if (!row) return;
        
        const id = row.dataset.id;
        const motoboy = allMotoboys.find(m => m.id === id);

        if (e.target.closest('.edit-btn')) {
            populateFormForEdit(id);
        }
        if (e.target.closest('.delete-btn')) {
            if (confirm(`Tem certeza que deseja excluir o entregador "${motoboy.nome}"?`)) {
                deleteDoc(doc(firestore, 'motoboys', id));
            }
        }
    });

    // Event listener para o botão de cancelar/limpar
    clearFormBtn.addEventListener('click', resetForm);
}