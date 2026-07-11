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
import { LessonContentRenderer } from "~/components/LessonContentRenderer";
import { getCurrentUser } from "~/lib/auth.server";
import { buyCourseForUser } from "~/lib/courses.server";
import { prisma } from "~/lib/db.server";

function formatPrice(priceCents: number, currency: string) {
  if (priceCents <= 0) return "Безкоштовно";

  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const url = new URL(request.url);
  const selectedLessonId = url.searchParams.get("lesson");
  const courseId = params.courseId;

  if (!courseId) {
    throw new Response("Course not found", { status: 404 });
  }

  const course = await prisma.course.findFirst({
    where: {
      OR: [{ id: courseId }, { slug: courseId }],
    },
    include: {
      subject: true,
      teacher: {
        select: {
          name: true,
          displayName: true,
          email: true,
          image: true,
        },
      },
      accesses: currentUser
        ? {
            where: {
              userId: currentUser.id,
              revokedAt: null,
            },
            select: { id: true },
          }
        : {
            where: {
              userId: "__anonymous__",
              revokedAt: null,
            },
            select: { id: true },
          },
      topics: {
        include: {
          lessons: {
            where: currentUser ? {} : { isPublished: true },
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
    },
  });

  if (!course) {
    throw new Response("Course not found", { status: 404 });
  }

  const isOwned = currentUser ? course.accesses.length > 0 : false;
  const isFree = course.priceCents <= 0;
  const canViewLessons = isOwned || isFree;
  const lessons = course.topics.flatMap((topic) => topic.lessons);
  const selectedLesson =
    lessons.find((lesson) => lesson.id === selectedLessonId) ??
    lessons[0] ??
    null;
  const publishedLessonsCount = lessons.filter((lesson) => lesson.isPublished).length;
  const blocksCount = lessons.reduce((sum, lesson) => sum + lesson.blocks.length, 0);

  return data({
    currentUser: currentUser
      ? {
          id: currentUser.id,
          name: currentUser.displayName || currentUser.name || currentUser.email,
        }
      : null,
    course,
    isOwned,
    isFree,
    canViewLessons,
    selectedLesson,
    stats: {
      topicsCount: course.topics.length,
      lessonsCount: lessons.length,
      publishedLessonsCount,
      blocksCount,
    },
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    throw redirect("/login");
  }

  const courseId = params.courseId;
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (!courseId || intent !== "buy-course") {
    return data({ ok: false, error: "Курс не знайдено." }, { status: 400 });
  }

  const course = await prisma.course.findFirst({
    where: {
      OR: [{ id: courseId }, { slug: courseId }],
    },
    select: { id: true },
  });

  if (!course) {
    return data({ ok: false, error: "Курс не знайдено." }, { status: 404 });
  }

  const result = await buyCourseForUser({
    userId: currentUser.id,
    courseId: course.id,
  });

  return data({
    ok: true,
    message: result.alreadyOwned
      ? "Курс уже є у тебе."
      : "Доступ до курсу відкрито.",
  });
}

export default function CourseDetailsPage() {
  const { course, canViewLessons, isOwned, isFree, selectedLesson, stats } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const subjectColor = course.subject?.color || "var(--accent)";
  const teacherName =
    course.teacher?.displayName ||
    course.teacher?.name ||
    course.teacher?.email ||
    "Вчитель";

  return (
    <main className="theme-page min-h-screen px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <section
          className="relative overflow-hidden rounded-[2rem] border border-[var(--border-strong)] bg-[var(--panel-strong)] p-5 shadow-2xl sm:p-7"
          style={{
            boxShadow: `0 24px 70px color-mix(in srgb, ${subjectColor} 16%, transparent)`,
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-1.5"
            style={{ background: subjectColor }}
          />

          <div className="relative grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to="/courses"
                  className="theme-button inline-flex rounded-2xl px-3 py-2 text-xs font-black"
                >
                  Назад
                </Link>
                <span
                  className="inline-flex rounded-2xl px-3 py-2 text-xs font-black uppercase tracking-[0.14em]"
                  style={{
                    background: `color-mix(in srgb, ${subjectColor} 18%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${subjectColor} 34%, transparent)`,
                    color: subjectColor,
                  }}
                >
                  {course.subject?.name ?? "Курс"}
                </span>
                {isOwned ? (
                  <span className="theme-success-bg rounded-2xl px-3 py-2 text-xs font-black">
                    Доступ відкрито
                  </span>
                ) : null}
              </div>

              <h1 className="mt-5 max-w-4xl text-4xl font-black leading-[1.02] tracking-tight sm:text-6xl">
                {course.title}
              </h1>

              {course.subtitle ? (
                <p className="theme-text-soft mt-4 max-w-2xl text-base leading-7 sm:text-lg">
                  {course.subtitle}
                </p>
              ) : null}

              <div className="mt-6 grid gap-2 sm:grid-cols-4">
                <CourseMetric label="теми" value={stats.topicsCount} />
                <CourseMetric label="уроки" value={stats.lessonsCount} />
                <CourseMetric label="готові" value={stats.publishedLessonsCount} />
                <CourseMetric label="блоки" value={stats.blocksCount} />
              </div>
            </div>

            <div className="theme-panel rounded-[1.5rem] p-4">
              <div className="theme-muted text-[10px] font-black uppercase tracking-[0.18em]">
                Навчальний маршрут
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-black"
                  style={{
                    background: `color-mix(in srgb, ${subjectColor} 20%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${subjectColor} 32%, transparent)`,
                    color: subjectColor,
                  }}
                >
                  {(course.subject?.name || course.title).slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-lg font-black">{teacherName}</div>
                  <div className="theme-text-soft text-sm">
                    {formatPrice(course.priceCents, course.currency)}
                  </div>
                </div>
              </div>

              {!canViewLessons ? (
                <Form method="post" className="mt-4">
                  <input type="hidden" name="intent" value="buy-course" />
                  <button
                    disabled={isSubmitting}
                    className="theme-primary-button w-full rounded-2xl px-5 py-3 text-sm font-black disabled:opacity-60"
                  >
                    {isSubmitting ? "Відкриваю..." : "Купити курс"}
                  </button>
                </Form>
              ) : (
                <Link
                  to={
                    selectedLesson
                      ? `/courses/${course.id}?lesson=${selectedLesson.id}`
                      : `/courses/${course.id}`
                  }
                  className="theme-primary-button mt-4 inline-flex w-full justify-center rounded-2xl px-5 py-3 text-sm font-black"
                >
                  Продовжити навчання
                </Link>
              )}

              {isFree && !isOwned ? (
                <div className="theme-success-bg mt-4 rounded-2xl px-3 py-2 text-xs font-bold">
                  Безкоштовний курс відкритий для перегляду.
                </div>
              ) : null}

              {actionData?.message ? (
                <div className="theme-success-bg mt-4 rounded-2xl px-3 py-2 text-sm font-bold">
                  {actionData.message}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <aside className="grid content-start gap-4 lg:sticky lg:top-4">
            <section className="theme-panel rounded-[1.5rem] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="theme-muted text-[10px] font-black uppercase tracking-[0.18em]">
                    Програма
                  </div>
                  <h2 className="text-xl font-black">Теми й уроки</h2>
                </div>
                <span className="theme-accent-bg rounded-full px-3 py-1 text-xs font-black">
                  {stats.lessonsCount}
                </span>
              </div>

              <div className="grid gap-3">
                {course.topics.map((topic, topicIndex) => (
                  <TopicOutline
                    key={topic.id}
                    courseId={course.id}
                    topic={topic}
                    topicIndex={topicIndex}
                    selectedLessonId={selectedLesson?.id ?? null}
                    canViewLessons={canViewLessons}
                    subjectColor={subjectColor}
                  />
                ))}
              </div>
            </section>
          </aside>

          <section className="grid gap-4">
            {!canViewLessons ? (
              <LockedCoursePanel />
            ) : selectedLesson ? (
              <LessonView lesson={selectedLesson} subjectColor={subjectColor} />
            ) : (
              <div className="theme-panel rounded-[1.5rem] p-6">
                <h2 className="text-2xl font-black">Уроки ще готуються</h2>
                <p className="theme-text-soft mt-2 text-sm">
                  Вчитель ще не опублікував контент.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function CourseMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="theme-card-highlight rounded-[1.25rem] p-3">
      <div className="text-3xl font-black leading-none">{value}</div>
      <div className="theme-muted mt-1 text-[10px] font-black uppercase tracking-[0.14em]">
        {label}
      </div>
    </div>
  );
}

function TopicOutline({
  courseId,
  topic,
  topicIndex,
  selectedLessonId,
  canViewLessons,
  subjectColor,
}: {
  courseId: string;
  topic: any;
  topicIndex: number;
  selectedLessonId: string | null;
  canViewLessons: boolean;
  subjectColor: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--card-highlight)] p-3">
      <div className="grid grid-cols-[auto_1fr] gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-black"
          style={{
            background: `color-mix(in srgb, ${subjectColor} 18%, transparent)`,
            color: subjectColor,
          }}
        >
          {topicIndex + 1}
        </div>
        <div className="min-w-0">
          <div className="font-black">{topic.title}</div>
          {topic.description ? (
            <div className="theme-muted mt-1 text-xs leading-5">
              {topic.description}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-1.5">
        {topic.lessons.map((lesson: any, lessonIndex: number) => {
          const isActive = lesson.id === selectedLessonId;
          const content = (
            <>
              <span className="theme-muted shrink-0 text-xs font-black">
                {topicIndex + 1}.{lessonIndex + 1}
              </span>
              <span className="min-w-0 truncate text-sm font-bold">
                {lesson.title}
              </span>
              <span className="theme-muted ml-auto shrink-0 text-[10px] font-black uppercase">
                {lesson.blocks.length}
              </span>
            </>
          );

          if (!canViewLessons) {
            return (
              <div
                key={lesson.id}
                className="flex min-h-11 items-center gap-2 rounded-2xl px-3 py-2 opacity-55"
              >
                {content}
              </div>
            );
          }

          return (
            <Link
              key={lesson.id}
              to={`/courses/${courseId}?lesson=${lesson.id}`}
              className={[
                "flex min-h-11 items-center gap-2 rounded-2xl px-3 py-2 transition",
                isActive
                  ? "bg-[var(--accent-soft)] text-[var(--text)] ring-1 ring-[var(--accent)]/25"
                  : "hover:bg-[var(--panel-strong)]",
              ].join(" ")}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function LockedCoursePanel() {
  return (
    <div className="theme-panel rounded-[1.5rem] p-6">
      <div className="theme-accent-bg inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.16em]">
        Закритий доступ
      </div>
      <h2 className="mt-4 text-3xl font-black">Уроки відкриються після покупки</h2>
      <p className="theme-text-soft mt-3 max-w-xl text-sm leading-6">
        Курс уже зібраний як навчальна програма: теми, уроки, теорія,
        приклади, тести, завдання й відео. Натисни купити, щоб додати його до
        своїх курсів.
      </p>
    </div>
  );
}

function LessonView({ lesson, subjectColor }: { lesson: any; subjectColor: string }) {
  return (
    <>
      <section className="theme-panel relative overflow-hidden rounded-[1.5rem] p-5 sm:p-6">
        <div
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ background: subjectColor }}
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="theme-muted text-[10px] font-black uppercase tracking-[0.18em]">
              Активний урок
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              {lesson.title}
            </h2>
            {lesson.summary ? (
              <p className="theme-text-soft mt-3 max-w-2xl text-sm leading-6">
                {lesson.summary}
              </p>
            ) : null}
          </div>
          <div className="theme-card-highlight rounded-[1.25rem] px-4 py-3">
            <div className="text-2xl font-black">{lesson.blocks.length}</div>
            <div className="theme-muted text-[10px] font-black uppercase tracking-[0.14em]">
              блоків
            </div>
          </div>
        </div>
      </section>
      <LessonContentRenderer blocks={lesson.blocks} />
    </>
  );
}
