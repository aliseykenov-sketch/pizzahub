// Глобальные переменные
let cart = [];
let currentUser = null;
let currentCategory = 'all';
let authToken = localStorage.getItem('authToken');

// API базовый URL
const API_BASE = '/api';

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    loadPizzas();
    setupEventListeners();
    loadCartFromStorage();
    updateCartUI();
    checkAuthStatus();
});

// Загрузка пицц с сервера
async function loadPizzas(category = 'all') {
    try {
        const response = await fetch(`${API_BASE}/pizzas${category !== 'all' ? `?category=${category}` : ''}`);
        const pizzas = await response.json();
        renderPizzas(pizzas);
    } catch (error) {
        console.error('Ошибка загрузки пицц:', error);
        showNotification('Мәзір жүктеу қатесі', 'error');
    }
}

// Рендер пицц
function renderPizzas(pizzas) {
    const pizzaGrid = document.getElementById('pizzaGrid');
    
    pizzaGrid.innerHTML = pizzas.map(pizza => `
        <div class="pizza-card" data-pizza-id="${pizza.id}">
            <img src="${pizza.image}" alt="${pizza.name}" class="pizza-image">
            <div class="pizza-info">
                <h3 class="pizza-name">${pizza.name}</h3>
                <p class="pizza-description">${pizza.description}</p>
                <div class="pizza-price">${pizza.price} ₸</div>
                <button class="add-to-cart" onclick="addToCart(${pizza.id}, '${pizza.name}', ${pizza.price})">
                    🛒 Себетке қосу
                </button>
            </div>
        </div>
    `).join('');
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Категории
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentCategory = this.dataset.category;
            loadPizzas(currentCategory);
        });
    });

    // Модальные окна
    const loginBtn = document.getElementById('loginBtn');
    const cartBtn = document.getElementById('cartBtn');
    const loginModal = document.getElementById('loginModal');
    const registerModal = document.getElementById('registerModal');
    const cartModal = document.getElementById('cartModal');

    loginBtn.addEventListener('click', () => {
        if (currentUser) {
            logout();
        } else {
            showModal('loginModal');
        }
    });

    cartBtn.addEventListener('click', () => {
        showModal('cartModal');
        renderCart();
    });

    // Закрытие модальных окон
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            hideModal(this.closest('.modal').id);
        });
    });

    // Переключение между входом и регистрацией
    document.getElementById('showRegister').addEventListener('click', (e) => {
        e.preventDefault();
        hideModal('loginModal');
        showModal('registerModal');
    });

    document.getElementById('showLogin').addEventListener('click', (e) => {
        e.preventDefault();
        hideModal('registerModal');
        showModal('loginModal');
    });

    // Формы
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('checkoutBtn').addEventListener('click', handleCheckout);
    document.getElementById('addressForm').addEventListener('submit', function(e) {
        e.preventDefault();
        confirmOrder();
    });

    // Время доставки
    document.querySelectorAll('input[name="deliveryTime"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const scheduledTime = document.getElementById('scheduledTime');
            if (this.value === 'scheduled') {
                scheduledTime.style.display = 'block';
                scheduledTime.required = true;
            } else {
                scheduledTime.style.display = 'none';
                scheduledTime.required = false;
            }
        });
    });

    // Закрытие модальных окон при клике вне их
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            hideModal(e.target.id);
        }
    });
}

// Функции для управления модальными окнами
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.style.display = 'block';
    document.body.classList.add('modal-open');
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
}

// Закрытие модального окна адреса
function closeAddressModal() {
    hideModal('addressModal');
    showModal('cartModal');
}

// Обновление суммы в модальном окне адреса
function updateOrderSummary() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Получаем дополнительные опции
    const extraCheese = document.querySelector('input[name="extraCheese"]')?.checked || false;
    const extraMeat = document.querySelector('input[name="extraMeat"]')?.checked || false;
    
    let extraCost = 0;
    if (extraCheese) extraCost += 150;
    if (extraMeat) extraCost += 200;
    
    const total = subtotal + extraCost;
    
    document.getElementById('summarySubtotal').textContent = `${subtotal} ₸`;
    document.getElementById('summaryTotal').textContent = `${total} ₸`;
}

