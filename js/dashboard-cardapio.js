// js/dashboard-cardapio.js

// Importando as funções necessárias do Cloud Firestore
import { firestore } from './firebase-config.js';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Função auxiliar para formatar moeda
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

// --- ESTADO GLOBAL DO MÓDULO ---
let allProducts = []; // Armazena todos os produtos carregados para filtragem rápida na UI
let allStockItems = []; // Armazena os itens do estoque

// --- SELETORES DO DOM ---
const productForm = document.getElementById('product-form');
const categorySelect = document.getElementById('product-category');
const ingredientsGroup = document.getElementById('product-ingredients-group');
const formTitle = document.getElementById('form-title');
const productIdInput = document.getElementById('product-id');
const clearFormBtn = document.getElementById('clear-form-btn');
// NOVO: Seletores da Receita
const recipeSection = document.getElementById('recipe-section');
const recipeItemsContainer = document.getElementById('recipe-items-container');
const addRecipeItemBtn = document.getElementById('add-recipe-item-btn');
// Seletores da Visão GRID
const gridViewContainer = document.getElementById('grid-view-container');
const productListItems = document.getElementById('product-list-items');
const gridFilters = document.getElementById('grid-filters');
// Seletores da Visão PLANILHA
const tableViewContainer = document.getElementById('table-view-container');
const productTableBody = document.getElementById('product-table-body');
const tableFilters = document.getElementById('table-filters');
const tableSearchInput = document.getElementById('table-search-input');
const tableRotationHint = document.getElementById('table-rotation-hint');
// Seletor de Visualização
const viewSwitcher = document.querySelector('.view-switcher');

// ===============================================
// --- FUNÇÕES DE RENDERIZAÇÃO ---
// ===============================================

const renderGridView = (products) => {
    productListItems.innerHTML = '';
    if (!products || products.length === 0) {
        productListItems.innerHTML = '<p>Nenhum produto encontrado.</p>'; return;
    }
    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card-admin';
        // Usamos o spread operator para garantir que todos os dados, incluindo o ID, estejam no dataset
        Object.entries({ ...product }).forEach(([key, value]) => { card.dataset[key] = value; });
        
        const secretIcon = product.isSecret ? '<i class="material-icons secret-item-icon" title="Item do Cardápio Secreto">key</i>' : '';

        card.innerHTML = `
            <img src="${product.imagemUrl || 'img/desenho-pizza.png'}" alt="${product.nome}">
            <div class="product-info-admin"><h4>${product.nome} ${secretIcon}</h4><span>${formatCurrency(product.preco)}</span></div>
            <div class="product-actions-admin"><button class="btn-icon edit-btn" title="Editar"><i class="material-icons">edit</i></button><button class="btn-icon delete-btn" title="Excluir"><i class="material-icons">delete</i></button></div>
        `;
        productListItems.appendChild(card);
    });
};

const renderTableView = (products) => {
    productTableBody.innerHTML = '';
    if (!products || products.length === 0) {
        productTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum produto encontrado.</td></tr>'; return;
    }
    products.forEach(product => {
        const row = document.createElement('tr');
        Object.entries({ ...product }).forEach(([key, value]) => { row.dataset[key] = value; });
        row.innerHTML = `
            <td title="${product.nome}">${product.nome}</td>
            <td>${product.categoria}</td>
            <td>${formatCurrency(product.preco)}</td>
            <td>
                <div class="product-actions-admin">
                    <button class="btn-icon edit-btn" title="Editar produto"><i class="material-icons">edit</i></button>
                    <button class="btn-icon delete-btn" title="Excluir produto"><i class="material-icons">delete</i></button>
                </div>
            </td>
        `;
        productTableBody.appendChild(row);
    });
};

// ===============================================
// --- FUNÇÕES DE FILTRAGEM ---
// ===============================================

const applyFilters = () => {
    // Filtros para a Visão GRID
    const activeGridCategory = gridFilters.querySelector('.filter-btn.active').dataset.category;
    const gridProducts = (activeGridCategory === 'all') ? allProducts : allProducts.filter(p => p.categoria === activeGridCategory);
    renderGridView(gridProducts);

    // Filtros para a Visão PLANILHA
    const activeTableCategory = tableFilters.querySelector('.filter-btn.active').dataset.category;
    const searchTerm = tableSearchInput.value.toLowerCase();
    let tableProducts = allProducts;
    if (activeTableCategory !== 'all') {
        tableProducts = tableProducts.filter(p => p.categoria === activeTableCategory);
    }
    if (searchTerm) {
        tableProducts = tableProducts.filter(p => p.nome.toLowerCase().includes(searchTerm));
    }
    renderTableView(tableProducts);
};

