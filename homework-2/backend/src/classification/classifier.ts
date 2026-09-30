import type { ClassificationResult } from '../models/classification.js';
import type { Category, Priority } from '../models/ticket.js';
import { CATEGORY_RULES, PRIORITY_RULES, SUBJECT_WEIGHT, type KeywordRule } from './rules.js';

export interface ClassifiableText {
  subject: string;
  description: string;
}

type RuledCategory = keyof typeof CATEGORY_RULES;

/** When two categories score the same, the more specific one wins (a bug report is a kind of technical issue). */
const TIE_BREAK_ORDER: RuledCategory[] = ['bug_report', 'account_access', 'billing_question', 'feature_request', 'technical_issue'];

/** Score at which the classifier is "fully convinced" by the amount of evidence alone. */
const SATURATION_SCORE = 6;
const NO_MATCH_CATEGORY_CONFIDENCE = 0.25;
const PRIORITY_CONFIDENCE = { matched: 0.9, conflicting: 0.7, default: 0.5 };

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Lowercases and unifies apostrophes so "Can’t" and "can't" match the same rule. Newlines are kept. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[’‘`´]/g, "'");
}

const termPatterns = new Map<string, RegExp>();

/**
 * Whole-word match: "pay" must not match "paypal" or "repay".
 * Spaces in a phrase match any whitespace, so "log  in" and "log\nin" still count.
 */
function termPattern(term: string): RegExp {
  let pattern = termPatterns.get(term);
  if (!pattern) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    pattern = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`);
    termPatterns.set(term, pattern);
  }
  return pattern;
}

/** Returns the spelling of the rule found in `text`, or undefined. The longest spelling is preferred. */
function findRule(rule: KeywordRule, text: string): string | undefined {
  const byLength = [...rule.terms].sort((a, b) => b.length - a.length);
  const term = byLength.find((candidate) => termPattern(candidate).test(text));
  if (term) return term;
  return rule.pattern?.test(text) ? rule.label : undefined;
}

interface CategoryScore {
  category: RuledCategory;
  score: number;
  keywords: string[];
}

function scoreCategories(subject: string, description: string): CategoryScore[] {
  return (Object.entries(CATEGORY_RULES) as [RuledCategory, KeywordRule[]][]).map(([category, rules]) => {
    let score = 0;
    const keywords: string[] = [];
    for (const rule of rules) {
      const inSubject = findRule(rule, subject);
      const found = inSubject ?? findRule(rule, description);
      if (!found) continue;
      score += rule.weight * (inSubject ? SUBJECT_WEIGHT : 1);
      keywords.push(found);
    }
    return { category, score, keywords };
  });
}

function pickCategory(scores: CategoryScore[]) {
  const ranked = [...scores].sort(
    (a, b) => b.score - a.score || TIE_BREAK_ORDER.indexOf(a.category) - TIE_BREAK_ORDER.indexOf(b.category),
  );
  const [best, runnerUp] = ranked as [CategoryScore, CategoryScore];

  if (best.score === 0) {
    return {
      category: 'other' as Category,
      confidence: NO_MATCH_CATEGORY_CONFIDENCE,
      keywords: [],
      reasoning: 'No category keywords were found, so the ticket is filed as other.',
    };
  }

  // Confidence = how much evidence there is × how clearly the winner beats the runner-up.
  const strength = Math.min(best.score / SATURATION_SCORE, 1);
  const dominance = best.score / (best.score + runnerUp.score);
  const confidence = round2(Math.min(Math.max(strength * dominance, 0.05), 0.99));

  const quoted = best.keywords.map((k) => `"${k}"`).join(', ');
  const runnerUpText = runnerUp.score > 0 ? `; runner-up ${runnerUp.category} scored ${runnerUp.score}` : '';
  return {
    category: best.category as Category,
    confidence,
    keywords: best.keywords,
    reasoning: `Categorized as ${best.category} (score ${best.score}) based on ${quoted}${runnerUpText}.`,
  };
}

function pickPriority(text: string) {
  const matches = PRIORITY_RULES.map(({ priority, terms }) => ({
    priority,
    terms: terms.filter((term) => termPattern(term).test(text)),
  })).filter((level) => level.terms.length > 0);

  const [winner] = matches;
  if (!winner) {
    return {
      priority: 'medium' as Priority,
      confidence: PRIORITY_CONFIDENCE.default,
      keywords: [],
      reasoning: 'No priority keywords were found, so the default priority medium is used.',
    };
  }

  const conflicting = matches.length > 1;
  const quoted = winner.terms.map((t) => `"${t}"`).join(', ');
  const overruled = conflicting ? ` (it outranks ${matches.slice(1).map((m) => m.priority).join(', ')} keywords also present)` : '';
  return {
    priority: winner.priority as Priority,
    confidence: conflicting ? PRIORITY_CONFIDENCE.conflicting : PRIORITY_CONFIDENCE.matched,
    keywords: winner.terms,
    reasoning: `Priority ${winner.priority} because of ${quoted}${overruled}.`,
  };
}

/**
 * Rule-based classification: deterministic (same text → same result), instant and explainable.
 * The overall confidence is the average of the category and priority confidences.
 */
export function classifyTicket({ subject, description }: ClassifiableText): ClassificationResult {
  const normalizedSubject = normalize(subject);
  const normalizedDescription = normalize(description);

  const category = pickCategory(scoreCategories(normalizedSubject, normalizedDescription));
  const priority = pickPriority(`${normalizedSubject}\n${normalizedDescription}`);

  return {
    category: category.category,
    priority: priority.priority,
    confidence: round2((category.confidence + priority.confidence) / 2),
    category_confidence: category.confidence,
    priority_confidence: priority.confidence,
    reasoning: `${category.reasoning} ${priority.reasoning}`,
    keywords_found: [...new Set([...category.keywords, ...priority.keywords])],
  };
}
