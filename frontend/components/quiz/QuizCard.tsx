'use client';

import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export interface QuizQuestionItem {
  question_number: number;
  question_text: string;
  options: { key: string; text: string }[];
}

interface QuizCardProps {
  question: QuizQuestionItem;
  selectedOption?: string;
  onSelectOption: (optionKey: string) => void;
}

export default function QuizCard({
  question,
  selectedOption,
  onSelectOption,
}: QuizCardProps) {
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-6 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-7 h-7 rounded-lg bg-brand-100 text-brand-700 font-bold text-xs flex items-center justify-center">
          {question.question_number}
        </span>
        <h4 className="text-base font-medium text-stone-800 leading-snug">
          {question.question_text}
        </h4>
      </div>

      <div className="grid grid-cols-1 gap-2.5 pt-2">
        {question.options.map((opt) => {
          const isSelected = selectedOption === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onSelectOption(opt.key)}
              className={`w-full flex items-center justify-between p-3.5 rounded-lg border text-left text-sm transition ${
                isSelected
                  ? 'border-brand-600 bg-brand-50/70 text-brand-900 font-medium'
                  : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50 text-stone-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-semibold ${
                    isSelected
                      ? 'bg-brand-600 text-white'
                      : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  {opt.key}
                </span>
                <span>{opt.text}</span>
              </div>
              {isSelected && <CheckCircle2 className="w-4 h-4 text-brand-600" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
