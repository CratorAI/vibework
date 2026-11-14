import React, { useState, useEffect, useCallback, useRef } from "react";
import { withChord } from "@/lib/shortcuts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Pencil, ArrowRight, ChevronRight, ChevronLeft, Square } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { AskUserQuestionRequest } from "../types/agent";

interface AskUserQuestionProps {
  request: AskUserQuestionRequest;
  onRespond: (answers: Record<string, string>) => void;
  className?: string;
  /** Shown in the message box's place (the composer card is its frame) */
  docked?: boolean;
  /** Stop the whole turn */
  onStop?: () => void;
}

export const AskUserQuestion: React.FC<AskUserQuestionProps> = ({
  request,
  onRespond,
  className,
  docked = false,
  onStop,
}) => {
  // In view when it appears or the task is opened on it (it answers to ↑↓
  // and Enter). Docked in the message box it is always in view: it takes
  // focus instead, so keys meant for it don't land elsewhere.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (docked) {
      const active = document.activeElement as HTMLElement | null;
      const typingElsewhere =
        !!active && active !== document.body && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
      if (!typingElsewhere || active?.closest('[data-testid="composer"]')) rootRef.current?.focus({ preventScroll: true });
      return;
    }
    const frame = requestAnimationFrame(() => rootRef.current?.scrollIntoView({ block: "nearest" }));
    return () => cancelAnimationFrame(frame);
  }, [request.requestId, docked]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [focusedOptionIndex, setFocusedOptionIndex] = useState(0);
  const [selections, setSelections] = useState<
    Record<string, string | string[]>
  >({});
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [showCustomInputs, setShowCustomInputs] = useState<
    Record<string, boolean>
  >({});

  // Refs to track latest state for use in callbacks (avoids stale closure issues)
  const selectionsRef = useRef(selections);
  const customValuesRef = useRef(customValues);
  const showCustomInputsRef = useRef(showCustomInputs);

  // Keep refs in sync with state
  useEffect(() => {
    selectionsRef.current = selections;
  }, [selections]);
  useEffect(() => {
    customValuesRef.current = customValues;
  }, [customValues]);
  useEffect(() => {
    showCustomInputsRef.current = showCustomInputs;
  }, [showCustomInputs]);

  const currentQuestion = request.questions[currentQuestionIndex];
  const totalQuestions = request.questions.length;
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;
  const isMultiSelect = currentQuestion?.multiSelect;

  // Total options including "Something else"
  const totalOptions = (currentQuestion?.options.length || 0) + 1;

  const handleSelect = (header: string, value: string | string[]) => {
    setSelections((prev) => ({ ...prev, [header]: value }));
  };

  const handleCustomChange = (header: string, value: string) => {
    setCustomValues((prev) => ({ ...prev, [header]: value }));
  };

  const handleShowCustomInput = (header: string, show: boolean) => {
    setShowCustomInputs((prev) => ({ ...prev, [header]: show }));
  };

  // Use refs to get latest state values (avoids stale closure in setTimeout)
  const buildAnswers = useCallback(() => {
    const answers: Record<string, string> = {};
    const currentSelections = selectionsRef.current;
    const currentCustomValues = customValuesRef.current;
    const currentShowCustomInputs = showCustomInputsRef.current;

    request.questions.forEach((q) => {
      const header = q.header;
      if (currentShowCustomInputs[header] && currentCustomValues[header]) {
        answers[header] = currentCustomValues[header];
      } else {
        const selection = currentSelections[header];
        if (Array.isArray(selection)) {
          answers[header] = request.requestId.startsWith("frm_") ? JSON.stringify(selection) : selection.join(", ");
        } else if (selection) {
          answers[header] = selection;
        } else {
          answers[header] = "Skipped";
        }
      }
    });
    return answers;
  }, [request.questions]);

  const handleAdvance = useCallback(() => {
    if (isLastQuestion) {
      onRespond(buildAnswers());
    } else {
      setCurrentQuestionIndex((prev) => prev + 1);
      setFocusedOptionIndex(0);
    }
  }, [isLastQuestion, onRespond, buildAnswers]);

  const handleGoBack = useCallback(() => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
      setFocusedOptionIndex(0);
    }
  }, [currentQuestionIndex]);

  const handleSkip = useCallback(() => {
    const answers: Record<string, string> = {};
    const currentSelections = selectionsRef.current;
    const currentCustomValues = customValuesRef.current;
    const currentShowCustomInputs = showCustomInputsRef.current;

    request.questions.forEach((q, idx) => {
      const header = q.header;
      if (idx < currentQuestionIndex) {
        // Preserve already answered questions
        if (currentShowCustomInputs[header] && currentCustomValues[header]) {
          answers[header] = currentCustomValues[header];
        } else {
          const selection = currentSelections[header];
          if (Array.isArray(selection)) {
            answers[header] = request.requestId.startsWith("frm_") ? JSON.stringify(selection) : selection.join(", ");
          } else if (selection) {
            answers[header] = selection;
          } else {
            answers[header] = "Skipped";
          }
        }
      } else {
        // Mark remaining as skipped
        answers[header] = "Skipped";
      }
    });
    onRespond(answers);
  }, [request.questions, currentQuestionIndex, onRespond]);

  const handleOptionSelect = useCallback(
    (label: string) => {
      const header = currentQuestion.header;

      // Hide custom input if selecting a regular option
      if (showCustomInputs[header]) {
        handleShowCustomInput(header, false);
      }

      if (isMultiSelect) {
        const currentSelection = Array.isArray(selections[header])
          ? (selections[header] as string[])
          : [];
        const newSelection = currentSelection.includes(label)
          ? currentSelection.filter((v) => v !== label)
          : [...currentSelection, label];
        handleSelect(header, newSelection);
      } else {
        handleSelect(header, label);
        // Auto-advance for single-select after brief delay
        setTimeout(() => {
          handleAdvance();
        }, 150);
      }
    },
    [
      currentQuestion,
      showCustomInputs,
      isMultiSelect,
      selections,
      handleAdvance,
    ]
  );

  const handleCustomInputSubmit = useCallback(() => {
    const header = currentQuestion.header;
    if (customValues[header]?.trim()) {
      handleAdvance();
    }
  }, [currentQuestion, customValues, handleAdvance]);

  const handleCustomClick = () => {
    const header = currentQuestion.header;
    handleShowCustomInput(header, true);
    if (!isMultiSelect) {
      handleSelect(header, "");
    }
    setFocusedOptionIndex(totalOptions - 1);
  };

  // Check if current question has a selection for multi-select Continue button
  const hasCurrentSelection = useCallback(() => {
    const header = currentQuestion?.header;
    if (!header) return false;

    if (showCustomInputs[header]) {
      return customValues[header]?.trim().length > 0;
    }

    const selection = selections[header];
    if (Array.isArray(selection)) {
      return selection.length > 0;
    }
    return Boolean(selection);
  }, [currentQuestion, showCustomInputs, customValues, selections]);

  const isOptionSelected = (label: string) => {
    const header = currentQuestion.header;
    if (showCustomInputs[header] && !isMultiSelect) return false;
    const selection = selections[header];
    const selectedArray = Array.isArray(selection)
      ? selection
      : selection
        ? [selection]
        : [];
    return selectedArray.includes(label);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Keys typed into another field (renaming a task, the search window)
      // or inside a dialog over the task are not meant for the question
      const target = e.target as HTMLElement | null;
      if (e.defaultPrevented || (target && !rootRef.current?.contains(target) && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.closest('[role="dialog"]')))) return;
      const header = currentQuestion?.header;
      const isCustomInputActive = showCustomInputs[header];

      // Don't interfere with typing in custom input (except for Enter and Escape)
      if (
        isCustomInputActive &&
        !["Escape", "Enter"].includes(e.key) &&
        focusedOptionIndex === totalOptions - 1
      ) {
        return;
      }

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setFocusedOptionIndex((prev) => Math.max(0, prev - 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedOptionIndex((prev) => Math.min(totalOptions - 1, prev + 1));
          break;
        case "ArrowLeft":
          if (!isCustomInputActive) {
            e.preventDefault();
            handleGoBack();
          }
          break;
        case "Enter":
          e.preventDefault();
          if (focusedOptionIndex === totalOptions - 1) {
            // "Something else" option
            if (isCustomInputActive) {
              handleCustomInputSubmit();
            } else {
              handleCustomClick();
            }
          } else {
            const option = currentQuestion.options[focusedOptionIndex];
            if (option) {
              handleOptionSelect(option.label);
            }
          }
          break;
        case "Escape":
          e.preventDefault();
          handleSkip();
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          if (!isCustomInputActive) {
            const index = parseInt(e.key) - 1;
            if (index < currentQuestion.options.length) {
              e.preventDefault();
              setFocusedOptionIndex(index);
              handleOptionSelect(currentQuestion.options[index].label);
            }
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentQuestion,
    focusedOptionIndex,
    totalOptions,
    showCustomInputs,
    handleGoBack,
    handleSkip,
    handleOptionSelect,
    handleCustomInputSubmit,
  ]);

  if (!currentQuestion) return null;

  const header = currentQuestion.header;
  const isCustomInputActive = showCustomInputs[header];

  return (
    <div
      ref={rootRef}
      tabIndex={docked ? -1 : undefined}
      role={docked ? "dialog" : undefined}
      aria-label={docked ? `Needs your answer: ${currentQuestion.question}` : undefined}
      className={cn(
        docked
          ? "w-full overflow-hidden rounded-[16px] outline-none"
          : "w-full overflow-hidden rounded-xl border bg-card text-card-foreground",
        className,
      )}
      data-testid="question-card"
    >
      {/* Question Content */}
      <div className="space-y-2.5 px-4 pt-3.5 pb-3">
        {/* Question header with back, question text, progress, and close */}
        <div className="flex items-start gap-2">
          {currentQuestionIndex > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleGoBack}
              className="-ml-1 -my-0.5 text-muted-foreground"
              aria-label="Go back"
            >
              <ChevronLeft />
            </Button>
          )}
          <p className="flex-1 pt-0.5 text-sm font-medium text-foreground">
            {currentQuestion.question}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {totalQuestions > 1 && (
              <span className="text-meta text-muted-foreground tabular-nums">
                {currentQuestionIndex + 1} of {totalQuestions}
              </span>
            )}
            {/* Docked, Skip in the footer (and esc) is the way out; the header holds Stop */}
            {!docked && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleSkip}
                className="-my-0.5 -mr-1 text-muted-foreground"
                aria-label="Skip all"
                title="Skip"
              >
                <X />
              </Button>
            )}
            {onStop && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onStop}
                className="-my-0.5 -mr-1.5 text-muted-foreground"
                title={withChord("Stop the task", "stop")}
                data-testid="prompt-stop"
              >
                <Square className="size-3" fill="currentColor" />
                Stop
              </Button>
            )}
          </div>
        </div>

        <div className="-mx-2 space-y-0.5" role="listbox" aria-label={currentQuestion.question}>
          {currentQuestion.options.map((option, idx) => {
            const isSelected = isOptionSelected(option.label);
            const isFocused = focusedOptionIndex === idx;

            return (
              <button
                key={option.label}
                onClick={() => handleOptionSelect(option.label)}
                role="option"
                aria-selected={isSelected}
                className={`
                  flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50
                  ${isSelected ? "bg-primary/8" : isFocused ? "bg-muted" : "hover:bg-muted/60"}
                `}
              >
                {/* Numbered indicator */}
                <div
                  className={`
                  flex size-6 shrink-0 items-center justify-center rounded-md
                  text-xs font-medium tabular-nums
                  ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground ring-1 ring-inset ring-border"
                  }
                `}
                >
                  {idx + 1}
                </div>

                {/* Option content */}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {option.label}
                  </div>
                  {option.description && (
                    <div className="mt-0.5 text-meta text-muted-foreground">
                      {option.description}
                    </div>
                  )}
                </div>

                {/* Arrow for selected */}
                {isSelected && (
                  <ChevronRight className="size-4 shrink-0 text-primary" />
                )}
              </button>
            );
          })}

          {/* Something else option */}
          {isCustomInputActive ? (
            <div className="w-full rounded-lg bg-primary/8 px-2 py-1.5">
              <div className="flex items-center gap-3">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Pencil className="size-3" />
                </div>
                <Input
                  type="text"
                  value={customValues[header] || ""}
                  onChange={(e) => handleCustomChange(header, e.target.value)}
                  placeholder="Type your answer"
                  className="h-auto flex-1 rounded-none border-none bg-transparent p-0 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0 dark:bg-transparent"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      handleShowCustomInput(header, false);
                      handleSelect(header, "");
                      setFocusedOptionIndex(0);
                    } else if (e.key === "Enter") {
                      e.stopPropagation();
                      handleCustomInputSubmit();
                    }
                  }}
                />
                <Button
                  size="icon-sm"
                  onClick={handleCustomInputSubmit}
                  disabled={!customValues[header]?.trim()}
                  aria-label="Submit answer"
                >
                  <ArrowRight />
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleCustomClick}
              className={`
                flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50
                ${focusedOptionIndex === totalOptions - 1 ? "bg-muted" : "hover:bg-muted/60"}
              `}
            >
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground ring-1 ring-inset ring-border">
                <Pencil className="size-3" />
              </div>
              <span className="text-sm text-muted-foreground">
                Something else
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-4 py-2">
        <div className="flex items-center gap-3 text-meta text-muted-foreground" aria-hidden>
          <span className="flex items-center gap-1"><span className="kbd">↑↓</span> choose</span>
          <span className="flex items-center gap-1"><span className="kbd">⏎</span> select</span>
          <span className="hidden items-center gap-1 sm:flex"><span className="kbd">esc</span> skip</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="text-muted-foreground"
          >
            Skip
          </Button>
          {isMultiSelect && (
            <Button
              size="sm"
              onClick={handleAdvance}
              disabled={!hasCurrentSelection()}
            >
              {isLastQuestion ? "Submit" : "Continue"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
