import type { LessonBlockType, Prisma } from "@prisma/client";
import { prisma } from "~/lib/db.server";

export type SchoolSetupError = {
  title: string;
  description: string;
  commands: string[];
};

export const DEFAULT_SUBJECTS = [
  {
    slug: "informatics",
    name: "Інформатика",
    description: "Алгоритми, код, цифрова грамотність і практичні задачі.",
    color: "#38bdf8",
    icon: "code",
    order: 1,
  },
  {
    slug: "mathematics",
    name: "Математика",
    description: "Формули, приклади, пояснення крок за кроком і практика.",
    color: "#f59e0b",
    icon: "sigma",
    order: 2,
  },
  {
    slug: "english",
    name: "Англійська",
    description: "Лексика, граматика, діалоги, аудіювання і speaking prompts.",
    color: "#22c55e",
    icon: "language",
    order: 3,
  },
  {
    slug: "ukrainian",
    name: "Українська",
    description: "Мова, література, правила, тексти й творчі завдання.",
    color: "#6366f1",
    icon: "book",
    order: 4,
  },
];

export type SchoolBlockTemplate = {
  type: LessonBlockType;
  label: string;
  description: string;
  defaultTitle: string;
  defaultContent: Prisma.InputJsonObject;
};

export const LESSON_BLOCK_TEMPLATES: SchoolBlockTemplate[] = [
  {
    type: "THEORY",
    label: "Теорія",
    description: "Пояснення теми, правила, визначення, короткий конспект.",
    defaultTitle: "Теорія",
    defaultContent: {
      text: "Поясни головну ідею уроку простими словами.",
    },
  },
  {
    type: "EXAMPLE",
    label: "Приклад",
    description: "Покроковий розбір задачі або мовного прикладу.",
    defaultTitle: "Приклад",
    defaultContent: {
      prompt: "Умова прикладу",
      steps: ["Крок 1", "Крок 2", "Відповідь"],
    },
  },
  {
    type: "MATH",
    label: "Математика",
    description: "Формула, умова, розв'язання й відповідь.",
    defaultTitle: "Математичний приклад",
    defaultContent: {
      formula: "a^2 + b^2 = c^2",
      explanation: "Пояснення формули або методу.",
      steps: ["Записуємо дані", "Підставляємо у формулу", "Обчислюємо"],
      answer: "Відповідь",
    },
  },
  {
    type: "CODE",
    label: "Код",
    description: "Фрагмент коду з поясненням для інформатики.",
    defaultTitle: "Код-приклад",
    defaultContent: {
      language: "javascript",
      code: "console.log('Hello, school!');",
      explanation: "Поясни, що робить цей код.",
    },
  },
  {
    type: "VOCABULARY",
    label: "Словник",
    description: "Слова, переклад, приклади речень для мов.",
    defaultTitle: "Нові слова",
    defaultContent: {
      words: [
        {
          term: "lesson",
          translation: "урок",
          example: "This lesson is useful.",
        },
      ],
    },
  },
  {
    type: "VIDEO",
    label: "Відео",
    description: "YouTube/Vimeo/embed-посилання і короткий опис.",
    defaultTitle: "Відео до уроку",
    defaultContent: {
      url: "https://www.youtube.com/watch?v=",
      caption: "Що подивитися у відео.",
    },
  },
  {
    type: "MINI_TEST",
    label: "Міні-тест",
    description: "Кілька питань одразу після теорії.",
    defaultTitle: "Перевір себе",
    defaultContent: {
      questions: [
        {
          question: "Питання",
          options: ["Варіант A", "Варіант B", "Варіант C"],
          correctIndex: 0,
          explanation: "Чому ця відповідь правильна.",
        },
      ],
    },
  },
  {
    type: "TASK",
    label: "Завдання",
    description: "Домашня або класна робота з критеріями виконання.",
    defaultTitle: "Завдання",
    defaultContent: {
      instructions: "Що потрібно зробити учню.",
      checklist: ["Зробити перший крок", "Перевірити відповідь"],
      submissionHint: "Що здати вчителю.",
    },
  },
  {
    type: "CALLOUT",
    label: "Акцент",
    description: "Важлива думка, попередження, лайфхак або підказка.",
    defaultTitle: "Запам'ятай",
    defaultContent: {
      tone: "info",
      text: "Коротка важлива думка.",
    },
  },
];

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9а-яіїєґ]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

