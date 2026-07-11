import {
  Form,
  Link,
  data,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import type { LessonBlockType, Prisma } from "@prisma/client";
import { LessonContentRenderer } from "~/components/LessonContentRenderer";
import { requireUser } from "~/lib/auth.server";
import { prisma } from "~/lib/db.server";
import {
  LESSON_BLOCK_TEMPLATES,
  addLessonBlock,
  createCourseTopic,
  createTeacherCourse,
  createTopicLesson,
  ensureDefaultSubjects,
  getSchoolClientSetupError,
  getSchoolDatabaseSetupError,
  getTeacherCourses,
  isSchoolPrismaReady,
  updateLessonBlock,
} from "~/lib/school.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const selectedCourseId = url.searchParams.get("course");
  const selectedLessonId = url.searchParams.get("lesson");

  if (!isSchoolPrismaReady()) {
    return data({
      setupError: getSchoolClientSetupError(),
      user: {
        id: user.id,
        name: user.displayName || user.name || user.email || "Вчитель",
      },
      subjects: [],
      courses: [],
      selectedCourseId,
      selectedLessonId,
      blockTemplates: LESSON_BLOCK_TEMPLATES,
    });
  }

  try {
    await ensureDefaultSubjects();

    const [subjects, courses] = await Promise.all([
      prisma.courseSubject.findMany({
        orderBy: [{ order: "asc" }, { name: "asc" }],
      }),
      getTeacherCourses(user.id),
    ]);

    return data({
      setupError: null,
      user: {
        id: user.id,
        name: user.displayName || user.name || user.email || "Вчитель",
      },
      subjects,
      courses,
      selectedCourseId,
      selectedLessonId,
      blockTemplates: LESSON_BLOCK_TEMPLATES,
    });
  } catch (error) {
    const setupError = getSchoolDatabaseSetupError(error);

    if (setupError) {
      return data({
        setupError,
        user: {
          id: user.id,
          name: user.displayName || user.name || user.email || "Вчитель",
        },
        subjects: [],
        courses: [],
        selectedCourseId,
        selectedLessonId,
        blockTemplates: LESSON_BLOCK_TEMPLATES,
      });
    }

    throw error;
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (!isSchoolPrismaReady()) {
    return data(
      {
        ok: false,
        error: "Prisma client ще не згенерований для конструктора курсів. Запусти npx prisma generate.",
      },
      { status: 503 }
    );
  }

  try {
    await ensureDefaultSubjects();
  } catch (error) {
    const setupError = getSchoolDatabaseSetupError(error);

    if (setupError) {
      return data(
        {
          ok: false,
          error: `${setupError.title}. Спочатку запусти: ${setupError.commands.join(" -> ")}.`,
        },
        { status: 503 }
      );
    }

    throw error;
  }

  if (intent === "create-subject") {
    const name = String(formData.get("name") || "").trim();
    const slug = String(formData.get("slug") || "")
      .trim()
      .toLowerCase();

    if (!name || !slug) {
      return data({ ok: false, error: "Назва і slug предмету обов'язкові." }, { status: 400 });
    }

    await prisma.courseSubject.upsert({
      where: { slug },
      update: {
        name,
        description: String(formData.get("description") || "").trim() || null,
        color: String(formData.get("color") || "").trim() || null,
      },
      create: {
        name,
        slug,
        description: String(formData.get("description") || "").trim() || null,
        color: String(formData.get("color") || "").trim() || null,
      },
    });

    return data({ ok: true, message: "Предмет створено." });
  }

  if (intent === "create-course") {
    const title = String(formData.get("title") || "").trim();
    const subjectId = String(formData.get("subjectId") || "");

    if (!title || !subjectId) {
      return data({ ok: false, error: "Назва курсу і предмет обов'язкові." }, { status: 400 });
    }

    const course = await createTeacherCourse({
      userId: user.id,
      subjectId,
      title,
      subtitle: String(formData.get("subtitle") || "").trim() || null,
    });

    throw redirect(`/teacher/courses?course=${course.id}`);
  }

  if (intent === "create-topic") {
    const courseId = String(formData.get("courseId") || "");
    const title = String(formData.get("title") || "").trim();

    if (!courseId || !title) {
      return data({ ok: false, error: "Обери курс і введи назву теми." }, { status: 400 });
    }

    await assertCourseOwner(courseId, user.id);
    await createCourseTopic({
      courseId,
      title,
      description: String(formData.get("description") || "").trim() || null,
    });

    return data({ ok: true, message: "Тему створено." });
  }

  if (intent === "create-lesson") {
    const topicId = String(formData.get("topicId") || "");
    const title = String(formData.get("title") || "").trim();

    if (!topicId || !title) {
      return data({ ok: false, error: "Обери тему і введи назву уроку." }, { status: 400 });
    }

    await assertTopicOwner(topicId, user.id);
    await createTopicLesson({
      topicId,
      title,
      summary: String(formData.get("summary") || "").trim() || null,
    });

    return data({ ok: true, message: "Урок створено." });
  }

  if (intent === "add-block") {
    const lessonId = String(formData.get("lessonId") || "");
    const type = String(formData.get("type") || "") as LessonBlockType;

    if (!lessonId || !type) {
      return data({ ok: false, error: "Обери урок і тип блоку." }, { status: 400 });
    }

    await assertLessonOwner(lessonId, user.id);
    await addLessonBlock({ lessonId, type });

    return data({ ok: true, message: "Блок додано." });
  }

  if (intent === "update-block") {
    const blockId = String(formData.get("blockId") || "");
    const contentRaw = String(formData.get("content") || "{}");

    if (!blockId) {
      return data({ ok: false, error: "Блок не знайдено." }, { status: 400 });
    }

    await assertBlockOwner(blockId, user.id);

    let content: Prisma.InputJsonObject;

    try {
      const parsed = JSON.parse(contentRaw);

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return data({ ok: false, error: "JSON контенту має бути об'єктом." }, { status: 400 });
      }

      content = parsed as Prisma.InputJsonObject;
    } catch {
      return data({ ok: false, error: "JSON контенту невалідний." }, { status: 400 });
    }

    await updateLessonBlock({
      blockId,
      title: String(formData.get("title") || "").trim() || null,
      content,
    });

    return data({ ok: true, message: "Блок оновлено." });
  }

  if (intent === "toggle-lesson-published") {
    const lessonId = String(formData.get("lessonId") || "");
    await assertLessonOwner(lessonId, user.id);

    const lesson = await prisma.courseLesson.findUnique({
      where: { id: lessonId },
      select: { isPublished: true },
    });

    await prisma.courseLesson.update({
      where: { id: lessonId },
      data: { isPublished: !lesson?.isPublished },
    });

    return data({ ok: true, message: "Статус уроку оновлено." });
  }

  return data({ ok: false, error: "Невідома дія." }, { status: 400 });
}

