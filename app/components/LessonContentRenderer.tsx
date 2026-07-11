import type { LessonBlockType } from "@prisma/client";
import type { ReactNode } from "react";

type LessonBlockView = {
  id: string;
  type: LessonBlockType;
  title: string | null;
  content: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getVideoEmbedUrl(url: string) {
  const youtubeMatch =
    url.match(/youtube\.com\/watch\?v=([^&]+)/) ||
    url.match(/youtu\.be\/([^?]+)/);

  if (youtubeMatch?.[1]) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
  }

  return url;
}

function getBlockMeta(type: LessonBlockType) {
  switch (type) {
    case "THEORY":
      return { label: "Теорія", mark: "T", color: "#38bdf8" };
    case "EXAMPLE":
      return { label: "Приклад", mark: "E", color: "#22c55e" };
    case "MATH":
      return { label: "Математика", mark: "∑", color: "#f59e0b" };
    case "CODE":
      return { label: "Код", mark: "</>", color: "#10b981" };
    case "VOCABULARY":
      return { label: "Словник", mark: "Aa", color: "#6366f1" };
    case "VIDEO":
      return { label: "Відео", mark: "▶", color: "#ef4444" };
    case "MINI_TEST":
      return { label: "Міні-тест", mark: "?", color: "#a855f7" };
    case "TASK":
      return { label: "Завдання", mark: "✓", color: "#14b8a6" };
    default:
      return { label: "Акцент", mark: "!", color: "#f97316" };
  }
}

