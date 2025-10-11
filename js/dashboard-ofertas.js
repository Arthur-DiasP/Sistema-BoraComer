// js/dashboard-ofertas.js

import { firestore } from './firebase-config.js';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- SELETORES DO DOM ---
const form = document.getElementById('oferta-form');
const formTitle = document.getElementById('oferta-form-title');
const ofertaIdInput = document.getElementById('oferta-id');
const clearFormBtn = document.getElementById('clear-oferta-form-btn');
const tableBody = document.getElementById('ofertas-table-body');
// Novos seletores para a lista de produtos drag & drop
const availableList = document.getElementById('available-products-list');
const selectedList = document.getElementById('selected-products-list');
const searchInput = document.getElementById('oferta-products-search');
const availableCountSpan = document.getElementById('available-count');
const selectedCountSpan = document.getElementById('selected-count');

let allOfertas = [];
let allProducts = [];

// --- FUNÇÕES DE RENDERIZAÇÃO E DADOS ---

/**
 * Atualiza os contadores de produtos disponíveis e selecionados.
 */
const updateProductCounts = () => {
    availableCountSpan.textContent = `(${availableList.children.length})`;
    selectedCountSpan.textContent = `(${selectedList.children.length})`;
};

/**
 * Renderiza as listas de produtos (disponíveis e selecionados).
 * @param {Array<string>} selectedProductIds - IDs dos produtos que devem ir para a lista de selecionados.
 */
const renderProductLists = (selectedProductIds = []) => {
    availableList.innerHTML = '';
    selectedList.innerHTML = '';

    const searchTerm = searchInput.value.toLowerCase();
    
    allProducts.forEach(product => {
        const itemEl = document.createElement('div');
        itemEl.className = 'product-drag-item';
        itemEl.dataset.id = product.id;
        itemEl.draggable = true;
        itemEl.innerHTML = `
            <span class="product-name">${product.nome}</span>
            <span class="product-price">R$ ${product.preco.toFixed(2)}</span>
        `;
        
        if (selectedProductIds.includes(product.id)) {
            selectedList.appendChild(itemEl);
        } else {
            if (product.nome.toLowerCase().includes(searchTerm)) {
                availableList.appendChild(itemEl);
            }
        }
    });
    updateProductCounts();
};

const fetchProducts = async () => {
    try {
        const querySnapshot = await getDocs(collection(firestore, 'produtos'));
        allProducts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allProducts.sort((a, b) => a.nome.localeCompare(b.nome));
        renderProductLists();
    } catch (error) {
        console.error("Erro ao buscar produtos para o combo:", error);
        availableList.innerHTML = '<p class="error-message">Erro ao carregar produtos.</p>';
    }
};

const fetchAndRenderOfertas = async () => {
    tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando...</td></tr>';
    try {
        const querySnapshot = await getDocs(collection(firestore, 'ofertas'));
        allOfertas = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allOfertas.sort((a, b) => b.expiraEm.toMillis() - a.expiraEm.toMillis());
        renderTable();
    } catch (error) {
        console.error("Erro ao buscar ofertas:", error);
        tableBody.innerHTML = '<tr><td colspan="5" class="error-message">Falha ao carregar ofertas.</td></tr>';
    }
};