// Добавляем обработчики для чекбоксов
document.addEventListener('DOMContentLoaded', function() {
    // Обработчики для чекбоксов ингредиентов
    const ingredientCheckboxes = document.querySelectorAll('input[name="extraCheese"], input[name="extraMeat"]');
    ingredientCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateOrderSummary);
    });
});

// Работа с корзиной
function addToCart(pizzaId, pizzaName, pizzaPrice) {
    const existingItem = cart.find(item => item.id === pizzaId);
    
    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({
            id: pizzaId,
            name: pizzaName,
            price: pizzaPrice,
            quantity: 1
        });
    }
    
    saveCartToStorage();
    updateCartUI();
    showNotification('Пицца себетке қосылды!');
}

function removeFromCart(pizzaId) {
    cart = cart.filter(item => item.id !== pizzaId);
    saveCartToStorage();
    updateCartUI();
    renderCart();
}

function updateQuantity(pizzaId, change) {
    const item = cart.find(item => item.id === pizzaId);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            removeFromCart(pizzaId);
        } else {
            saveCartToStorage();
            updateCartUI();
            renderCart();
        }
    }
}

function updateCartUI() {
    const cartCount = document.querySelector('.cart-count');
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalItems;
    
    const loginBtn = document.getElementById('loginBtn');
    if (currentUser) {
        loginBtn.innerHTML = `
            <i class="fas fa-user"></i>
            <span>${currentUser.name}</span>
        `;
    }
}

