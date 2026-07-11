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
import { getCurrentUser } from "~/lib/auth.server";
import { buyCourseForUser, getCoursesForUser } from "~/lib/courses.server";

function formatPrice(priceCents: number, currency: string) {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}

function formatDate(value: Date | string | null) {
  if (!value) return null;

  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export async function loader({ request }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const courses = await getCoursesForUser(currentUser?.id);

  return data({
    currentUser: currentUser
      ? {
          id: currentUser.id,
          name: currentUser.displayName || currentUser.name || currentUser.email,
        }
      : null,
    courses,
    ownedCourses: courses.filter((course) => course.isOwned),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    throw redirect("/login");
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const courseId = String(formData.get("courseId") || "");

  if (intent !== "buy-course") {
    return data({ ok: false, error: "Невідома дія." }, { status: 400 });
  }

  if (!courseId) {
    return data({ ok: false, error: "Курс не знайдено." }, { status: 400 });
  }

  const result = await buyCourseForUser({
    userId: currentUser.id,
    courseId,
  });

  return data({
    ok: true,
    courseId,
    alreadyOwned: result.alreadyOwned,
    message: result.alreadyOwned
      ? "Цей курс уже є у тебе."
      : "Курс додано до твоїх курсів.",
  });
}

export default function CoursesPage() {
  const { currentUser, courses, ownedCourses } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <main className="theme-page min-h-screen px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="theme-panel flex flex-col gap-4 rounded-[1.75rem] p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="theme-muted text-[10px] font-black uppercase tracking-[0.22em]">
              Courses
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Курси
            </h1>
            <p className="theme-text-soft mt-2 max-w-2xl text-sm leading-6">
              Купівля зараз працює як миттєве додавання курсу. Архітектура вже
              має order, тож оплату можна буде підключити перед видачею доступу.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/teacher/courses"
              className="theme-button inline-flex rounded-2xl px-4 py-2 text-sm font-black"
            >
              Конструктор
            </Link>
            <Link
              to="/"
              className="theme-button inline-flex rounded-2xl px-4 py-2 text-sm font-black"
            >
              На головну
            </Link>
            {currentUser ? (
              <Link
                to="/me"
                className="theme-button inline-flex rounded-2xl px-4 py-2 text-sm font-black"
              >
                Профіль
              </Link>
            ) : (
              <Link
                to="/login"
                className="theme-primary-button inline-flex rounded-2xl px-4 py-2 text-sm font-black"
              >
                Увійти
              </Link>
            )}
          </div>
        </header>

        {actionData?.message ? (
          <div className="theme-success-bg rounded-[1.25rem] px-4 py-3 text-sm font-black">
            {actionData.message}
          </div>
        ) : null}

        {actionData?.error ? (
          <div className="theme-danger-bg rounded-[1.25rem] px-4 py-3 text-sm font-black">
            {actionData.error}
          </div>
        ) : null}

        {ownedCourses.length > 0 ? (
          <section className="theme-panel rounded-[1.75rem] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="theme-muted text-[10px] font-black uppercase tracking-[0.18em]">
                  Мої курси
                </div>
                <h2 className="text-xl font-black">У тебе вже є</h2>
              </div>
              <div className="theme-accent-bg rounded-full px-3 py-1 text-xs font-black">
                {ownedCourses.length}
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {ownedCourses.map((course) => (
                <div
                  key={course.id}
                  className="theme-card-highlight rounded-[1.25rem] p-4"
                >
                  <div className="font-black">{course.title}</div>
                  <div className="theme-text-soft mt-1 text-sm">
                    Доступ з {formatDate(course.ownedAt) ?? "сьогодні"}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-2">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              isSubmitting={isSubmitting}
            />
          ))}
        </section>
      </div>
    </main>
  );
}

function CourseCard({
  course,
  isSubmitting,
}: {
  course: any;
  isSubmitting: boolean;
}) {
  const subjectColor = course.subject?.color || "var(--accent)";
  const lessonsCount =
    course.topics?.reduce(
      (sum: number, topic: any) => sum + topic.lessons.length,
      0
    ) ?? course.lessonsCount;
  const publishedLessonsCount =
    course.topics?.reduce(
      (sum: number, topic: any) =>
        sum +
        topic.lessons.filter((lesson: any) => lesson.isPublished).length,
      0
    ) ?? 0;

  return (
            <article
      className="theme-panel relative overflow-hidden rounded-[1.75rem]"
            >
      <div className="h-2" style={{ background: subjectColor }} />
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em]"
            style={{
              background: `color-mix(in srgb, ${subjectColor} 18%, transparent)`,
              border: `1px solid color-mix(in srgb, ${subjectColor} 34%, transparent)`,
              color: subjectColor,
            }}
          >
            {course.subject?.name ?? "Курс"}
          </span>
                  {course.level ? (
                    <span className="theme-accent-bg rounded-full px-3 py-1 text-xs font-black uppercase">
                      {course.level}
                    </span>
                  ) : null}
                  {course.duration ? (
                    <span className="theme-card-highlight rounded-full px-3 py-1 text-xs font-bold">
                      {course.duration}
                    </span>
                  ) : null}
                  <span className="theme-card-highlight rounded-full px-3 py-1 text-xs font-bold">
            {lessonsCount} уроків
                  </span>
                </div>

                <h2 className="mt-5 text-2xl font-black tracking-tight sm:text-3xl">
                  <Link to={`/courses/${course.id}`} className="hover:text-[var(--accent)]">
                    {course.title}
                  </Link>
                </h2>
                {course.subtitle ? (
                  <p className="theme-text-soft mt-3 text-sm leading-6">
                    {course.subtitle}
                  </p>
                ) : null}
                {course.description ? (
                  <p className="theme-muted mt-3 text-sm leading-6">
                    {course.description}
                  </p>
                ) : null}

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <MiniStat label="теми" value={course.topics?.length ?? 0} />
          <MiniStat label="уроки" value={lessonsCount} />
          <MiniStat label="готові" value={publishedLessonsCount} />
        </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="theme-muted text-[10px] font-black uppercase tracking-[0.16em]">
                      Ціна
                    </div>
                    <div className="mt-1 text-2xl font-black">
                      {formatPrice(course.priceCents, course.currency)}
                    </div>
                  </div>

                  {course.isOwned ? (
                    <Link
                      to={`/courses/${course.id}`}
                      className="theme-success-bg inline-flex min-h-12 items-center justify-center rounded-2xl px-5 text-sm font-black"
                    >
                      Відкрити курс
                    </Link>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/courses/${course.id}`}
                        className="theme-button inline-flex min-h-12 items-center justify-center rounded-2xl px-5 text-sm font-black"
                      >
                        Деталі
                      </Link>
                      <Form method="post">
                        <input type="hidden" name="intent" value="buy-course" />
                        <input type="hidden" name="courseId" value={course.id} />
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="theme-primary-button inline-flex min-h-12 items-center justify-center rounded-2xl px-5 text-sm font-black disabled:opacity-60"
                        >
                          {isSubmitting ? "Додаю..." : "Купити курс"}
                        </button>
                      </Form>
                    </div>
                  )}
                </div>
              </div>
            </article>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="theme-card-highlight rounded-[1rem] px-3 py-2">
      <div className="text-xl font-black">{value}</div>
      <div className="theme-muted text-[10px] font-black uppercase tracking-[0.12em]">
        {label}
      </div>
    </div>
  );
}
