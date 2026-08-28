const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const auditService = require('./auditService');

const dbPath = path.join(__dirname, '../aura.db');
const db = new sqlite3.Database(dbPath);

function initDb(catalogProducts) {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS inventory (
            product_id TEXT PRIMARY KEY,
            product_name TEXT NOT NULL,
            available_quantity INTEGER NOT NULL DEFAULT 0,
            sold_quantity INTEGER NOT NULL DEFAULT 0
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS sales (
            sale_id INTEGER PRIMARY KEY AUTOINCREMENT,
            payment_id TEXT UNIQUE NOT NULL,
            product_id TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Safe Alter logic to add price, is_active to inventory if they don't exist
        db.run(`ALTER TABLE inventory ADD COLUMN price REAL`, (err) => {
            // ignore if column exists
        });
        db.run(`ALTER TABLE inventory ADD COLUMN is_active INTEGER DEFAULT 1`, (err) => {
            // ignore if column exists
        });

        // Safe Alter logic to add amount, product_name to sales
        db.run(`ALTER TABLE sales ADD COLUMN amount REAL`, (err) => {
            // ignore if column exists
        });
        db.run(`ALTER TABLE sales ADD COLUMN product_name TEXT`, (err) => {
            // ignore if column exists
        });

        // Initialize inventory from catalog if missing
        const stmt = db.prepare(`INSERT OR IGNORE INTO inventory (product_id, product_name, price, available_quantity, sold_quantity, is_active) VALUES (?, ?, ?, ?, 0, 1)`);
        
        catalogProducts.forEach(product => {
            stmt.run(product.id, product.name, product.price, product.stock);
        });
        
        stmt.finalize();
    });
}

function getInventorySync() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT product_id, available_quantity, sold_quantity FROM inventory`, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getAllInventory() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT product_id, product_name, price, available_quantity, sold_quantity, is_active FROM inventory WHERE is_active = 1`, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getProductInventory(productId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT product_id, product_name, price, available_quantity, sold_quantity, is_active FROM inventory WHERE product_id = ? AND is_active = 1`, [productId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function addProduct(product) {
    return new Promise((resolve, reject) => {
        if (!product.id || !product.name || product.price === undefined || product.stock === undefined) {
            return reject(new Error("Missing required fields (id, name, price, stock)"));
        }
        if (product.price < 0) return reject(new Error("Price cannot be negative"));
        if (product.stock < 0) return reject(new Error("Stock cannot be negative"));

        const stmt = db.prepare(`INSERT INTO inventory (product_id, product_name, price, available_quantity, sold_quantity, is_active) VALUES (?, ?, ?, ?, 0, 1)`);
        stmt.run(product.id, product.name, product.price, product.stock, function(err) {
            if (err) {
                if (err.code === 'SQLITE_CONSTRAINT') return reject(new Error("Duplicate product ID"));
                return reject(err);
            }
            resolve({
                id: product.id,
                name: product.name,
                price: product.price,
                stock: product.stock,
                sold_quantity: 0,
                is_active: 1
            });
        });
        stmt.finalize();
    });
}

function updateProduct(productId, updates) {
    return new Promise((resolve, reject) => {
        if (updates.price !== undefined && updates.price < 0) return reject(new Error("Price cannot be negative"));
        if (updates.stock !== undefined && updates.stock < 0) return reject(new Error("Stock cannot be negative"));

        let fields = [];
        let values = [];
        if (updates.name !== undefined) {
            fields.push('product_name = ?');
            values.push(updates.name);
        }
        if (updates.price !== undefined) {
            fields.push('price = ?');
            values.push(updates.price);
        }
        if (updates.stock !== undefined) {
            fields.push('available_quantity = ?');
            values.push(updates.stock);
        }

        if (fields.length === 0) return resolve(false);

        values.push(productId);
        const query = `UPDATE inventory SET ${fields.join(', ')} WHERE product_id = ?`;
        
        db.run(query, values, function(err) {
            if (err) return reject(err);
            resolve(this.changes > 0);
        });
    });
}

function deleteProduct(productId) {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE inventory SET is_active = 0 WHERE product_id = ?`, [productId], function(err) {
            if (err) return reject(err);
            resolve(this.changes > 0);
        });
    });
}

