// Test script to verify the multi-tenant fix works
// This will test adding the first candidate through the AI API

const testAddCandidate = async () => {
  const testQuestion = "Add candidate 299047 - Dental Nurse in WA4 2GU, phone 07861850730, salary DOE, working Mon, Tue, Thu - ASAP start";
  
  console.log("Testing AI candidate addition...");
  console.log("Question:", testQuestion);
  
  try {
    const response = await fetch('http://localhost:3000/api/ai/ask', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        // Note: In real usage, this would include authentication cookies
      },
      body: JSON.stringify({ 
        question: testQuestion,
        sessionId: null 
      })
    });

    const result = await response.text();
    console.log("\n=== Response Status ===");
    console.log("Status:", response.status);
    console.log("OK:", response.ok);
    
    console.log("\n=== Response Body ===");
    console.log(result);
    
    if (response.ok) {
      try {
        const parsed = JSON.parse(result);
        console.log("\n=== Parsed Response ===");
        console.log("Success:", parsed.success);
        console.log("Answer:", parsed.answer);
        console.log("Tools Used:", parsed.toolsUsed);
      } catch (e) {
        console.log("Could not parse JSON response");
      }
    }
    
  } catch (error) {
    console.error("Error testing AI:", error.message);
  }
};

testAddCandidate();