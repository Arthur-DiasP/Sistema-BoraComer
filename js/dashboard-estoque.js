// js/dashboard-estoque.js
import { firestore } from './firebase-config.js';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const form = document.getElementById('stock-form');
const formTitle = document.getElementById('stock-form-title');
const itemIdInput = document.getElementById('stock-item-id');
const clearFormBtn = document.getElementById('clear-stock-form-btn');
const tableBody = document.getElementById('stock-table-body');
const generateListBtn = document.getElementById('generate-shopping-list-btn');
const shoppingListModal = document.getElementById('shopping-list-modal');
const closeShoppingListModalBtn = document.getElementById('close-shopping-list-modal');
const shoppingListContent = document.getElementById('shopping-list-content');
const printShoppingListBtn = document.getElementById('print-shopping-list-btn');


let allStockItems = [];

const renderTable = () => {
    tableBody.innerHTML = '';
    if (allStockItems.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum item no estoque.</td></tr>';
        return;
    }

    allStockItems.forEach(item => {
        const tr = document.createElement('tr');
        tr.dataset.id = item.id;

        const isLow = item.quantity <= item.threshold;
        const statusClass = isLow ? 'status-cancelado' : 'status-concluído';
        const statusText = isLow ? 'Baixo' : 'OK';

        tr.innerHTML = `
            <td><strong>${item.name}</strong></td>
            <td>${item.quantity} ${item.unit}</td>
            <td>${item.threshold} ${item.unit}</td>
            <td><span class="order-status ${statusClass}">${statusText}</span></td>
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

const resetForm = () => {
    form.reset();
    itemIdInput.value = '';
    formTitle.textContent = 'Adicionar Item ao Estoque';
};

const populateFormForEdit = (id) => {
    const item = allStockItems.find(i => i.id === id);
    if (!item) return;

    itemIdInput.value = id;
    formTitle.textContent = 'Editar Item do Estoque';
    document.getElementById('stock-item-name').value = item.name;
    document.getElementById('stock-item-quantity').value = item.quantity;
    document.getElementById('stock-item-unit').value = item.unit;
    document.getElementById('stock-item-threshold').value = item.threshold;
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

/**
 * Gera e exibe uma lista de compras com base nos itens com estoque baixo.
 */
const generateShoppingList = () => {
    const lowStockItems = allStockItems.filter(item => item.quantity <= item.threshold);

    if (lowStockItems.length === 0) {
        alert("Nenhum item com estoque baixo para gerar a lista.");
        return;
    }

    shoppingListContent.innerHTML = `
        <ul>
            ${lowStockItems.map(item => `<li>${item.name}</li>`).join('')}
        </ul>
    `;
    shoppingListModal.classList.add('visible');
};

/**
 * Imprime o conteúdo da lista de compras.
 */
const printShoppingList = () => {
    const printWindow = window.open('', 'PRINT', 'height=600,width=800');
    printWindow.document.write('<html><head><title>Lista de Compras</title>');
    printWindow.document.write('<style>body{font-family:sans-serif;} h1{font-size:1.5rem;} ul{list-style:square; font-size:1.2rem; line-height:1.8;}</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write('<h1>Lista de Compras</h1>');
    printWindow.document.write(shoppingListContent.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
};

export function init() {
    // Listener do formulário
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = itemIdInput.value;

        const stockData = {
            name: document.getElementById('stock-item-name').value,
            quantity: parseFloat(document.getElementById('stock-item-quantity').value),
            unit: document.getElementById('stock-item-unit').value,
            threshold: parseFloat(document.getElementById('stock-item-threshold').value),
        };

        if (isNaN(stockData.quantity) || isNaN(stockData.threshold)) {
            alert("Quantidade e Nível de Alerta devem ser números.");
            return;
        }

        try {
            if (id) {
                await updateDoc(doc(firestore, 'stock', id), stockData);
                alert('Item atualizado com sucesso!');
            } else {
                await addDoc(collection(firestore, 'stock'), stockData);
                alert('Item adicionado ao estoque!');
            }
            resetForm();
        } catch (error) {
            console.error("Erro ao salvar item no estoque:", error);
            alert("Ocorreu um erro ao salvar.");
        }
    });

    // Listeners da tabela
    tableBody.addEventListener('click', async (e) => {
        const row = e.target.closest('tr');
        if (!row) return;
        const id = row.dataset.id;

        if (e.target.closest('.edit-btn')) {
            populateFormForEdit(id);
        } else if (e.target.closest('.delete-btn')) {
            if (confirm('Tem certeza que deseja excluir este item do estoque?')) {
                try {
                    await deleteDoc(doc(firestore, 'stock', id));
                    alert('Item excluído.');
                } catch (error) {
                    console.error("Erro ao excluir item:", error);
                    alert("Falha ao excluir.");
                }
            }
        }
    });

    clearFormBtn.addEventListener('click', resetForm);

    // Listeners do Modal da Lista de Compras
    generateListBtn.addEventListener('click', generateShoppingList);
    closeShoppingListModalBtn.addEventListener('click', () => shoppingListModal.classList.remove('visible'));
    shoppingListModal.addEventListener('click', (e) => { if (e.target === shoppingListModal) shoppingListModal.classList.remove('visible'); });
    printShoppingListBtn.addEventListener('click', printShoppingList);

    // Listener em tempo real para a coleção de estoque
    const q = query(collection(firestore, 'stock'), orderBy('name'));
    onSnapshot(q, (snapshot) => {
        allStockItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTable();
        // Dispara um evento customizado para que outros módulos (como o de cardápio) saibam que o estoque foi atualizado
        window.dispatchEvent(new CustomEvent('stockUpdated', { detail: allStockItems }));
    }, (error) => {
        console.error("Erro ao buscar estoque:", error);
        tableBody.innerHTML = '<tr><td colspan="5" class="error-message">Falha ao carregar estoque.</td></tr>';
    });
}