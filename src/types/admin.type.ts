import mongoose, { Document } from "mongoose";

// Enum for user status
export enum Status {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

// Define the Role type (modify as per your role system)
export type TRole = "ADMIN" | "USER" | "MATCH_MAKER" | "FREE_USER"; // Customize roles



/**
 * Admin and Match Maker User Schema
 */
export interface IAdminUser extends Document {
  name: string;
  email: string;
  password: string;
  phoneNumber: string;
  role: TRole;
  isPasswordResetRequired: boolean;
  undertakingUser: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
  status: Status;
  lastLogin?: Date | null;
}

export interface DecodedToken {
  id: string;
  roles: string[];
  iat: number;
  exp: number;
}

/**
 * Login Request Body
 */
export interface ILoginRequestBody {
  email: string;
  password: string;
  decoded?: DecodedToken;
}

/**
 * Admin Signup Request Body
 */
export interface ISignupRequestBody {
  name: string;
  email: string;
  phoneNumber: string;
}
