const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'pizzahub-secret-key-2026';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname))); // Раздаем все файлы из корневой папки

// Обработка favicon
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// Инициализация базы данных
const db = new sqlite3.Database('./pizzahub.db');

// Создание таблиц
db.serialize(() => {
    // Таблица пользователей
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Таблица пицц
    db.run(`CREATE TABLE IF NOT EXISTS pizzas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        price INTEGER NOT NULL,
        category TEXT NOT NULL,
        image TEXT NOT NULL,
        available BOOLEAN DEFAULT 1
    )`);

    // Таблица заказов
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        total INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        address TEXT,
        phone TEXT,
        comment TEXT,
        delivery_time TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Добавляем недостающие колонки если их нет
    db.run(`ALTER TABLE orders ADD COLUMN comment TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Ошибка добавления колонки comment:', err);
        }
    });
    
    db.run(`ALTER TABLE orders ADD COLUMN delivery_time TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Ошибка добавления колонки delivery_time:', err);
        }
    });

    // Таблица элементов заказа
    db.run(`CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        pizza_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        price INTEGER NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders (id),
        FOREIGN KEY (pizza_id) REFERENCES pizzas (id)
    )`);

    // Создание админа если его нет
    bcrypt.hash('admin123', 10, (err, hashedPassword) => {
        if (!err) {
            db.run(`INSERT OR IGNORE INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)`,
                ['Admin', 'admin@pizzahub.ru', '+79991234567', hashedPassword]);
        }
    });

    // Очищаем таблицу пицц перед добавлением
    db.run('DELETE FROM pizzas', (err) => {
        if (err) {
            console.error('❌ Ошибка очистки таблицы пицц:', err);
            return;
        }
        console.log('🧹 Таблица пицц очищена');
        
        // Добавление начальных пицц
        const stmt = db.prepare("INSERT INTO pizzas (name, description, price, category, image) VALUES (?, ?, ?, ?, ?)");
        const pizzas = [
            ["Маргарита", "Қызанақ соусы, моцарелла, базилик", 450, "vegetarian", "images/margarita.png"],
            ["Пепперони", "Қызанақ соусы, моцарелла, пепперони", 520, "meat", "images/peperoni-600x600.jpg"],
            ["Гавайская", "Қызанақ соусы, моцарелла, ветчина, ананас", 550, "meat", "images/01995c5ac24e7838a952f194b30f76ff_1875x1875.jpeg"],
            ["Төрт сыр", "Моцарелла, пармезан, горгонзола, чеддер", 580, "vegetarian", "images/946.970@2x.jpg"],
            ["Мексикалық", "Қызанақ соусы, моцарелла, сиыр еті, халапеньо бұрышы", 620, "spicy", "images/photo_560253.jpg"],
            ["Вегетариан", "Қызанақ соусы, моцарелла, саңырауқұлақ, бұрыш, зәйтүн", 480, "vegetarian", "images/840ed927c47fe8d982edd1dfc63b5d26.png"],
            ["Карбонара", "Сүтті соус, моцарелла, бекон, пармезан", 590, "meat", "images/carbonara.jpg"],
            ["Диябло", "Қызанақ соусы, моцарелла, пепперони, халапеньо, ащы бұрыш", 650, "spicy", "images/1752576330363-350x253.jpeg"]
        ];

        pizzas.forEach(pizza => {
            console.log('📝 Добавление пиццы:', pizza[0], 'с изображением:', pizza[4]);
            stmt.run(pizza);
        });
        stmt.finalize();
        
        console.log('🎉 База данных инициализирована с', pizzas.length, 'пиццами');
    });
});

// Middleware для проверки JWT токена
const authenticateToken = (req, res, next) => {
    console.log('🔐 Проверка авторизации для:', req.method, req.url);
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    console.log('📋 Authorization header:', authHeader);
    console.log('🎫 Token:', token ? 'присутствует' : 'отсутствует');

    if (!token) {
        console.log('❌ Токен отсутствует');
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.log('❌ Ошибка верификации токена:', err.message);
            return res.status(403).json({ error: 'Недействительный токен' });
        }
        console.log('✅ Токен верифицирован, пользователь:', user);
        req.user = user;
        next();
    });
};