export function LessonContentRenderer({
  blocks,
}: {
  blocks: LessonBlockView[];
}) {
  if (!blocks.length) {
    return (
      <div className="theme-card-highlight rounded-[1.5rem] p-5 text-sm text-[var(--text-soft)]">
        Урок ще порожній.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {blocks.map((block) => (
        <LessonBlock key={block.id} block={block} />
      ))}
    </div>
  );
}

function LessonBlock({ block }: { block: LessonBlockView }) {
  const content = asRecord(block.content);

  if (block.type === "THEORY") {
    return (
      <BlockShell block={block}>
        <p className="theme-text-soft max-w-3xl whitespace-pre-wrap text-base leading-8">
          {asString(content.text)}
        </p>
      </BlockShell>
    );
  }

  if (block.type === "EXAMPLE") {
    const steps = asStringArray(content.steps);

    return (
      <BlockShell block={block}>
        <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--panel-strong)] p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--accent)]">
            Умова
          </div>
          <p className="mt-2 text-xl font-black leading-7">{asString(content.prompt)}</p>
        </div>
        <StepList steps={steps} />
      </BlockShell>
    );
  }

  if (block.type === "MATH") {
    return (
      <BlockShell block={block} accent>
        <div className="rounded-[1.25rem] border border-amber-300/25 bg-amber-300/10 p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">
            Формула
          </div>
          <div className="mt-2 break-words font-mono text-3xl font-black leading-tight text-amber-50">
            {asString(content.formula)}
          </div>
        </div>
        <p className="theme-text-soft text-base leading-7">
          {asString(content.explanation)}
        </p>
        <StepList steps={asStringArray(content.steps)} />
        {asString(content.answer) ? (
          <div className="theme-success-bg rounded-[1.25rem] px-4 py-3 text-sm font-black">
            Відповідь: {asString(content.answer)}
          </div>
        ) : null}
      </BlockShell>
    );
  }

  if (block.type === "CODE") {
    return (
      <BlockShell block={block}>
        <div className="overflow-hidden rounded-[1.25rem] border border-emerald-300/15 bg-black/60">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-emerald-200">
              {asString(content.language) || "code"}
            </span>
            <span className="text-xs text-white/35">read-only</span>
          </div>
          <pre className="overflow-x-auto p-4 text-sm leading-6 text-emerald-100">
          <code>{asString(content.code)}</code>
          </pre>
        </div>
        <p className="theme-text-soft text-sm leading-6">
          {asString(content.explanation)}
        </p>
      </BlockShell>
    );
  }

  if (block.type === "VOCABULARY") {
    const words = Array.isArray(content.words)
      ? content.words.map(asRecord)
      : [];

    return (
      <BlockShell block={block}>
        <div className="grid gap-3 sm:grid-cols-2">
          {words.map((word, index) => (
            <div key={index} className="rounded-[1.25rem] border border-indigo-300/15 bg-indigo-400/10 p-4">
              <div className="text-2xl font-black">{asString(word.term)}</div>
              <div className="mt-1 text-sm font-black text-indigo-200">
                {asString(word.translation)}
              </div>
              <div className="theme-text-soft mt-2 text-sm">
                {asString(word.example)}
              </div>
            </div>
          ))}
        </div>
      </BlockShell>
    );
  }

  if (block.type === "VIDEO") {
    const url = asString(content.url);

    return (
      <BlockShell block={block}>
        <div className="aspect-video overflow-hidden rounded-[1.25rem] border border-red-300/15 bg-black shadow-2xl">
          {url ? (
            <iframe
              src={getVideoEmbedUrl(url)}
              title={block.title ?? "Lesson video"}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : null}
        </div>
        <p className="theme-text-soft text-sm">{asString(content.caption)}</p>
      </BlockShell>
    );
  }

  if (block.type === "MINI_TEST") {
    const questions = Array.isArray(content.questions)
      ? content.questions.map(asRecord)
      : [];

    return (
      <BlockShell block={block}>
        <div className="grid gap-3">
          {questions.map((question, index) => (
            <div key={index} className="rounded-[1.25rem] border border-purple-300/15 bg-purple-400/10 p-4">
              <div className="text-lg font-black">
                {index + 1}. {asString(question.question)}
              </div>
              <div className="mt-3 grid gap-2">
                {asStringArray(question.options).map((option, optionIndex) => (
                  <div
                    key={option}
                    className="grid grid-cols-[auto_1fr] gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-3 text-sm"
                  >
                    <span className="theme-accent-bg flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black">
                      {optionIndex + 1}
                    </span>
                    <span>{option}</span>
                  </div>
                ))}
              </div>
              {asString(question.explanation) ? (
                <div className="theme-success-bg mt-3 rounded-2xl px-3 py-2 text-xs font-bold">
                  {asString(question.explanation)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </BlockShell>
    );
  }

  if (block.type === "TASK") {
    return (
      <BlockShell block={block}>
        <p className="theme-text-soft text-base leading-7">
          {asString(content.instructions)}
        </p>
        <StepList steps={asStringArray(content.checklist)} checkbox />
        {asString(content.submissionHint) ? (
          <div className="theme-accent-bg rounded-[1.25rem] px-4 py-3 text-sm font-black">
            Що здати: {asString(content.submissionHint)}
          </div>
        ) : null}
      </BlockShell>
    );
  }

  return (
    <BlockShell block={block}>
      <p className="theme-text-soft text-sm leading-6">{asString(content.text)}</p>
    </BlockShell>
  );
}

function BlockShell({
  block,
  children,
  accent = false,
}: {
  block: LessonBlockView;
  children: ReactNode;
  accent?: boolean;
}) {
  const meta = getBlockMeta(block.type);

  return (
    <section
      className={[
        "theme-panel relative overflow-hidden rounded-[1.5rem] p-4 sm:p-5",
        accent ? "ring-1 ring-amber-300/20" : "",
      ].join(" ")}
    >
      <div
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: meta.color }}
      />
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="grid grid-cols-[auto_1fr] items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-black"
            style={{
              background: `color-mix(in srgb, ${meta.color} 18%, transparent)`,
              border: `1px solid color-mix(in srgb, ${meta.color} 32%, transparent)`,
              color: meta.color,
            }}
          >
            {meta.mark}
          </div>
          <div>
            <div className="theme-muted text-[10px] font-black uppercase tracking-[0.18em]">
              {meta.label}
            </div>
            {block.title ? (
              <h3 className="mt-1 text-xl font-black">{block.title}</h3>
            ) : null}
          </div>
        </div>
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function StepList({
  steps,
  checkbox = false,
}: {
  steps: string[];
  checkbox?: boolean;
}) {
  if (!steps.length) return null;

  return (
    <div className="grid gap-2">
      {steps.map((step, index) => (
        <div
          key={`${step}-${index}`}
          className="grid grid-cols-[auto_1fr] items-start gap-3 rounded-[1rem] border border-[var(--border)] bg-[var(--card-highlight)] px-3 py-2"
        >
          <div className="theme-accent-bg mt-0.5 flex h-7 w-7 items-center justify-center rounded-xl text-xs font-black">
            {checkbox ? "✓" : index + 1}
          </div>
          <div className="theme-text-soft text-sm leading-6">{step}</div>
        </div>
      ))}
    </div>
  );
}
