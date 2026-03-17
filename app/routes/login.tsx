import { useEffect, useRef } from "react";
import {
  Form,
  data,
  redirect,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "~/lib/db.server";
import { createUserSession, getUserId } from "~/lib/session.server";

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: string;
              size?: string;
              shape?: string;
              text?: string;
              width?: number;
              type?: string;
            }
          ) => void;
          prompt?: () => void;
        };
      };
    };
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);

  if (userId) {
    throw redirect("/me");
  }

  const googleClientId = process.env.GOOGLE_CLIENT_ID;

  if (!googleClientId) {
    throw new Error("GOOGLE_CLIENT_ID is not set");
  }

  return data({ googleClientId });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const credential = String(formData.get("credential") || "");

  if (!credential) {
    return data({ error: "Google credential не отримано" }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not set");
  }

  const client = new OAuth2Client(clientId);

  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: clientId,
  });

  const payload = ticket.getPayload();

  if (!payload) {
    return data(
      { error: "Не вдалося прочитати Google профіль" },
      { status: 400 }
    );
  }

  if (!payload.email || !payload.email_verified) {
    return data(
      { error: "Google акаунт не має підтвердженого email" },
      { status: 400 }
    );
  }

    const user = await prisma.user.upsert({
    where: { email: payload.email },
    update: {
        name: payload.name ?? undefined,
        image: payload.picture ?? undefined,
        emailVerified: payload.email_verified ? new Date() : undefined,
    },
    create: {
        email: payload.email,
        name: payload.name ?? null,
        image: payload.picture ?? null,
        emailVerified: payload.email_verified ? new Date() : null,
    },
    select: {
        id: true,
    },
    });

  return createUserSession({
    request,
    userId: user.id,
    redirectTo: "/me",
  });
}

export default function LoginPage() {
  const { googleClientId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const buttonRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const credentialInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    function initGoogle() {
      if (
        cancelled ||
        !window.google ||
        !window.google.accounts ||
        !window.google.accounts.id ||
        !buttonRef.current
      ) {
        return;
      }

      buttonRef.current.innerHTML = "";

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response: { credential: string }) => {
          if (!credentialInputRef.current || !formRef.current) return;

          credentialInputRef.current.value = response.credential;
          formRef.current.requestSubmit();
        },
      });

      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "signin_with",
        width: 320,
        type: "standard",
      });
    }

    if (window.google?.accounts?.id) {
      initGoogle();
      return () => {
        cancelled = true;
      };
    }

    const existingScript = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]'
    ) as HTMLScriptElement | null;

    if (existingScript) {
      if (window.google?.accounts?.id) {
        initGoogle();
      } else {
        existingScript.addEventListener("load", initGoogle, { once: true });
      }

      return () => {
        cancelled = true;
        existingScript.removeEventListener("load", initGoogle);
      };
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initGoogle;
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      script.onload = null;
    };
  }, [googleClientId]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.22),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.18),transparent_22%),linear-gradient(to_bottom,#0a0a0a,#111827,#0a0a0a)]" />

      <main className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-10">
        <div className="w-full rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Match Predictor
          </div>

          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Вхід у кабінет
          </h1>

          <p className="mt-3 text-sm leading-6 text-white/65 sm:text-base">
            Увійди через Google, щоб робити прогнози, дивитися свої бали та історію.
          </p>

          {actionData?.error && (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {actionData.error}
            </div>
          )}

          <Form method="post" ref={formRef} className="mt-8">
            <input
              ref={credentialInputRef}
              type="hidden"
              name="credential"
            />
          </Form>

          <div ref={buttonRef} className="mt-4 flex justify-center" />

          <p className="mt-4 text-center text-xs text-white/45">
            Якщо кнопка не з’явилась, перевір `GOOGLE_CLIENT_ID` і Authorized JavaScript origins.
          </p>
        </div>
      </main>
    </div>
  );
}