const renderTable = () => {
    tableBody.innerHTML = '';
    if (allOfertas.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma oferta criada.</td></tr>';
        return;
    }
    allOfertas.forEach(oferta => {
        const tr = document.createElement('tr');
        tr.dataset.id = oferta.id;
        const expirationDate = oferta.expiraEm.toDate().toLocaleString('pt-BR');
        const statusClass = oferta.ativo ? 'status-concluído' : 'status-cancelado';
        const statusText = oferta.ativo ? 'Ativa' : 'Inativa';
        tr.innerHTML = `
            <td><strong>${oferta.nome}</strong></td>
            <td>R$ ${oferta.precoOferta.toFixed(2)}</td>
            <td>${expirationDate}</td>
            <td><span class="order-status ${statusClass}">${statusText}</span></td>
            <td>
                <div class="product-actions-admin">
                    <button class="btn-icon edit-btn"><i class="material-icons">edit</i></button>
                    <button class="btn-icon delete-btn"><i class="material-icons">delete</i></button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
};

const resetForm = () => {
    form.reset();
    ofertaIdInput.value = '';
    formTitle.textContent = 'Criar Nova Oferta/Combo';
    searchInput.value = '';
    renderProductLists();
};

const populateFormForEdit = (id) => {
    const oferta = allOfertas.find(o => o.id === id);
    if (!oferta) return;

    ofertaIdInput.value = id;
    formTitle.textContent = 'Editar Oferta/Combo';
    document.getElementById('oferta-name').value = oferta.nome;
    document.getElementById('oferta-description').value = oferta.descricao;
    document.getElementById('oferta-image').value = oferta.imagemUrl;
    document.getElementById('oferta-price').value = oferta.precoOferta;
    
    const date = oferta.expiraEm.toDate();
    const timezoneOffset = date.getTimezoneOffset() * 60000;
    const localISOTime = new Date(date - timezoneOffset).toISOString().slice(0, 16);
    document.getElementById('oferta-expiration').value = localISOTime;

    document.getElementById('oferta-status').value = oferta.ativo.toString();
    renderProductLists(oferta.produtos);
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// --- LÓGICA DE DRAG & DROP ---
function setupDragAndDrop() {
    let draggedItem = null;

    document.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('product-drag-item')) {
            draggedItem = e.target;
            setTimeout(() => e.target.classList.add('dragging'), 0);
        }
    });

    document.addEventListener('dragend', () => {
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
            draggedItem = null;
        }
    });

    [availableList, selectedList].forEach(list => {
        list.addEventListener('dragover', e => e.preventDefault());
        list.addEventListener('drop', e => {
            e.preventDefault();
            if (draggedItem && draggedItem.parentElement !== list) {
                list.appendChild(draggedItem);
                updateProductCounts();
            }
        });
    });
}

// --- INICIALIZAÇÃO E EVENT LISTENERS ---
export function init() {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = ofertaIdInput.value;
        const selectedProducts = Array.from(selectedList.children).map(item => item.dataset.id);
        
        if (selectedProducts.length === 0) {
            alert("Arraste pelo menos um produto para a lista de 'Selecionados'.");
            return;
        }

        const ofertaData = {
            nome: document.getElementById('oferta-name').value,
            descricao: document.getElementById('oferta-description').value,
            imagemUrl: document.getElementById('oferta-image').value,
            precoOferta: parseFloat(document.getElementById('oferta-price').value),
            produtos: selectedProducts,
            expiraEm: Timestamp.fromDate(new Date(document.getElementById('oferta-expiration').value)),
            ativo: document.getElementById('oferta-status').value === 'true',
        };

        try {
            if (id) {
                await updateDoc(doc(firestore, 'ofertas', id), ofertaData);
                alert('Oferta atualizada com sucesso!');
            } else {
                await addDoc(collection(firestore, 'ofertas'), ofertaData);
                alert('Oferta criada com sucesso!');
            }
            resetForm();
            await fetchAndRenderOfertas();
        } catch (error) {
            console.error("Erro ao salvar oferta:", error);
            alert("Ocorreu um erro ao salvar a oferta.");
        }
    });

    tableBody.addEventListener('click', async (e) => {
        const row = e.target.closest('tr');
        if (!row) return;
        const id = row.dataset.id;
        if (e.target.closest('.edit-btn')) populateFormForEdit(id);
        if (e.target.closest('.delete-btn')) {
            if (confirm('Tem certeza que deseja excluir esta oferta?')) {
                try {
                    await deleteDoc(doc(firestore, 'ofertas', id));
                    alert('Oferta excluída.');
                    await fetchAndRenderOfertas();
                } catch (error) {
                    console.error("Erro ao excluir:", error);
                    alert("Falha ao excluir oferta.");
                }
            }
        }
    });

    clearFormBtn.addEventListener('click', resetForm);
    
    searchInput.addEventListener('input', () => {
        const selectedIds = Array.from(selectedList.children).map(item => item.dataset.id);
        renderProductLists(selectedIds);
    });

    setupDragAndDrop();
    fetchProducts();
    fetchAndRenderOfertas();
}