import React from "react";
import type { Question } from "../types/agent";

interface AskUserQuestionResultProps {
  questions: Question[];
  answers: Record<string, string>;
  className?: string;
}

/**
 * Displays the result of an answered AskUserQuestion tool call.
 * Shows each question with its selected answer.
 */
export const AskUserQuestionResult: React.FC<AskUserQuestionResultProps> = ({
  questions,
  answers,
  className = "",
}) => {
  return (
    <div
      className={`space-y-2.5 rounded-xl border px-4 py-3 ${className}`}
    >
      {questions.map((question, idx) => {
        const answer = answers[question.header] || "No answer";
        return (
          <div
            key={question.header}
            className={idx > 0 ? "" : ""}
          >
            <div className="text-meta text-muted-foreground">{question.question}</div>
            <div className="mt-0.5 text-sm text-foreground">{answer}</div>
          </div>
        );
      })}
    </div>
  );
};
