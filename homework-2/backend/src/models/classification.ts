import type { Category, Priority } from './ticket.js';

/** What the classifier concluded about a ticket's text. */
export interface ClassificationResult {
  category: Category;
  priority: Priority;
  /** 0..1 — how sure the classifier is, see classifier.ts for the formula. */
  confidence: number;
  category_confidence: number;
  priority_confidence: number;
  /** One or two plain-English sentences explaining the decision. */
  reasoning: string;
  /** Every keyword that influenced the result, in the form it appeared in the text. */
  keywords_found: string[];
}

/** The latest classification stored on a ticket. */
export interface StoredClassification extends ClassificationResult {
  classified_at: string;
}

export type ClassificationActor = 'system' | 'agent';

/**
 * One entry of the decision log ("Log all decisions" in the assignment).
 * Written for every automatic classification and every manual change of category/priority.
 */
export interface ClassificationDecision {
  id: string;
  ticket_id: string;
  at: string;
  /** `system` = the classifier, `agent` = a person changed the fields through the API. */
  actor: ClassificationActor;
  action: 'auto_classified' | 'manual_override';
  category: Category;
  priority: Priority;
  previous_category: Category;
  previous_priority: Priority;
  /** Only for automatic decisions. */
  confidence: number | null;
  reasoning: string | null;
  keywords_found: string[];
  /** False when the classifier ran but a manual override kept the agent's values. */
  applied: boolean;
}