// API Routes

// Регистрация
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        if (!name || !email || !phone || !password) {
            return res.status(400).json({ error: 'Все поля обязательны для заполнения' });
        }

        // Проверка существования пользователя
        db.get('SELECT id FROM users WHERE email = ?', [email], async (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка сервера' });
            }

            if (user) {
                return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
            }

            // Хеширование пароля
            const hashedPassword = await bcrypt.hash(password, 10);

            // Создание пользователя
            db.run('INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)',
                [name, email, phone, hashedPassword],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Ошибка при создании пользователя' });
                    }

                    const token = jwt.sign(
                        { id: this.lastID, name, email },
                        JWT_SECRET,
                        { expiresIn: '24h' }
                    );

                    res.status(201).json({
                        message: 'Пользователь успешно создан',
                        token,
                        user: { id: this.lastID, name, email, phone }
                    });
                }
            );
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Вход
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email и пароль обязательны' });
        }

        db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка сервера' });
            }

            if (!user) {
                return res.status(400).json({ error: 'Неверный email или пароль' });
            }

            // Проверка пароля
            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(400).json({ error: 'Неверный email или пароль' });
            }

            const token = jwt.sign(
                { id: user.id, name: user.name, email: user.email },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                message: 'Вход выполнен успешно',
                token,
                user: { id: user.id, name: user.name, email: user.email, phone: user.phone }
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение пицц
app.get('/api/pizzas', (req, res) => {
    const category = req.query.category;
    
    console.log('🍕 Запрос пицц, категория:', category);
    
    let query = 'SELECT * FROM pizzas';
    let params = [];
    
    if (category && category !== 'all') {
        query += ' WHERE category = ?';
        params.push(category);
    }
    
    db.all(query, params, (err, pizzas) => {
        if (err) {
            console.error('❌ Ошибка получения пицц:', err);
            return res.status(500).json({ error: 'Ошибка при получении пицц' });
        }
        
        console.log('✅ Найдено пицц:', pizzas.length);
        console.log('📸 Пиццы с изображениями:', pizzas.map(p => ({name: p.name, image: p.image})));
        
        res.json(pizzas);
    });
});

// Создание заказа
app.post('/api/orders', authenticateToken, (req, res) => {
    try {
        console.log('🛒 Получен запрос на создание заказа');
        console.log('📦 Тело запроса:', req.body);
        console.log('👤 Пользователь:', req.user);
        
        const { items, total, address, phone, comment, delivery_time } = req.body;
        const userId = req.user.id;

        if (!items || items.length === 0) {
            console.log('❌ Корзина пуста');
            return res.status(400).json({ error: 'Корзина пуста' });
        }

        console.log('✅ Данные заказа валидны, создаем заказ...');
        
        // Создание заказа
        db.run('INSERT INTO orders (user_id, total, address, phone, comment, delivery_time) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, total, address, phone, comment, delivery_time],
            function(err) {
                if (err) {
                    console.error('❌ Ошибка при создании заказа:', err);
                    return res.status(500).json({ error: 'Ошибка при создании заказа' });
                }

                const orderId = this.lastID;
                console.log('✅ Заказ создан, ID:', orderId);

                // Добавление элементов заказа
                const stmt = db.prepare('INSERT INTO order_items (order_id, pizza_id, quantity, price) VALUES (?, ?, ?, ?)');
                
                items.forEach(item => {
                    stmt.run([orderId, item.id, item.quantity, item.price]);
                });

                stmt.finalize((err) => {
                    if (err) {
                        return res.status(500).json({ error: 'Ошибка при добавлении товаров в заказ' });
                    }

                    res.status(201).json({
                        message: 'Заказ успешно создан',
                        orderId,
                        total
                    });
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение заказов пользователя
app.get('/api/orders', authenticateToken, (req, res) => {
    const userId = req.user.id;

    const query = `
        SELECT o.*, oi.pizza_id, oi.quantity, oi.price, p.name as pizza_name
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN pizzas p ON oi.pizza_id = p.id
        WHERE o.user_id = ?
        ORDER BY o.created_at DESC
    `;

    db.all(query, [userId], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка при получении заказов' });
        }

        // Группировка элементов по заказам
        const orders = {};
        rows.forEach(row => {
            if (!orders[row.id]) {
                orders[row.id] = {
                    id: row.id,
                    total: row.total,
                    status: row.status,
                    address: row.address,
                    phone: row.phone,
                    created_at: row.created_at,
                    items: []
                };
            }

            if (row.pizza_id) {
                orders[row.id].items.push({
                    pizza_id: row.pizza_id,
                    pizza_name: row.pizza_name,
                    quantity: row.quantity,
                    price: row.price
                });
            }
        });

        res.json(Object.values(orders));
    });
});

// Получение информации о пользователе
app.get('/api/user', authenticateToken, (req, res) => {
    const userId = req.user.id;

    db.get('SELECT id, name, email, phone FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка при получении данных пользователя' });
        }

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json(user);
    });
});

// Обновление информации о пользователе
app.put('/api/user', authenticateToken, async (req, res) => {
    try {
        const { name, phone, currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        let updateQuery = 'UPDATE users SET name = ?, phone = ?';
        let updateParams = [name, phone];

        // Если нужно обновить пароль
        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ error: 'Требуется текущий пароль для изменения' });
            }

            // Проверка текущего пароля
            db.get('SELECT password FROM users WHERE id = ?', [userId], async (err, user) => {
                if (err) {
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }

                const validPassword = await bcrypt.compare(currentPassword, user.password);
                if (!validPassword) {
                    return res.status(400).json({ error: 'Неверный текущий пароль' });
                }

                const hashedNewPassword = await bcrypt.hash(newPassword, 10);
                updateQuery += ', password = ?';
                updateParams.push(hashedNewPassword);

                updateQuery += ' WHERE id = ?';
                updateParams.push(userId);

                db.run(updateQuery, updateParams, function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Ошибка при обновлении данных' });
                    }

                    res.json({ message: 'Данные успешно обновлены' });
                });
            });
        } else {
            updateQuery += ' WHERE id = ?';
            updateParams.push(userId);

            db.run(updateQuery, updateParams, function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Ошибка при обновлении данных' });
                }

                res.json({ message: 'Данные успешно обновлены' });
            });
        }
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Статистика для админ-панели
app.get('/api/stats', authenticateToken, (req, res) => {
    // Простая проверка на админа (в реальном приложении нужна роль)
    if (req.user.email !== 'admin@pizzahub.ru') {
        return res.status(403).json({ error: 'Доступ запрещен' });
    }

    const queries = {
        totalUsers: 'SELECT COUNT(*) as count FROM users',
        totalOrders: 'SELECT COUNT(*) as count FROM orders',
        totalRevenue: 'SELECT SUM(total) as total FROM orders WHERE status != "cancelled"',
        popularPizzas: `
            SELECT p.name, SUM(oi.quantity) as total_sold
            FROM order_items oi
            JOIN pizzas p ON oi.pizza_id = p.id
            GROUP BY p.id, p.name
            ORDER BY total_sold DESC
            LIMIT 5
        `
    };

    const stats = {};
    let completed = 0;

    Object.entries(queries).forEach(([key, query]) => {
        db.all(query, (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка при получении статистики' });
            }

            stats[key] = key === 'popularPizzas' ? rows : rows[0];
            completed++;

            if (completed === Object.keys(queries).length) {
                res.json(stats);
            }
        });
    });
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Что-то пошло не так!' });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🍕 PizzaHub сервер запущен на порту ${PORT}`);
    console.log(`📊 Админ-панель: http://localhost:${PORT}/admin`);
    console.log(`🌐 Клиент: http://localhost:${PORT}`);
});
