import Together from "together-ai";

interface InvoiceItem {
  amount: number;
  title: string;
  head: string;
}

interface InvoiceData {
  total: number;
  items: InvoiceItem[];
}

function extractItemsFromMarkdown(text: string): InvoiceData | null {
  try {
    // Extract total amount
    const totalMatch = text.match(/\*\*Total Bill Amount:\*\* ([\d.]+)/);
    if (!totalMatch) return null;
    const total = Number(totalMatch[1]);

    // Extract items using regex
    const items: InvoiceItem[] = [];
    const itemRegex = /• \*\*Amount:\*\* ([\d.]+)\n\s+• \*\*Title:\*\* ([^\n]+)\n\s+• \*\*Category:\*\* ([^\n]+)/g;
    
    let match;
    while ((match = itemRegex.exec(text)) !== null) {
      items.push({
        amount: Number(match[1]),
        title: match[2].trim(),
        head: match[3].toLowerCase().trim(),
      });
    }

    if (items.length === 0) return null;

    return { total, items };
  } catch (error) {
    console.error("Failed to parse markdown response:", error);
    return null;
  }
}

function extractJSON(text: string) {
  // First try to parse as markdown if it contains markdown formatting
  if (text.includes('**')) {
    const markdownData = extractItemsFromMarkdown(text);
    if (markdownData) return markdownData;
  }

  // Try to find JSON between ``` markers (with or without json keyword)
  const codeBlockMatch = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (error) {
      console.error("Failed to parse code block JSON:", error);
    }
  }

  // Try to find anything that looks like a JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0].trim());
    } catch (error) {
      console.error("Failed to parse JSON object:", error);
    }
  }

  // Try parsing the entire text as JSON
  try {
    return JSON.parse(text.trim());
  } catch (error) {
    console.error("Failed to parse entire text as JSON:", error);
    return null;
  }
}

const together = new Together({
  apiKey: process.env.TOGETHER_API_KEY,
});

export const handleGetInvoiceData = async (imageURL: string): Promise<InvoiceData> => {
  try {
    const response = await together.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a precise bill scanning assistant. Extract all items from the bill and format them as follows:

{
  "total": <total_bill_amount>,
  "items": [
    {
      "amount": <item_amount>,
      "title": "<item_description>",
      "head": "<category>"
    },
    ...more items
  ]
}

For each item:
1. amount: The amount as a number (remove currency symbols)
2. title: A short, clear description of the item
3. head: The expense category (must be one of: food, rent, travel, utility, entertainment, shopping, health, education, gift, fitness, investment, unknown)

Return ONLY the JSON string. No explanatory text, no code block markers, no formatting.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all items from this bill including their individual amounts, titles, and categories",
            },
            {
              type: "image_url",
              image_url: {
                url: imageURL,
              },
            },
          ],
        },
      ],
      model: "meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo",
      // response_format: { type: "json_object" },
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    console.log('response❌❌❌❌❌❌❌', response, {
      message: response.choices[0].message
    });

    const parsedData = extractJSON(response.choices[0].message.content);
    
    if (!parsedData || !parsedData.total || !Array.isArray(parsedData.items) || parsedData.items.length === 0) {
      throw new Error("Failed to extract required fields from the bill");
    }

    // Ensure all amounts are numbers and validate head categories
    const validHeads = ["food", "rent", "travel", "utility", "entertainment", "shopping", "health", "education", "gift", "fitness", "investment", "unknown"];
    
    parsedData.total = Number(parsedData.total);
    parsedData.items = parsedData.items.map((item: InvoiceItem) => ({
      ...item,
      amount: Number(item.amount),
      head: validHeads.includes(item.head.toLowerCase()) ? item.head.toLowerCase() : "unknown"
    }));

    return parsedData as InvoiceData;
  } catch (error) {
    console.error("Error processing invoice:", error);
    throw new Error("Failed to process the bill image");
  }
}
