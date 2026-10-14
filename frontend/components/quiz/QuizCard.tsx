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
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">
          {question.question_number}
        </span>
        <h4 className="text-base font-medium text-slate-800 leading-snug">
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
              className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left text-sm transition ${
                isSelected
                  ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 font-medium'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-semibold ${
                    isSelected
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {opt.key}
                </span>
                <span>{opt.text}</span>
              </div>
              {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