function renderCart() {
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');
    
    if (cart.length === 0) {
        cartItems.innerHTML = '<p style="text-align: center; padding: 20px;">Корзина пуста</p>';
        cartTotal.textContent = '0 ₸';
        return;
    }
    
    cartItems.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-price">${item.price} ₸</div>
            </div>
            <div class="quantity-controls">
                <button class="quantity-btn" onclick="updateQuantity(${item.id}, -1)">-</button>
                <span>${item.quantity}</span>
                <button class="quantity-btn" onclick="updateQuantity(${item.id}, 1)">+</button>
                <button class="quantity-btn" onclick="removeFromCart(${item.id})" style="background: #e74c3c; margin-left: 10px;">×</button>
            </div>
        </div>
    `).join('');
    
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cartTotal.textContent = `${total} ₸`;
}

// Работа с пользователями
async function handleLogin(e) {
    e.preventDefault();
    const email = e.target.querySelector('input[type="email"]').value;
    const password = e.target.querySelector('input[type="password"]').value;
    
    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = data.user;
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            hideModal('loginModal');
            updateCartUI();
            showNotification('Сіз аккаунтқа сәтті кірдіңіз!');
            e.target.reset();
        } else {
            showNotification(data.error || 'Қате email немесе құпиясөз', 'error');
        }
    } catch (error) {
        showNotification('Сервермен байланыс қатесі', 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const userData = {
        name: formData.get('name') || e.target.querySelector('input[type="text"]').value,
        email: formData.get('email') || e.target.querySelector('input[type="email"]').value,
        phone: formData.get('phone') || e.target.querySelector('input[type="tel"]').value,
        password: formData.get('password') || e.target.querySelector('input[type="password"]').value
    };
    
    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = data.user;
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            hideModal('registerModal');
            updateCartUI();
            showNotification('Тіркелу сәтті аяқталды!');
            e.target.reset();
        } else {
            showNotification(data.error || 'Тіркелу қатесі', 'error');
        }
    } catch (error) {
        showNotification('Сервермен байланыс қатесі', 'error');
    }
}

function logout() {
    currentUser = null;
    authToken = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    updateCartUI();
    showNotification('Сіз аккаунттан шықтыңыз');
}

// Оформление заказа
async function handleCheckout() {
    if (cart.length === 0) {
        showNotification('Себет бос', 'error');
        return;
    }
    
    if (!currentUser) {
        showNotification('Заказ беру үшін аккаунтқа кіру керек', 'error');
        showModal('loginModal');
        return;
    }
    
    // Показываем модальное окно с адресом
    hideModal('cartModal');
    showModal('addressModal');
    updateOrderSummary();
    
    // Заполняем телефон пользователя если он есть
    if (currentUser && currentUser.phone) {
        document.getElementById('deliveryPhone').value = currentUser.phone;
    }
}

// Подтверждение заказа с адресом
async function confirmOrder() {
    const city = document.getElementById('deliveryCity').value;
    const address = document.getElementById('deliveryAddress').value;
    const phone = document.getElementById('deliveryPhone').value;
    const comment = document.getElementById('orderComment').value;
    
    if (!city || !address || !phone) {
        showNotification('Қала, мекенжай мен телефонды толтырыңыз', 'error');
        return;
    }
    
    // Получаем опции доставки
    const deliveryTime = document.querySelector('input[name="deliveryTime"]:checked').value;
    const scheduledTime = document.getElementById('scheduledTime').value;
    
    // Получаем опции ингредиентов
    const removeMayonnaise = document.querySelector('input[name="removeMayonnaise"]').checked;
    const removeOnion = document.querySelector('input[name="removeOnion"]').checked;
    const removeTomato = document.querySelector('input[name="removeTomato"]').checked;
    const removeOlives = document.querySelector('input[name="removeOlives"]').checked;
    const extraCheese = document.querySelector('input[name="extraCheese"]').checked;
    const extraMeat = document.querySelector('input[name="extraMeat"]').checked;
    
    // Формируем полный адрес
    const fullAddress = `${city}, ${address}`;
    
    // Формируем комментарий с опциями
    let fullComment = comment || '';
    
    if (deliveryTime === 'scheduled' && scheduledTime) {
        fullComment += (fullComment ? '\n' : '') + `Жеткізу уақыты: ${scheduledTime}`;
    }
    
    const ingredientOptions = [];
    if (removeMayonnaise) ingredientOptions.push('Майонезді алып тастау');
    if (removeOnion) ingredientOptions.push('Пиязды алып тастау');
    if (removeTomato) ingredientOptions.push('Қызанақты алып тастау');
    if (removeOlives) ingredientOptions.push('Зәйтүнді алып тастау');
    if (extraCheese) ingredientOptions.push('Қосымша сыр қосу (+150 ₸)');
    if (extraMeat) ingredientOptions.push('Қосымша ет қосу (+200 ₸)');
    
    if (ingredientOptions.length > 0) {
        fullComment += (fullComment ? '\n' : '') + 'Ингредиенттер: ' + ingredientOptions.join(', ');
    }
    
    // Считаем дополнительную стоимость
    let extraCost = 0;
    if (extraCheese) extraCost += 150;
    if (extraMeat) extraCost += 200;
    
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = subtotal + extraCost;
    
    try {
        const response = await fetch(`${API_BASE}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                items: cart,
                total: total,
                address: fullAddress,
                phone: phone,
                comment: fullComment,
                delivery_time: deliveryTime === 'scheduled' ? scheduledTime : null
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            cart = [];
            saveCartToStorage();
            updateCartUI();
            renderCart();
            
            hideModal('addressModal');
            document.getElementById('deliveryAddress').value = '';
            document.getElementById('deliveryPhone').value = '';
            document.getElementById('orderComment').value = '';
            
            showNotification(`#${data.orderId} заказ берілді! Жеткізу мекенжайы: ${address}`);
        } else {
            showNotification(data.error || 'Заказ беру қатесі', 'error');
        }
    } catch (error) {
        showNotification('Сервермен байланыс қатесі', 'error');
    }
}

// Локальное хранилище
function saveCartToStorage() {
    localStorage.setItem('cart', JSON.stringify(cart));
}

function loadCartFromStorage() {
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
        cart = JSON.parse(savedCart);
    }
}

// Проверка статуса авторизации
function checkAuthStatus() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser && authToken) {
        currentUser = JSON.parse(savedUser);
        updateCartUI();
    }
}

// Утилиты
function scrollToMenu() {
    document.getElementById('menu').scrollIntoView({ behavior: 'smooth' });
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'success' ? '#27ae60' : '#e74c3c'};
        color: white;
        border-radius: 8px;
        z-index: 3000;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Добавляем анимации в CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
`;
document.head.appendChild(style);
