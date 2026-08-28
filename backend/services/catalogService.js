const fs = require('fs');
const path = require('path');

const catalogPath = path.join(__dirname, '../catalog.json');
let catalogData = { merchant: {}, products: [] };

function loadCatalog() {
    try {
        const data = fs.readFileSync(catalogPath, 'utf8');
        catalogData = JSON.parse(data);
    } catch (err) {
        console.error("Error loading catalog:", err);
    }
}

// Load initially
loadCatalog();

function getMerchantInfo() {
    return catalogData.merchant;
}

function getAllProducts() {
    return catalogData.products;
}

function getProductById(id) {
    return catalogData.products.find(p => p.id === id);
}

function searchProducts(query) {
    if (!query) return catalogData.products;
    const lowerQuery = query.toLowerCase();
    return catalogData.products.filter(p => 
        p.name.toLowerCase().includes(lowerQuery) || 
        p.description.toLowerCase().includes(lowerQuery) || 
        p.category.toLowerCase().includes(lowerQuery) ||
        (p.tags && p.tags.some(tag => tag.toLowerCase().includes(lowerQuery)))
    );
}

function getAccessories(productIds) {
    let accessories = [];
    for (const pid of productIds) {
        const product = getProductById(pid);
        if (product && product.compatible_accessories) {
            for (const accId of product.compatible_accessories) {
                const acc = getProductById(accId);
                if (acc && !accessories.find(a => a.id === accId)) {
                    accessories.push(acc);
                }
            }
        }
    }
    return accessories;
}

function updateStockInMemory(productId, newStock) {
    const product = getProductById(productId);
    if (product) {
        product.stock = newStock;
        product.availability = newStock > 0 ? 'in_stock' : 'out_of_stock';
    }
}

function addProductToMemory(product) {
    if (!getProductById(product.id)) {
        product.availability = product.stock > 0 ? 'in_stock' : 'out_of_stock';
        catalogData.products.push(product);
    }
}

function updateProductInMemory(productId, updates) {
    const product = getProductById(productId);
    if (product) {
        if (updates.name !== undefined) product.name = updates.name;
        if (updates.price !== undefined) product.price = updates.price;
        if (updates.stock !== undefined) {
            product.stock = updates.stock;
            product.availability = updates.stock > 0 ? 'in_stock' : 'out_of_stock';
        }
    }
}

function removeProductFromMemory(productId) {
    catalogData.products = catalogData.products.filter(p => p.id !== productId);
}

module.exports = {
    getMerchantInfo,
    getAllProducts,
    getProductById,
    searchProducts,
    getAccessories,
    updateStockInMemory,
    addProductToMemory,
    updateProductInMemory,
    removeProductFromMemory
};
