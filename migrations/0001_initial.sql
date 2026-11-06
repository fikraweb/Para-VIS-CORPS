CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, brand TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', price INTEGER, image TEXT NOT NULL DEFAULT '', stock INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 0);
CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT NOT NULL UNIQUE, name TEXT NOT NULL, phone TEXT NOT NULL, city TEXT NOT NULL, address TEXT NOT NULL, total INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'nouvelle', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE order_items (id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL, name TEXT NOT NULL, price INTEGER NOT NULL, quantity INTEGER NOT NULL);
CREATE TABLE login_attempts (ip TEXT PRIMARY KEY, attempts INTEGER NOT NULL, started INTEGER NOT NULL);
INSERT INTO products (name,brand,category,description) VALUES
('Gel nettoyant visage','À renseigner','Visage','Fiche à compléter avant publication.'),
('Protection solaire SPF 50+','À renseigner','Solaires','Fiche à compléter avant publication.'),
('Soin hydratant corps','À renseigner','Corps','Fiche à compléter avant publication.');