function getSalesDashboardData() {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT i.product_id, i.product_name, i.available_quantity, i.sold_quantity
            FROM inventory i
            WHERE i.is_active = 1 OR i.sold_quantity > 0
        `;
        db.all(query, [], (err, rows) => {
            if (err) return reject(err);
            
            const totalUnitsSold = rows.reduce((acc, row) => acc + row.sold_quantity, 0);
            
            db.get(`SELECT SUM(amount) as totalRevenue FROM sales`, [], (err, revRow) => {
                if (err) return reject(err);
                
                resolve({
                    totalUnitsSold,
                    totalRevenue: revRow && revRow.totalRevenue ? revRow.totalRevenue : 0,
                    productWise: rows.map(r => ({
                        productId: r.product_id,
                        productName: r.product_name,
                        quantitySold: r.sold_quantity,
                        currentStock: r.available_quantity
                    }))
                });
            });
        });
    });
}

function recordSale(order, items) {
    return new Promise((resolve, reject) => {
        const paymentId = order.paymentLinkId || order.verifiedPaymentId || order.id;

        db.serialize(() => {
            db.run('BEGIN EXCLUSIVE TRANSACTION');

            let failed = false;
            let completedItems = 0;

            const rollback = (err) => {
                if (failed) return;
                failed = true;
                db.run('ROLLBACK', () => reject(err));
            };

            for (const item of items) {
                if (failed) break;

                db.get(`SELECT product_name, available_quantity FROM inventory WHERE product_id = ?`, [item.id], (err, row) => {
                    if (err) return rollback(err);
                    if (!row || row.available_quantity < item.quantity) {
                        return rollback(new Error(`Insufficient stock for product ${item.id}`));
                    }
                    
                    const productName = row.product_name || item.name;
                    const amount = item.agreed_price || item.price || 0;
                    const uniqueSaleId = `${paymentId}_${item.id}`;
                    
                    db.run(`INSERT INTO sales (payment_id, product_id, product_name, quantity, amount) VALUES (?, ?, ?, ?, ?)`, 
                        [uniqueSaleId, item.id, productName, item.quantity, amount], 
                        (err) => {
                            if (err) {
                                if (err.code === 'SQLITE_CONSTRAINT') {
                                    auditService.logEvent('SALE_DUPLICATE', 'System', `Payment already recorded: ${uniqueSaleId}`, 'BLOCKED');
                                }
                                return rollback(err);
                            }

                            db.run(`UPDATE inventory 
                                    SET available_quantity = available_quantity - ?, 
                                        sold_quantity = sold_quantity + ? 
                                    WHERE product_id = ?`, 
                                [item.quantity, item.quantity, item.id], 
                                (err) => {
                                    if (err) return rollback(err);
                                    
                                    auditService.logEvent('SALE_RECORDED', 'System', `Product ${item.id}, Quantity ${item.quantity}, Payment ${uniqueSaleId}`, 'SUCCESS');
                                    auditService.logEvent('INVENTORY_UPDATED', 'System', `${item.id} stock reduced by ${item.quantity}`, 'SUCCESS');
                                    
                                    completedItems++;
                                    if (completedItems === items.length && !failed) {
                                        db.run('COMMIT', (err) => {
                                            if (err) reject(err);
                                            else resolve(true);
                                        });
                                    }
                                }
                            );
                        }
                    );
                });
            }
        });
    });
}

module.exports = {
    initDb,
    getInventorySync,
    getAllInventory,
    getProductInventory,
    addProduct,
    updateProduct,
    deleteProduct,
    getSalesDashboardData,
    recordSale
};
