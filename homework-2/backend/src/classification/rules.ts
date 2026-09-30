import type { Category, Priority } from '../models/ticket.js';

/**
 * A signal the classifier looks for. `terms` are the spellings that count as the same signal
 * ("crash", "crashes", "crashed"); a signal counts once per ticket even if several spellings appear.
 */
export interface KeywordRule {
  terms: string[];
  /** How strongly this signal points to the category: 1 = hint, 2 = clear, 3 = decisive. */
  weight: number;
  /** Optional extra pattern for signals that are not plain words (e.g. numbered steps). */
  pattern?: RegExp;
  /** Name shown in `keywords_found` for a pattern match. */
  label?: string;
}

/**
 * Category signals. `other` has no rules: it is what remains when nothing matches.
 *
 * bug_report vs technical_issue follows common support-desk practice (Jira, Zendesk):
 * a bug report describes a reproducible defect (steps, expected vs actual, version, regression),
 * a technical issue says "something is broken" without that detail. Reproduction signals therefore
 * carry the highest weight, so a ticket that has them wins bug_report even if it also says "error".
 */
export const CATEGORY_RULES: Record<Exclude<Category, 'other'>, KeywordRule[]> = {
  account_access: [
    { terms: ['login', 'log in', 'logging in', 'sign in', 'signing in', 'sign-in'], weight: 2 },
    { terms: ['password', 'reset password', 'password reset'], weight: 2 },
    { terms: ['2fa', 'two-factor', 'two factor', 'mfa', 'authenticator', 'verification code', 'one-time code'], weight: 3 },
    { terms: ['locked out', 'account locked', 'account is locked'], weight: 3 },
    { terms: ["can't access", 'cannot access', 'can not access', 'unable to access', 'no access'], weight: 2 },
    { terms: ['sso', 'single sign-on', 'username'], weight: 1 },
  ],
  technical_issue: [
    { terms: ['error', 'errors', 'error message'], weight: 2 },
    { terms: ['crash', 'crashes', 'crashed', 'crashing'], weight: 2 },
    { terms: ['not working', "doesn't work", 'does not work', "isn't working", 'stopped working', 'broken'], weight: 2 },
    { terms: ['timeout', 'timed out', 'times out'], weight: 2 },
    { terms: ["won't load", 'not loading', 'fails to load', 'blank page', 'white screen'], weight: 2 },
    { terms: ['slow', 'freezes', 'frozen', 'hangs', 'lag'], weight: 1 },
    { terms: ['outage', 'down', 'unavailable', '500', '502', '503'], weight: 1 },
    { terms: ['sync', 'syncing', 'integration', 'api'], weight: 1 },
  ],
  billing_question: [
    { terms: ['invoice', 'invoices'], weight: 3 },
    { terms: ['refund', 'refunds', 'money back'], weight: 3 },
    { terms: ['payment', 'payments', 'paid', 'pay'], weight: 2 },
    { terms: ['charge', 'charged', 'charges', 'overcharged', 'double charged'], weight: 2 },
    { terms: ['billing', 'billed', 'bill'], weight: 2 },
    { terms: ['subscription', 'plan', 'pricing', 'price', 'receipt', 'credit card', 'card'], weight: 1 },
  ],
  feature_request: [
    { terms: ['feature request', 'feature'], weight: 2 },
    { terms: ['would like', "i'd like", 'it would be great', 'it would be nice', 'would be helpful', 'please add', 'could you add', 'can you add'], weight: 2 },
    { terms: ['suggestion', 'suggest', 'propose', 'proposal'], weight: 2 },
    { terms: ['enhancement', 'improvement', 'improve', 'add support', 'support for'], weight: 2 },
    { terms: ['wish', 'nice to have', 'roadmap', 'dark mode', 'integration with'], weight: 1 },
  ],
  bug_report: [
    { terms: ['steps to reproduce', 'to reproduce', 'reproduce', 'reproducible', 'repro'], weight: 3 },
    { terms: ['expected result', 'expected behavior', 'expected behaviour', 'actual result', 'actual behavior', 'actual behaviour'], weight: 3 },
    {
      terms: [],
      // "1." / "1)" / "step 1" at the start of a line: numbered reproduction steps.
      pattern: /(^|\n)\s*(step\s*1\b|1[.)]\s)/i,
      label: 'numbered steps',
      weight: 3,
    },
    { terms: ['bug', 'defect', 'regression', 'since the last update', 'after the update', 'since version'], weight: 2 },
    { terms: ['expected', 'actual', 'instead of'], weight: 1 },
    // Small visible defects: still bugs, just not outages.
    { terms: ['typo', 'cosmetic', 'misaligned', 'glitch', 'wrong label'], weight: 1 },
  ],
};

/**
 * Priority signals from the assignment, plus obvious spelling variants.
 * Checked from most to least severe; the first level with a match wins.
 * No match means `medium`, the default.
 */
export const PRIORITY_RULES: { priority: Exclude<Priority, 'medium'>; terms: string[] }[] = [
  {
    priority: 'urgent',
    terms: ["can't access", 'cannot access', 'can not access', 'critical', 'production down', 'prod down', 'security', 'urgent', 'emergency', 'data loss'],
  },
  {
    priority: 'high',
    terms: ['important', 'blocking', 'blocked', 'blocker', 'asap', 'as soon as possible', 'high priority'],
  },
  {
    priority: 'low',
    terms: ['minor', 'cosmetic', 'suggestion', 'typo', 'nice to have', 'low priority', 'whenever'],
  },
];

/** Keywords in the subject count this many times more than in the description: the subject is the customer's own summary. */
export const SUBJECT_WEIGHT = 2;