// --- LÓGICA DA RECEITA ---

const createRecipeItemRow = (item = {}) => {
    const row = document.createElement('div');
    row.className = 'recipe-item-row';

    const stockOptions = allStockItems.map(stockItem => 
        `<option value="${stockItem.id}" ${item.stockId === stockItem.id ? 'selected' : ''}>${stockItem.name} (${stockItem.unit})</option>`
    ).join('');

    row.innerHTML = `
        <select class="recipe-item-select form-control-sm">${stockOptions}</select>
        <input type="number" step="any" class="recipe-item-quantity form-control-sm" placeholder="Qtd" value="${item.quantity || ''}">
        <button type="button" class="btn-icon remove-recipe-btn"><i class="material-icons">delete</i></button>
    `;
    row.querySelector('.remove-recipe-btn').addEventListener('click', () => row.remove());
    return row;
};

const addRecipeItem = () => {
    if (allStockItems.length === 0) {
        alert("Cadastre itens no estoque primeiro.");
        return;
    }
    recipeItemsContainer.appendChild(createRecipeItemRow());
};

const renderRecipe = (recipe = []) => {
    recipeItemsContainer.innerHTML = '';
    if (recipe.length > 0) {
        recipe.forEach(item => {
            recipeItemsContainer.appendChild(createRecipeItemRow(item));
        });
    }
};

// ===============================================
// --- LÓGICA DE DADOS (FIREBASE FIRESTORE) ---
// ===============================================

const fetchStockItems = async () => {
    try {
        const q = query(collection(firestore, 'stock'), orderBy('name'));
        const snapshot = await getDocs(q);
        allStockItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao buscar itens de estoque:", error);
    }
};

const fetchProducts = async () => {
    productListItems.innerHTML = '<p>Carregando...</p>';
    productTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Carregando...</td></tr>';
    try {
        // Busca os documentos da coleção 'produtos' no Firestore
        const querySnapshot = await getDocs(collection(firestore, 'produtos'));
        // Mapeia os documentos para um array de objetos, incluindo o ID de cada documento
        allProducts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => a.nome.localeCompare(b.nome)); // Ordena por nome
        
        applyFilters(); // Renderiza os produtos na UI
    } catch (error) {
        console.error("Erro ao buscar produtos no Firestore: ", error);
        productListItems.innerHTML = '<p>Erro ao carregar produtos.</p>';
        productTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Erro ao carregar produtos.</td></tr>';
    }
};

const resetForm = () => { 
    productForm.reset(); 
    productIdInput.value = ''; 
    formTitle.textContent = 'Adicionar Novo Produto'; 
    ingredientsGroup.style.display = 'block'; 
    document.getElementById('product-is-secret').checked = false;
    renderRecipe([]); // Limpa a receita
};

// ===============================================
// --- INICIALIZAÇÃO E EVENT LISTENERS ---
// ===============================================

