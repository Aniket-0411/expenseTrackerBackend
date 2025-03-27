import cron from 'node-cron';
import { OAuth2Client } from 'google-auth-library';
import { readEmailsFromSender } from './emailReader';
// import mongoose from 'mongoose';
import { v4 as uuidv4 } from "uuid";
import { UserModel } from '../model';

/**
 * Initializes the cron job to check for emails every 3 hours
 */
export async function initializeEmailCronJob() {
  console.log('Initializing email cron job to run every 3 hours');
  await processAllUsersEmails();
  
  // Schedule to run every 3 hours
  // Cron format: second(0-59) minute(0-59) hour(0-23) day(1-31) month(1-12) day of week(0-6)
  cron.schedule('0 0 */3 * * *', async () => {
    console.log(`Running email check cron job at ${new Date().toISOString()}`);
    await processAllUsersEmails();
  });
}

/**
 * Process emails for all users with valid tokens
 */
async function processAllUsersEmails() {
  try {
    // Find all users with access tokens
    const users = await UserModel.find({ 
      access_token: { $exists: true, $ne: null } 
    });
    
    console.log(`Processing emails for ${users.length} users`);
    
    for (const user of users) {
      try {
        await processUserEmails(user);
      } catch (error) {
        console.error(`Error processing emails for user ${user.userId}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in email cron job:', error);
  }
}

/**
 * Process emails for a specific user
 */
async function processUserEmails(user: any) {
  // Check if token is expired
  const now = Date.now();
  if (user.expiry_date && user.expiry_date < now) {
    console.log(`Token expired for user ${user.userId}, refreshing...`);
    try {
      // Create OAuth client
      const oAuth2Client = new OAuth2Client(
        process.env.CLIENT_ID,
        process.env.CLIENT_SECRET,
        process.env.REDIRECT_URI
      );
      
      // Set credentials
      oAuth2Client.setCredentials({
        refresh_token: user.refresh_token
      });
      
      // Refresh token
      const { credentials } = await oAuth2Client.refreshAccessToken();
      
      // Update user with new token
      user.access_token = credentials.access_token;
      user.expiry_date = credentials.expiry_date;
      await user.save();
      
      console.log(`Token refreshed for user ${user.userId}`);
    } catch (error) {
      console.error(`Failed to refresh token for user ${user.userId}:`, error);
      return; // Skip this user
    }
  }
  
  // Create OAuth client with user's token
  const oAuth2Client = new OAuth2Client(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.REDIRECT_URI
  );
  
  oAuth2Client.setCredentials({
    access_token: user.access_token,
    refresh_token: user.refresh_token
  });
  
  // Read emails from SBI Card
  console.log(`Checking emails for user ${user.userId}`);
  const processedEmails = await readEmailsFromSender(user.userId, oAuth2Client);
  
  // Add expenses to user's account if any found
  if (processedEmails.length > 0) {
    for (const processed of processedEmails) {
      const { expense } = processed;
      
      // Add each expense item to the user's expenses
      for (const item of expense.items) {
        const newExpense = {
          id: uuidv4(),
          month: new Date().toLocaleString('default', { month: 'long' }),
          head: item.title,
          amount: item.amount,
          icon: getSpendIcon(item.title),
          type: getSpendType(item.title),
          time: new Date()
        };
        
        user.expenses.push(newExpense);
      }
    }
    
    await user.save();
    console.log(`Added ${processedEmails.length} new expenses for user ${user.userId}`);
  } else {
    console.log(`No new expenses found for user ${user.userId}`);
  }
}

export type SpendCategory =
  | "food"
  | "rent"
  | "travel"
  | "utility"
  | "entertainment"
  | "shopping"
  | "health"
  | "education"
  | "gift"
  | "fitness"
  | "investment"
  | "unknown";

const spendIcons: Record<SpendCategory, string> = {
  food: "🍔",
  rent: "🏠",
  travel: "✈️",
  utility: "🔌",
  entertainment: "🎬",
  shopping: "🛍️",
  health: "🏥",
  education: "📚",
  gift: "🎁",
  fitness: "🏋️",
  investment: "📈",
  unknown: "❓",
};

export const colorToCategory: Record<SpendCategory, string> = {
  food: "#C76542",
  rent: "#4ade80",
  travel: "#41476E",
  utility: "#ef4444",
  entertainment: "#fed7aa",
  shopping: "#c084fc",
  health: "#FFBB50",
  education: "#E8C1B4",
  gift: "#564E4A",
  fitness: "#C03403",
  investment: "#6b21a8",
  unknown: "#d4d4d4",
};

export const keywordToCategory: Record<SpendCategory, string[]> = {
  food: [
    "pizza",
    "burger",
    "sandwich",
    "pasta",
    "coffee",
    "snack",
    "dinner",
    "lunch",
    "breakfast",
    "food",
  ],
  rent: ["rent", "lease", "mortgage"],
  utility: [
    "electricity",
    "water",
    "gas",
    "internet",
    "phone",
    "heating",
    "cooling",
    "electric bill",
    "water bill",
    "gas bill",
    "internet bill",
    "phone bill",
    "utility",
  ],
  travel: [
    "flight",
    "train",
    "bus",
    "taxi",
    "uber",
    "lyft",
    "car rental",
    "airfare",
    "metro",
    "travel",
  ],
  entertainment: [
    "movie",
    "netflix",
    "concert",
    "game",
    "party",
    "show",
    "theater",
    "cinema",
    "entertainment",
  ],
  shopping: [
    "clothes",
    "shoes",
    "electronics",
    "makeup",
    "accessories",
    "jewelry",
    "furniture",
    "appliances",
    "shopping",
  ],
  health: [
    "medicine",
    "doctor",
    "hospital",
    "pharmacy",
    "checkup",
    "therapy",
    "surgery",
    "health",
  ],
  education: [
    "books",
    "tuition",
    "course",
    "workshop",
    "seminar",
    "study material",
    "online class",
    "education",
  ],
  gift: ["gift", "present", "donation", "charity", "wedding", "birthday"],
  fitness: [
    "gym",
    "yoga",
    "workout",
    "trainer",
    "sports",
    "exercise",
    "fitness",
  ],
  investment: [
    "stocks",
    "shares",
    "mutual funds",
    "crypto",
    "savings",
    "bonds",
    "investment",
  ],
  unknown: [],
};

const getSpendIcon = (transactionHead: string): string => {
  const lowerCaseHead = transactionHead.toLowerCase();

  const category = (Object.keys(keywordToCategory) as SpendCategory[]).find(
    (cat) =>
      keywordToCategory[cat].some((keyword) =>
        lowerCaseHead.includes(keyword)
      )
  );

  const matchedIcon = spendIcons[category || "unknown"];
  // setIcon(matchedIcon);
  return matchedIcon;
};

const getSpendType = (transactionHead: string): SpendCategory => {
  const lowerCaseHead = transactionHead.toLowerCase();

  const category = (Object.keys(keywordToCategory) as SpendCategory[]).find(
    (cat) =>
      keywordToCategory[cat].some((keyword) =>
        lowerCaseHead.includes(keyword)
      )
  );

  return category || "unknown";
};