export function isSchoolPrismaReady() {
  const client = prisma as typeof prisma & {
    courseSubject?: unknown;
    courseTopic?: unknown;
    courseLesson?: unknown;
    courseLessonBlock?: unknown;
  };

  return Boolean(
    client.courseSubject &&
      client.courseTopic &&
      client.courseLesson &&
      client.courseLessonBlock
  );
}

export function getSchoolClientSetupError(): SchoolSetupError {
  return {
    title: "Prisma client ще не бачить конструктор курсів",
    description:
      "Схема вже має предмети, теми, уроки і блоки, але локальний Prisma client згенерований до цих моделей. Через це кабінет вчителя не може стартувати.",
    commands: ["npx prisma generate", "npm run dev"],
  };
}

export function getSchoolDatabaseSetupError(error: unknown): SchoolSetupError | null {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("coursesubject") ||
    normalized.includes("course_subjects") ||
    normalized.includes("coursetopic") ||
    normalized.includes("course_topics") ||
    normalized.includes("courselesson") ||
    normalized.includes("course_lessons") ||
    normalized.includes("courselessonblock") ||
    normalized.includes("course_lesson_blocks") ||
    normalized.includes("does not exist") ||
    normalized.includes("table") ||
    normalized.includes("relation")
  ) {
    return {
      title: "База ще не має таблиць для конструктора",
      description:
        "Код кабінету готовий, але міграції для предметів, тем, уроків і блоків ще не застосовані до бази.",
      commands: ["npx prisma migrate dev", "npx prisma generate", "npm run dev"],
    };
  }

  return null;
}

export async function ensureDefaultSubjects() {
  await Promise.all(
    DEFAULT_SUBJECTS.map((subject) =>
      prisma.courseSubject.upsert({
        where: { slug: subject.slug },
        update: subject,
        create: subject,
      })
    )
  );
}

export async function getTeacherCourses(userId: string) {
  await ensureDefaultSubjects();

  return prisma.course.findMany({
    where: { teacherId: userId },
    include: {
      subject: true,
      topics: {
        include: {
          lessons: {
            include: {
              blocks: {
                orderBy: { order: "asc" },
              },
            },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { order: "asc" },
      },
      accesses: {
        select: { id: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createTeacherCourse({
  userId,
  subjectId,
  title,
  subtitle,
}: {
  userId: string;
  subjectId: string;
  title: string;
  subtitle?: string | null;
}) {
  const baseSlug = slugify(title) || "course";
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  return prisma.course.create({
    data: {
      teacherId: userId,
      subjectId,
      slug,
      title,
      subtitle,
      description: subtitle,
      priceCents: 0,
      currency: "UAH",
      isPublished: false,
    },
  });
}

export async function createCourseTopic({
  courseId,
  title,
  description,
}: {
  courseId: string;
  title: string;
  description?: string | null;
}) {
  const lastTopic = await prisma.courseTopic.findFirst({
    where: { courseId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  return prisma.courseTopic.create({
    data: {
      courseId,
      title,
      description,
      order: (lastTopic?.order ?? -1) + 1,
    },
  });
}

export async function createTopicLesson({
  topicId,
  title,
  summary,
}: {
  topicId: string;
  title: string;
  summary?: string | null;
}) {
  const lastLesson = await prisma.courseLesson.findFirst({
    where: { topicId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  return prisma.courseLesson.create({
    data: {
      topicId,
      title,
      summary,
      order: (lastLesson?.order ?? -1) + 1,
    },
  });
}

export async function addLessonBlock({
  lessonId,
  type,
}: {
  lessonId: string;
  type: LessonBlockType;
}) {
  const template =
    LESSON_BLOCK_TEMPLATES.find((item) => item.type === type) ??
    LESSON_BLOCK_TEMPLATES[0];

  const lastBlock = await prisma.courseLessonBlock.findFirst({
    where: { lessonId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  return prisma.courseLessonBlock.create({
    data: {
      lessonId,
      type,
      title: template.defaultTitle,
      content: template.defaultContent,
      order: (lastBlock?.order ?? -1) + 1,
    },
  });
}

export async function updateLessonBlock({
  blockId,
  title,
  content,
}: {
  blockId: string;
  title?: string | null;
  content: Prisma.InputJsonObject;
}) {
  return prisma.courseLessonBlock.update({
    where: { id: blockId },
    data: {
      title,
      content,
    },
  });
}