export function init() {
    // --- LÓGICA DO FORMULÁRIO (CRIAR E ATUALIZAR) ---
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = e.target.querySelector('button[type="submit"]');
        submitButton.disabled = true; 
        submitButton.textContent = 'Salvando...';
        
        // A categoria agora faz parte do objeto de dados do produto
        const productData = { 
            nome: document.getElementById('product-name').value, 
            imagemUrl: document.getElementById('product-image').value, 
            ingredientes: document.getElementById('product-ingredients').value, 
            preco: parseFloat(document.getElementById('product-price').value),
            categoria: document.getElementById('product-category').value,
            isSecret: document.getElementById('product-is-secret').checked // Salva o status de item secreto
        };

        // Coleta os dados da receita
        const recipeRows = recipeItemsContainer.querySelectorAll('.recipe-item-row');
        productData.recipe = Array.from(recipeRows).map(row => ({
            stockId: row.querySelector('.recipe-item-select').value,
            quantity: parseFloat(row.querySelector('.recipe-item-quantity').value)
        })).filter(item => item.stockId && !isNaN(item.quantity) && item.quantity > 0);

        if (productData.categoria === 'bebida') {
            productData.ingredientes = ''; // Ingredientes não são necessários para bebidas
            productData.recipe = []; // Bebidas não têm receita
        }

        try {
            const id = productIdInput.value;
            if (id) { 
                // Se existe um ID, atualiza o documento existente no Firestore
                await updateDoc(doc(firestore, 'produtos', id), productData); 
                alert('Produto atualizado com sucesso!'); 
            } else { 
                // Se não há ID, adiciona um novo documento à coleção 'produtos'
                await addDoc(collection(firestore, 'produtos'), productData); 
                alert('Produto criado com sucesso!'); 
            }
            resetForm(); 
            await fetchProducts(); // Recarrega a lista para mostrar as mudanças
        } catch (error) { 
            console.error("Erro ao salvar produto no Firestore: ", error); 
            alert('Ocorreu um erro ao salvar o produto.');
        } finally { 
            submitButton.disabled = false; 
            submitButton.textContent = 'Salvar'; 
        }
    });
    
    // --- LÓGICA DE AÇÕES (EDITAR/EXCLUIR) USANDO DELEGAÇÃO DE EVENTOS ---
    const handleActionClick = async (e) => {
        const parentElement = e.target.closest('.product-card-admin, tr');
        if (!parentElement) return;

        const { id } = parentElement.dataset; // Pega o ID do dataset do elemento

        // Ação de Editar
        if (e.target.closest('.edit-btn')) {
            const data = parentElement.dataset;
            productIdInput.value = data.id; 
            document.getElementById('product-name').value = data.nome; 
            document.getElementById('product-image').value = data.imagemurl; 
            document.getElementById('product-ingredients').value = data.ingredientes; 
            document.getElementById('product-category').value = data.categoria; 
            document.getElementById('product-price').value = data.preco; 
            formTitle.textContent = 'Editar Produto'; 
            document.getElementById('product-is-secret').checked = data.issecret === 'true'; // 'isSecret' vem como string do dataset
            categorySelect.dispatchEvent(new Event('change')); 
            renderRecipe(data.recipe || []); // Renderiza a receita do produto
            window.scrollTo(0, 0); // Rola a página para o topo
        }

        // Ação de Excluir
        if (e.target.closest('.delete-btn')) {
            if (confirm('Tem certeza que deseja excluir este produto?')) {
                try { 
                    // Deleta o documento do Firestore usando seu ID
                    await deleteDoc(doc(firestore, 'produtos', id));
                    parentElement.remove(); // Remove o elemento da UI instantaneamente
                    alert('Produto excluído com sucesso!'); 
                    // Atualiza o array local para refletir a exclusão
                    allProducts = allProducts.filter(p => p.id !== id); 
                    applyFilters();
                } catch (error) { 
                    console.error("Erro ao excluir produto do Firestore: ", error); 
                    alert('Ocorreu um erro ao excluir o produto.'); 
                }
            }
        }
    };
    productListItems.addEventListener('click', handleActionClick);
    productTableBody.addEventListener('click', handleActionClick);

    // --- LÓGICA DOS FILTROS, BUSCA E SELETOR DE VISUALIZAÇÃO ---
    const handleFilterClick = () => applyFilters();
    gridFilters.addEventListener('click', (e) => { if (e.target.matches('.filter-btn')) { gridFilters.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active')); e.target.classList.add('active'); handleFilterClick(); } });
    tableFilters.addEventListener('click', (e) => { if (e.target.matches('.filter-btn')) { tableFilters.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active')); e.target.classList.add('active'); handleFilterClick(); } });
    tableSearchInput.addEventListener('input', handleFilterClick);
    
    const checkRotationHint = () => { 
        const isTableView = tableViewContainer.classList.contains('active'); 
        const isMobileVertical = window.innerWidth < 800; 
        tableRotationHint.style.display = (isTableView && isMobileVertical) ? 'flex' : 'none'; 
    };
    
    viewSwitcher.addEventListener('click', (e) => { 
        const viewBtn = e.target.closest('.view-btn'); 
        if (!viewBtn) return; 
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active')); 
        viewBtn.classList.add('active'); 
        const isGrid = viewBtn.dataset.view === 'grid'; 
        gridViewContainer.classList.toggle('active', isGrid); 
        tableViewContainer.classList.toggle('active', !isGrid); 
        checkRotationHint(); 
    });
    
    window.addEventListener('resize', checkRotationHint);
    
    // --- OUTROS EVENTOS ---
    clearFormBtn.addEventListener('click', resetForm);
    addRecipeItemBtn.addEventListener('click', addRecipeItem);

    categorySelect.addEventListener('change', () => { 
        const isDrink = categorySelect.value === 'bebida';
        ingredientsGroup.style.display = isDrink ? 'none' : 'block'; 
        recipeSection.style.display = isDrink ? 'none' : 'block';
    });

    // --- CARGA INICIAL ---
    fetchStockItems();
    fetchProducts();
    // Ouve por atualizações no estoque para manter a lista de ingredientes do formulário atualizada
    window.addEventListener('stockUpdated', (e) => allStockItems = e.detail);
}