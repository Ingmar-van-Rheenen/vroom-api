import { pgTable, text, timestamp, uuid, pgEnum, primaryKey, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    naam: text('naam').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailUnique: index('users_email_unique').on(sql`lower(${t.email})`),
  }),
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
  },
  (t) => ({
    userIdx: index('sessions_user_id_idx').on(t.userId),
  }),
);

export const magicLinks = pgTable(
  'magic_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index('magic_links_email_idx').on(sql`lower(${t.email})`),
  }),
);

export const groepTypeEnum = pgEnum('groep_type', ['solo', 'stel', 'familie', 'anders']);
export const groepRolEnum = pgEnum('groep_rol', ['admin', 'lid']);

export const groepen = pgTable('groepen', {
  id: uuid('id').primaryKey().defaultRandom(),
  naam: text('naam').notNull(),
  type: groepTypeEnum('type').notNull().default('solo'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  ...timestamps,
});

export const groepLeden = pgTable(
  'groep_leden',
  {
    groepId: uuid('groep_id')
      .notNull()
      .references(() => groepen.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rol: groepRolEnum('rol').notNull().default('lid'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.groepId, t.userId] }),
    userIdx: index('groep_leden_user_id_idx').on(t.userId),
  }),
);

export const groepInvites = pgTable(
  'groep_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groepId: uuid('groep_id')
      .notNull()
      .references(() => groepen.id, { onDelete: 'cascade' }),
    code: text('code').notNull().unique(),
    email: text('email'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedBy: uuid('accepted_by').references(() => users.id),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    groepIdx: index('groep_invites_groep_id_idx').on(t.groepId),
    emailIdx: index('groep_invites_email_idx').on(sql`lower(${t.email})`),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type MagicLink = typeof magicLinks.$inferSelect;
export type Groep = typeof groepen.$inferSelect;
export type NewGroep = typeof groepen.$inferInsert;
export type GroepLid = typeof groepLeden.$inferSelect;
export type GroepInvite = typeof groepInvites.$inferSelect;
