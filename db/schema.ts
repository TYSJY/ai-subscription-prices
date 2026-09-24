import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const priceSources = sqliteTable("price_sources", {
  key: text("key").primaryKey(),
  product: text("product").notNull(),
  region: text("region").notNull(),
  payload: text("payload"),
  observedAt: integer("observed_at").notNull().default(0),
  attemptedAt: integer("attempted_at").notNull().default(0),
  retryAt: integer("retry_at").notNull().default(0),
  leaseUntil: integer("lease_until").notNull().default(0),
  status: text("status").notNull().default("pending"),
  error: text("error"),
});

export const serviceCache = sqliteTable("service_cache", {
  key: text("key").primaryKey(),
  payload: text("payload"),
  updatedAt: integer("updated_at").notNull().default(0),
  retryAt: integer("retry_at").notNull().default(0),
  leaseUntil: integer("lease_until").notNull().default(0),
});

// Checkout observations stay separate from public App Store listings.
export const checkoutQuotes = sqliteTable("checkout_quotes", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  recordedAt: text("recorded_at").notNull(),
});