async function assertCourseOwner(courseId: string, userId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId: userId },
    select: { id: true },
  });

  if (!course) throw new Response("Course not found", { status: 404 });
}

async function assertTopicOwner(topicId: string, userId: string) {
  const topic = await prisma.courseTopic.findFirst({
    where: { id: topicId, course: { teacherId: userId } },
    select: { id: true },
  });

  if (!topic) throw new Response("Topic not found", { status: 404 });
}

async function assertLessonOwner(lessonId: string, userId: string) {
  const lesson = await prisma.courseLesson.findFirst({
    where: { id: lessonId, topic: { course: { teacherId: userId } } },
    select: { id: true },
  });

  if (!lesson) throw new Response("Lesson not found", { status: 404 });
}

async function assertBlockOwner(blockId: string, userId: string) {
  const block = await prisma.courseLessonBlock.findFirst({
    where: {
      id: blockId,
      lesson: { topic: { course: { teacherId: userId } } },
    },
    select: { id: true },
  });

  if (!block) throw new Response("Block not found", { status: 404 });
}

export default function TeacherCoursesPage() {
  const {
    setupError,
    subjects,
    courses,
    selectedCourseId,
    selectedLessonId,
    blockTemplates,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  if (setupError) {
    return <TeacherSetupPanel setupError={setupError} />;
  }

  const selectedCourse =
    courses.find((course) => course.id === selectedCourseId) ?? courses[0] ?? null;
  const allLessons = selectedCourse?.topics.flatMap((topic) => topic.lessons) ?? [];
  const selectedLesson =
    allLessons.find((lesson) => lesson.id === selectedLessonId) ??
    allLessons[0] ??
    null;

  return (
    <main className="theme-page min-h-screen px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto grid max-w-7xl gap-4 xl:grid-cols-[330px_1fr]">
        <aside className="grid gap-4">
          <section className="theme-panel rounded-[1.5rem] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="theme-muted text-[10px] font-black uppercase tracking-[0.18em]">
                  Teacher studio
                </div>
                <h1 className="text-2xl font-black">Конструктор курсів</h1>
              </div>
              <Link to="/courses" className="theme-button rounded-2xl px-3 py-2 text-xs font-black">
                Каталог
              </Link>
            </div>

            {actionData?.message ? (
              <div className="theme-success-bg mb-3 rounded-2xl px-3 py-2 text-sm font-bold">
                {actionData.message}
              </div>
            ) : null}
            {actionData?.error ? (
              <div className="theme-danger-bg mb-3 rounded-2xl px-3 py-2 text-sm font-bold">
                {actionData.error}
              </div>
            ) : null}

            <Form method="post" className="grid gap-2">
              <input type="hidden" name="intent" value="create-course" />
              <input
                name="title"
                placeholder="Назва нового курсу"
                className="theme-card-highlight rounded-2xl px-4 py-3 text-sm outline-none"
              />
              <input
                name="subtitle"
                placeholder="Короткий опис"
                className="theme-card-highlight rounded-2xl px-4 py-3 text-sm outline-none"
              />
              <select
                name="subjectId"
                className="theme-card-highlight rounded-2xl px-4 py-3 text-sm outline-none"
              >
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
              <button
                disabled={isSubmitting}
                className="theme-primary-button rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-60"
              >
                Створити курс
              </button>
            </Form>
          </section>

          <section className="theme-panel rounded-[1.5rem] p-4">
            <div className="mb-3 text-sm font-black">Предмети школи</div>
            <div className="grid gap-2">
              {subjects.map((subject) => (
                <div
                  key={subject.id}
                  className="theme-card-highlight rounded-2xl px-3 py-2"
                >
                  <div className="font-black">{subject.name}</div>
                  <div className="theme-muted text-xs">{subject.description}</div>
                </div>
              ))}
            </div>
            <Form method="post" className="mt-3 grid gap-2">
              <input type="hidden" name="intent" value="create-subject" />
              <input name="name" placeholder="Новий предмет" className="theme-card-highlight rounded-2xl px-3 py-2 text-sm outline-none" />
              <input name="slug" placeholder="slug, напр. biology" className="theme-card-highlight rounded-2xl px-3 py-2 text-sm outline-none" />
              <input name="description" placeholder="Опис предмету" className="theme-card-highlight rounded-2xl px-3 py-2 text-sm outline-none" />
              <button className="theme-button rounded-2xl px-3 py-2 text-sm font-black">
                Додати предмет
              </button>
            </Form>
          </section>
        </aside>

        <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="theme-panel rounded-[1.5rem] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black">Структура</h2>
              <span className="theme-accent-bg rounded-full px-3 py-1 text-xs font-black">
                {courses.length}
              </span>
            </div>

            <div className="grid gap-3">
              {courses.map((course) => (
                <CourseTree
                  key={course.id}
                  course={course}
                  selectedCourseId={selectedCourse?.id ?? null}
                  selectedLessonId={selectedLesson?.id ?? null}
                />
              ))}
              {!courses.length ? (
                <div className="theme-card-highlight rounded-2xl p-4 text-sm text-[var(--text-soft)]">
                  Створи перший курс зліва.
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4">
            {selectedCourse ? (
              <BuilderPanel
                course={selectedCourse}
                selectedLesson={selectedLesson}
                blockTemplates={blockTemplates}
                isSubmitting={isSubmitting}
              />
            ) : (
              <section className="theme-panel rounded-[1.5rem] p-6">
                <h2 className="text-2xl font-black">Почни з курсу</h2>
                <p className="theme-text-soft mt-2 text-sm leading-6">
                  Після створення курсу тут з'являться теми, уроки і блоки
                  контенту.
                </p>
              </section>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function TeacherSetupPanel({
  setupError,
}: {
  setupError: {
    title: string;
    description: string;
    commands: string[];
  };
}) {
  return (
    <main className="theme-page min-h-screen px-4 py-6 sm:px-6 sm:py-10">
      <section className="theme-panel mx-auto max-w-3xl rounded-[1.5rem] p-5 sm:p-7">
        <div className="theme-muted text-[10px] font-black uppercase tracking-[0.18em]">
          Teacher studio
        </div>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">
          {setupError.title}
        </h1>
        <p className="theme-text-soft mt-3 text-sm leading-6">
          {setupError.description}
        </p>

        <div className="mt-5 grid gap-2">
          {setupError.commands.map((command) => (
            <code
              key={command}
              className="theme-card-highlight rounded-2xl px-4 py-3 text-sm font-black"
            >
              {command}
            </code>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/courses" className="theme-button rounded-2xl px-4 py-3 text-sm font-black">
            До курсів
          </Link>
          <Link to="/" className="theme-button rounded-2xl px-4 py-3 text-sm font-black">
            На головну
          </Link>
        </div>
      </section>
    </main>
  );
}

function CourseTree({
  course,
  selectedCourseId,
  selectedLessonId,
}: {
  course: any;
  selectedCourseId: string | null;
  selectedLessonId: string | null;
}) {
  const isActiveCourse = course.id === selectedCourseId;

  return (
    <div
      className={[
        "theme-card-highlight rounded-[1.25rem] p-3",
        isActiveCourse ? "ring-1 ring-[var(--accent)]/35" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="theme-muted text-[10px] font-black uppercase tracking-[0.14em]">
            {course.subject?.name ?? "Курс"}
          </div>
          <div className="font-black">{course.title}</div>
          <div className="theme-muted text-xs">
            {course.topics.length} тем ·{" "}
            {course.topics.reduce((sum: number, topic: any) => sum + topic.lessons.length, 0)} уроків
          </div>
        </div>
        <div className="flex gap-1">
          <Link to={`?course=${course.id}`} className="theme-button rounded-xl px-2 py-1 text-xs font-black">
            Edit
          </Link>
          <Link to={`/courses/${course.id}`} className="theme-button rounded-xl px-2 py-1 text-xs font-black">
            View
          </Link>
        </div>
      </div>

      <Form method="post" className="mt-3 grid gap-2">
        <input type="hidden" name="intent" value="create-topic" />
        <input type="hidden" name="courseId" value={course.id} />
        <input name="title" placeholder="Нова тема" className="theme-card-highlight rounded-xl px-3 py-2 text-sm outline-none" />
        <button className="theme-button rounded-xl px-3 py-2 text-xs font-black">
          + Тема
        </button>
      </Form>

      <div className="mt-3 grid gap-2">
        {course.topics.map((topic: any) => (
          <div key={topic.id} className="rounded-2xl border border-[var(--border)] p-3">
            <div className="font-black">{topic.title}</div>
            <Form method="post" className="mt-2 grid gap-2">
              <input type="hidden" name="intent" value="create-lesson" />
              <input type="hidden" name="topicId" value={topic.id} />
              <input name="title" placeholder="Новий урок" className="theme-card-highlight rounded-xl px-3 py-2 text-sm outline-none" />
              <button className="theme-button rounded-xl px-3 py-2 text-xs font-black">
                + Урок
              </button>
            </Form>
            <div className="mt-2 grid gap-1">
              {topic.lessons.map((lesson: any) => (
                <Link
                  key={lesson.id}
                  to={`?course=${course.id}&lesson=${lesson.id}`}
                  className={[
                    "theme-card-highlight rounded-xl px-3 py-2 text-xs",
                    lesson.id === selectedLessonId
                      ? "ring-1 ring-[var(--accent)]/35"
                      : "",
                  ].join(" ")}
                >
                  <div className="font-black">{lesson.title}</div>
                  <div className="theme-muted">
                    {lesson.blocks.length} блоків · {lesson.isPublished ? "published" : "draft"}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BuilderPanel({
  course,
  selectedLesson,
  blockTemplates,
  isSubmitting,
}: {
  course: any;
  selectedLesson: any;
  blockTemplates: Array<{
    type: LessonBlockType;
    label: string;
    description: string;
  }>;
  isSubmitting: boolean;
}) {
  return (
    <>
      <section className="theme-panel rounded-[1.5rem] p-4">
        <div className="theme-muted text-[10px] font-black uppercase tracking-[0.18em]">
          Активний курс
        </div>
        <h2 className="mt-1 text-2xl font-black">{course.title}</h2>
        <p className="theme-text-soft mt-2 text-sm leading-6">
          {course.subtitle || "Додай теми, уроки і блоки контенту."}
        </p>
      </section>

      {selectedLesson ? (
        <section className="theme-panel rounded-[1.5rem] p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="theme-muted text-[10px] font-black uppercase tracking-[0.18em]">
                Lesson builder
              </div>
              <h3 className="text-xl font-black">{selectedLesson.title}</h3>
            </div>
            <Form method="post">
              <input type="hidden" name="intent" value="toggle-lesson-published" />
              <input type="hidden" name="lessonId" value={selectedLesson.id} />
              <button className="theme-button rounded-2xl px-4 py-2 text-sm font-black">
                {selectedLesson.isPublished ? "Зняти з публікації" : "Опублікувати"}
              </button>
            </Form>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            {blockTemplates.map((template) => (
              <Form key={template.type} method="post">
                <input type="hidden" name="intent" value="add-block" />
                <input type="hidden" name="lessonId" value={selectedLesson.id} />
                <input type="hidden" name="type" value={template.type} />
                <button
                  disabled={isSubmitting}
                  className="theme-card-highlight h-full w-full rounded-[1.1rem] p-3 text-left transition hover:bg-[var(--panel-strong)] disabled:opacity-60"
                >
                  <div className="font-black">{template.label}</div>
                  <div className="theme-muted mt-1 text-xs leading-5">
                    {template.description}
                  </div>
                </button>
              </Form>
            ))}
          </div>
        </section>
      ) : null}

      {selectedLesson ? (
        <section className="grid gap-4">
          <LessonContentRenderer blocks={selectedLesson.blocks} />
          {selectedLesson.blocks.map((block: any) => (
            <Form
              key={block.id}
              method="post"
              className="theme-panel rounded-[1.5rem] p-4"
            >
              <input type="hidden" name="intent" value="update-block" />
              <input type="hidden" name="blockId" value={block.id} />
              <div className="grid gap-3">
                <input
                  name="title"
                  defaultValue={block.title ?? ""}
                  className="theme-card-highlight rounded-2xl px-4 py-3 text-sm font-bold outline-none"
                />
                <textarea
                  name="content"
                  rows={9}
                  defaultValue={JSON.stringify(block.content, null, 2)}
                  className="theme-card-highlight font-mono resize-y rounded-2xl px-4 py-3 text-xs leading-5 outline-none"
                />
                <button className="theme-primary-button rounded-2xl px-4 py-3 text-sm font-black">
                  Зберегти блок
                </button>
              </div>
            </Form>
          ))}
        </section>
      ) : null}
    </>
  );
}
