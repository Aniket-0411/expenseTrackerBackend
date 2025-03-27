import Together from "together-ai";

interface ExpenseItem {
  amount: number;
  title: string;
  head: string;
}

interface ExpenseData {
  total: number;
  items: ExpenseItem[];
}

// Define common expense categories and their related keywords
const categoryKeywords: Record<string, string[]> = {
  food: ['food', 'restaurant', 'meal', 'lunch', 'dinner', 'breakfast', 'cafe', 'grocery', 'groceries', 'takeout', 'doordash', 'uber eats', 'grubhub'],
  rent: ['rent', 'lease', 'housing', 'apartment', 'mortgage', 'property'],
  travel: ['travel', 'flight', 'hotel', 'airfare', 'airline', 'booking', 'trip', 'vacation', 'uber', 'lyft', 'taxi', 'car rental'],
  utility: ['utility', 'electric', 'water', 'gas', 'internet', 'phone', 'bill', 'cable', 'subscription'],
  entertainment: ['entertainment', 'movie', 'theatre', 'concert', 'show', 'netflix', 'spotify', 'hulu', 'disney+', 'prime', 'subscription'],
  shopping: ['shopping', 'purchase', 'amazon', 'store', 'retail', 'mall', 'online', 'buy', 'bought'],
  health: ['health', 'medical', 'doctor', 'hospital', 'pharmacy', 'medicine', 'prescription', 'dental', 'healthcare'],
  education: ['education', 'tuition', 'school', 'college', 'university', 'course', 'class', 'book', 'textbook'],
  gift: ['gift', 'present', 'donation', 'charity'],
  fitness: ['fitness', 'gym', 'workout', 'exercise', 'sport', 'membership'],
  investment: ['investment', 'stock', 'bond', 'mutual fund', 'etf', 'crypto', 'bitcoin', 'ethereum', 'trading']
};

export const handleGetEmailExpense = async (emailText: string): Promise<ExpenseData> => {
  try {
    // Extract all potential amounts from the email
    const amountMatches = extractAmounts(emailText);
    
    if (amountMatches.length === 0) {
      throw new Error("No expense amounts found in the email");
    }

    // Assume the largest amount is the total
    const sortedAmounts = [...amountMatches].sort((a, b) => b.amount - a.amount);
    const totalAmount = sortedAmounts[0].amount;
    
    // Create expense items
    const items: ExpenseItem[] = [];
    
    // If we have multiple amounts, use them as separate items
    if (amountMatches.length > 1) {
      for (let i = 0; i < amountMatches.length; i++) {
        const match = amountMatches[i];
        
        // Skip the total amount if we have multiple items
        if (amountMatches.length > 2 && match.amount === totalAmount) {
          continue;
        }
        
        // Get the surrounding text (50 characters before and after) to determine the expense category
        const start = Math.max(0, match.index - 50);
        const end = Math.min(emailText.length, match.index + match.text.length + 50);
        const surroundingText = emailText.substring(start, end).toLowerCase();
        
        // Determine the expense category based on keywords
        const head = determineCategory(surroundingText);
        
        // Create a title based on surrounding text
        const title = createTitle(surroundingText, match.text);
        
        items.push({
          amount: match.amount,
          title,
          head
        });
      }
    }
    
    // If we have no items (only found the total), create a single item
    if (items.length === 0) {
      items.push({
        amount: totalAmount,
        title: "Expense from email",
        head: "unknown"
      });
    }
    
    // Calculate the total from items if we have multiple items
    const calculatedTotal = items.reduce((sum, item) => sum + item.amount, 0);
    
    // Use the calculated total if it's close to the extracted total or if we have multiple items
    const finalTotal = (Math.abs(calculatedTotal - totalAmount) < 0.01 || items.length > 1) 
      ? calculatedTotal 
      : totalAmount;
    
    return {
      total: finalTotal,
      items
    };
  } catch (error) {
    console.error("Error processing email expense📧❌:", error);
    throw new Error("Failed to process the email text");
  }
};

/**
 * Extract all monetary amounts from the email text
 */
function extractAmounts(text: string): { amount: number; text: string; index: number }[] {
  const results: { amount: number; text: string; index: number }[] = [];
  
  // Match patterns like $123.45, 123.45 USD, $123, etc.
  const amountRegexes = [
    /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g,  // $123.45 or $ 123.45
    /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:USD|dollars|dollar)/gi,  // 123.45 USD or 123.45 dollars
    /total\s*(?:amount|payment|charge|price)?(?:\s*:|\s+of)?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,  // total amount: $123.45
    /amount\s*(?::|\s+of)?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,  // amount: $123.45
    /payment\s*(?:of|:)?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,  // payment of $123.45
    /charged\s*(?::|\s+of)?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,  // charged: $123.45
    /price\s*(?::|\s+of)?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,  // price: $123.45
    /cost\s*(?::|\s+of)?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,  // cost: $123.45
    /bill\s*(?::|\s+of)?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,  // bill: $123.45
    /invoice\s*(?::|\s+of)?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,  // invoice: $123.45
    /(?:USD|dollars|dollar)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,  // USD 123.45
  ];
  
  for (const regex of amountRegexes) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      // Get the full matched text
      const fullMatch = match[0];
      
      // Extract the numeric part
      let numericPart = match[1] || "";
      
      // Remove commas and convert to number
      const amount = parseFloat(numericPart.replace(/,/g, ""));
      
      if (!isNaN(amount) && amount > 0) {
        results.push({
          amount,
          text: fullMatch,
          index: match.index
        });
      }
    }
  }
  
  return results;
}

/**
 * Determine the expense category based on keywords in the text
 */
function determineCategory(text: string): string {
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return category;
      }
    }
  }
  
  return "unknown";
}

/**
 * Create a title for the expense based on surrounding text
 */
function createTitle(text: string, amountText: string): string {
  // Remove the amount text from the surrounding text
  const textWithoutAmount = text.replace(amountText, "");
  
  // Look for patterns like "purchase at [merchant]", "payment to [merchant]", etc.
  const merchantPatterns = [
    /(?:purchase|payment|transaction|charge)\s+(?:at|to|from)\s+([A-Za-z0-9\s&]+)/i,
    /(?:from|at|to)\s+([A-Za-z0-9\s&]+)\s+(?:on|for)/i,
    /([A-Za-z0-9\s&]+)\s+(?:store|restaurant|shop|market)/i
  ];
  
  for (const pattern of merchantPatterns) {
    const match = textWithoutAmount.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // If no merchant found, look for any capitalized words that might be a business name
  const businessNamePattern = /([A-Z][A-Za-z0-9\s&]{2,20})/g;
  const businessMatches = [...textWithoutAmount.matchAll(businessNamePattern)];
  
  if (businessMatches.length > 0) {
    return businessMatches[0][1].trim();
  }
  
  // If all else fails, return a generic title
  return "Expense";
}