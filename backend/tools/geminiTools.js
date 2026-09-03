const { Type } = require('@google/genai');

const toolDeclarations = [
    {
        name: "search_products",
        description: "Search catalog for products.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: { type: Type.STRING, description: "Search keyword (e.g. 'headphones', 'watch')" }
            },
            required: ["query"]
        }
    },
    {
        name: "check_stock",
        description: "Check if product ID is in stock.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                product_id: { type: Type.STRING, description: "ID of the product (e.g. 'P101')" }
            },
            required: ["product_id"]
        }
    },
    {
        name: "recommend_accessories",
        description: "Find catalog accessories explicitly compatible with a product. Use after recommending a main product to find compatible accessories for cross-selling and creating optional bundles.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                product_id: { type: Type.STRING, description: "ID of the base product" }
            },
            required: ["product_id"]
        }
    },
    {
        name: "create_offer",
        description: "Validate a negotiated offer against business rules for the complete bundle/cart. Use when a customer asks for a discount or negotiates the price of one or more items.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                items: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING, description: "Product ID" },
                            quantity: { type: Type.INTEGER, description: "Quantity of the product" }
                        },
                        required: ["id"]
                    },
                    description: "List of items in the cart"
                },
                proposed_price_inr: { type: Type.NUMBER, description: "The total negotiated price you want to offer in INR for the entire cart" }
            },
            required: ["items", "proposed_price_inr"]
        }
    },
    {
        name: "initiate_checkout",
        description: "Initiate checkout state when the customer clearly expresses purchase intent. Must include all confirmed items and accessories.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                items: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING, description: "Product ID" },
                            quantity: { type: Type.INTEGER, description: "Quantity to purchase" }
                        },
                        required: ["id"]
                    },
                    description: "List of all items to checkout, including accepted accessories"
                }
            },
            required: ["items"]
        }
    },
    {
        name: "generate_payment_link",
        description: "Generate a Razorpay payment link. Use exact catalog prices.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                items: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING, description: "Product ID" },
                            agreed_price: { type: Type.NUMBER, description: "Price agreed upon" },
                            quantity: { type: Type.INTEGER, description: "Quantity to purchase" }
                        },
                        required: ["id", "agreed_price"]
                    },
                    description: "List of items to purchase"
                },
                customer_name: { type: Type.STRING, description: "Name of the customer" },
                customer_email: { type: Type.STRING, description: "Email of the customer" }
            },
            required: ["items", "customer_name", "customer_email"]
        }
    },
    {
        name: "record_context_recommendation",
        description: "Log a contextual recommendation.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                preference_detected: { type: Type.STRING, description: "The conversational preference detected (e.g. 'Music + Travel')" },
                recommended_product_id: { type: Type.STRING, description: "The ID of the catalog product you decided to recommend" },
                reasoning: { type: Type.STRING, description: "Short business reasoning for why this product fits the context" }
            },
            required: ["preference_detected", "recommended_product_id", "reasoning"]
        }
    },
    {
        name: "verify_payment",
        description: "Verify the payment status of the current order with Razorpay. Use this when the customer claims they have paid or asks for order confirmation.",
        parameters: {
            type: Type.OBJECT,
            properties: {},
            required: []
        }
    },
    {
        name: "finalize_checkout",
        description: "Atomically validate the final cart and generate a Razorpay payment link. Use this to finalize the purchase in one step when the customer has confirmed intent and provided details.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                items: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING, description: "Product ID" },
                            quantity: { type: Type.INTEGER, description: "Quantity to purchase" },
                            agreed_price: { type: Type.NUMBER, description: "Price agreed upon" }
                        },
                        required: ["id", "agreed_price"]
                    },
                    description: "List of items to purchase"
                },
                customer_name: { type: Type.STRING, description: "Name of the customer" },
                customer_email: { type: Type.STRING, description: "Email of the customer" }
            },
            required: ["items", "customer_name", "customer_email"]
        }
    }
];

module.exports = {
    toolDeclarations
};
