// test_a2a.js
// This script simulates an AI Buyer interacting with the Agentic Commerce Protocol (A2A)

async function runAIBuyer() {
    console.log("🤖 AI Buyer: Initializing connection to Aura Commerce A2A endpoint...");
    
    try {
        const response = await fetch('http://localhost:3001/api/agent/catalog');
        const data = await response.json();
        
        console.log(`\n🤖 AI Buyer: Connected using protocol [${data.agent_protocol}]`);
        console.log(`🤖 AI Buyer: Retrieved catalog from [${data.merchant_name}]`);
        
        // Simulating the AI buyer parsing the catalog
        data.catalog.forEach(item => {
            console.log(`   - Found Item: ${item.name} | ID: ${item.id} | Price: ${item.price_inr} INR`);
        });
        
        console.log("\n🤖 AI Buyer: Catalog analysis complete.");
        console.log("🤖 AI Buyer: Action: Ready to generate purchase intent and negotiate pricing based on A2A protocol.");
        console.log("✅ (This demonstrates the Agent-Readable Catalog capability required for Track 1.)");
    } catch (e) {
        console.log("❌ Failed to connect. Is the backend running on port 3001?");
    }
}

runAIBuyer();
