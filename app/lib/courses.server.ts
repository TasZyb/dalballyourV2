import { prisma } from "~/lib/db.server";

export const COURSE_CATALOG = [
  {
    slug: "football-prediction-basics",
    title: "Основи футбольних прогнозів",
    subtitle: "Як читати матч, форму команд і ставити рахунок без хаосу.",
    description:
      "Короткий практичний курс про логіку прогнозів: форма, календар, мотивація, домашній фактор і типові пастки перед матчем.",
    priceCents: 99000,
    currency: "UAH",
    level: "Старт",
    duration: "2 години",
    lessonsCount: 9,
  },
  {
    slug: "advanced-score-reading",
    title: "Читання рахунку та сценарії матчу",
    subtitle: "Вчимося думати не тільки хто виграє, а як саме піде гра.",
    description:
      "Поглиблений курс про сценарії, темп, ризик нічиєї, live-контекст і побудову точнішого прогнозу рахунку.",
    priceCents: 149000,
    currency: "UAH",
    level: "Advanced",
    duration: "3.5 години",
    lessonsCount: 14,
  },
];

export async function ensureCourseCatalog() {
  await Promise.all(
    COURSE_CATALOG.map((course) =>
      prisma.course.upsert({
        where: { slug: course.slug },
        update: {
          title: course.title,
          subtitle: course.subtitle,
          description: course.description,
          priceCents: course.priceCents,
          currency: course.currency,
          level: course.level,
          duration: course.duration,
          lessonsCount: course.lessonsCount,
          isPublished: true,
        },
        create: {
          ...course,
          isPublished: true,
        },
      })
    )
  );
}

export async function getCoursesForUser(userId?: string | null) {
  await ensureCourseCatalog();

  if (!userId) {
    const courses = await prisma.course.findMany({
      where: { isPublished: true },
      orderBy: [{ priceCents: "asc" }, { createdAt: "asc" }],
      include: {
        subject: true,
        topics: {
          include: {
            lessons: {
              select: { id: true, isPublished: true },
            },
          },
        },
      },
    });

    return courses.map((course) => ({
      ...course,
      isOwned: false,
      ownedAt: null,
    }));
  }

  const courses = await prisma.course.findMany({
    where: { isPublished: true },
    orderBy: [{ priceCents: "asc" }, { createdAt: "asc" }],
    include: {
      subject: true,
      topics: {
        include: {
          lessons: {
            select: { id: true, isPublished: true },
          },
        },
      },
      accesses: {
        where: {
          userId,
          revokedAt: null,
        },
        select: {
          id: true,
          grantedAt: true,
        },
        take: 1,
      },
    },
  });

  return courses.map((course) => ({
    ...course,
    isOwned: course.accesses.length > 0,
    ownedAt: course.accesses[0]?.grantedAt ?? null,
  }));
}

export async function grantCourseAccess({
  userId,
  courseId,
  orderId,
}: {
  userId: string;
  courseId: string;
  orderId?: string | null;
}) {
  return prisma.courseAccess.upsert({
    where: {
      userId_courseId: {
        userId,
        courseId,
      },
    },
    update: {
      orderId,
      revokedAt: null,
      source: "PURCHASE",
    },
    create: {
      userId,
      courseId,
      orderId,
      source: "PURCHASE",
    },
  });
}

async function createCheckoutSessionForCourse({
  userId,
  courseId,
}: {
  userId: string;
  courseId: string;
}) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      priceCents: true,
      currency: true,
      isPublished: true,
    },
  });

  if (!course || !course.isPublished) {
    throw new Response("Course not found", { status: 404 });
  }

  const order = await prisma.courseOrder.create({
    data: {
      userId,
      courseId,
      status: "PENDING",
      amountCents: course.priceCents,
      currency: course.currency,
      paymentProvider: "manual-dev",
    },
  });

  return {
    order,
    checkoutUrl: null,
  };
}

export async function buyCourseForUser({
  userId,
  courseId,
}: {
  userId: string;
  courseId: string;
}) {
  const existingAccess = await prisma.courseAccess.findUnique({
    where: {
      userId_courseId: {
        userId,
        courseId,
      },
    },
  });

  if (existingAccess && !existingAccess.revokedAt) {
    return {
      alreadyOwned: true,
      access: existingAccess,
      order: null,
    };
  }

  const { order } = await createCheckoutSessionForCourse({ userId, courseId });

  const paidOrder = await prisma.courseOrder.update({
    where: { id: order.id },
    data: {
      status: "PAID",
      paidAt: new Date(),
    },
  });

  const access = await grantCourseAccess({
    userId,
    courseId,
    orderId: paidOrder.id,
  });

  return {
    alreadyOwned: false,
    access,
    order: paidOrder,
  };
}
