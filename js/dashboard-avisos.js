// js/dashboard-avisos.js
import { firestore } from './firebase-config.js';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- SELETORES DO DOM ---
const form = document.getElementById('aviso-form');
const formTitle = document.getElementById('aviso-form-title');
const avisoIdInput = document.getElementById('aviso-id');
const avisoTitleInput = document.getElementById('aviso-title');
const avisoContentInput = document.getElementById('aviso-content');
const clearFormBtn = document.getElementById('clear-aviso-form-btn');
const avisosListContainer = document.getElementById('avisos-list');

let allAvisos = [];

/**
 * Renderiza a lista de avisos na tela.
 */
const renderAvisosList = () => {
    avisosListContainer.innerHTML = '';
    if (allAvisos.length === 0) {
        avisosListContainer.innerHTML = '<p>Nenhum aviso cadastrado.</p>';
        return;
    }

    allAvisos.forEach(aviso => {
        const card = document.createElement('div');
        card.className = 'aviso-card-admin';
        card.dataset.id = aviso.id;

        const date = aviso.createdAt?.toDate().toLocaleDateString('pt-BR') || 'Data indisponível';

        card.innerHTML = `
            <div class="aviso-info">
                <h4>${aviso.title}</h4>
                <p>${aviso.content.substring(0, 100)}...</p>
                <small>Publicado em: ${date}</small>
            </div>
            <div class="aviso-actions">
                <button class="btn-icon edit-btn" title="Editar"><i class="material-icons">edit</i></button>
                <button class="btn-icon delete-btn" title="Excluir"><i class="material-icons">delete</i></button>
            </div>
        `;
        avisosListContainer.appendChild(card);
    });
};

/**
 * Limpa o formulário e redefine para o modo de adição.
 */
const resetForm = () => {
    form.reset();
    avisoIdInput.value = '';
    formTitle.textContent = 'Adicionar Novo Aviso';
};

/**
 * Preenche o formulário com os dados de um aviso para edição.
 * @param {string} id - O ID do aviso a ser editado.
 */
const populateFormForEdit = (id) => {
    const aviso = allAvisos.find(a => a.id === id);
    if (!aviso) return;

    avisoIdInput.value = id;
    avisoTitleInput.value = aviso.title;
    avisoContentInput.value = aviso.content;
    formTitle.textContent = 'Editar Aviso';
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

export function init() {
    // Listener para o formulário
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = avisoIdInput.value;
        const avisoData = {
            title: avisoTitleInput.value,
            content: avisoContentInput.value,
            createdAt: serverTimestamp()
        };

        try {
            if (id) {
                // Atualiza um aviso existente, mas não altera a data de criação
                delete avisoData.createdAt; 
                await updateDoc(doc(firestore, 'avisosMotoboys', id), avisoData);
                alert('Aviso atualizado com sucesso!');
            } else {
                // Cria um novo aviso
                await addDoc(collection(firestore, 'avisosMotoboys'), avisoData);
                alert('Aviso criado com sucesso!');
            }
            resetForm();
        } catch (error) {
            console.error("Erro ao salvar aviso:", error);
            alert('Ocorreu um erro ao salvar o aviso.');
        }
    });

    // Listener para os botões de ação na lista
    avisosListContainer.addEventListener('click', async (e) => {
        const card = e.target.closest('.aviso-card-admin');
        if (!card) return;
        const id = card.dataset.id;

        if (e.target.closest('.edit-btn')) {
            populateFormForEdit(id);
        } else if (e.target.closest('.delete-btn')) {
            if (confirm('Tem certeza que deseja excluir este aviso?')) {
                await deleteDoc(doc(firestore, 'avisosMotoboys', id));
                alert('Aviso excluído.');
            }
        }
    });

    clearFormBtn.addEventListener('click', resetForm);

    // Listener em tempo real para a coleção de avisos
    const q = query(collection(firestore, 'avisosMotoboys'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snapshot) => {
        allAvisos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAvisosList();
    });
}