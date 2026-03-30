--
-- PostgreSQL database dump
--

\restrict JOm7l7a02RXPuHEfhGbH4icHGYjINH39Qit2OhLR8ORZm55thNdFEfXGOvDiR7N

-- Dumped from database version 18.3 (Debian 18.3-1.pgdg12+1)
-- Dumped by pg_dump version 18.3 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: zubyk_tl
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO zubyk_tl;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: zubyk_tl
--

COMMENT ON SCHEMA public IS '';


--
-- Name: GameMemberRole; Type: TYPE; Schema: public; Owner: zubyk_tl
--

CREATE TYPE public."GameMemberRole" AS ENUM (
    'OWNER',
    'ADMIN',
    'MEMBER'
);


ALTER TYPE public."GameMemberRole" OWNER TO zubyk_tl;

--
-- Name: GameStatus; Type: TYPE; Schema: public; Owner: zubyk_tl
--

CREATE TYPE public."GameStatus" AS ENUM (
    'ACTIVE',
    'ARCHIVED',
    'DRAFT'
);


ALTER TYPE public."GameStatus" OWNER TO zubyk_tl;

--
-- Name: GameVisibility; Type: TYPE; Schema: public; Owner: zubyk_tl
--

CREATE TYPE public."GameVisibility" AS ENUM (
    'PRIVATE',
    'PUBLIC',
    'UNLISTED'
);


ALTER TYPE public."GameVisibility" OWNER TO zubyk_tl;

--
-- Name: MatchStatus; Type: TYPE; Schema: public; Owner: zubyk_tl
--

CREATE TYPE public."MatchStatus" AS ENUM (
    'SCHEDULED',
    'LIVE',
    'FINISHED',
    'CANCELED',
    'POSTPONED'
);


ALTER TYPE public."MatchStatus" OWNER TO zubyk_tl;

--
-- Name: MembershipStatus; Type: TYPE; Schema: public; Owner: zubyk_tl
--

CREATE TYPE public."MembershipStatus" AS ENUM (
    'ACTIVE',
    'LEFT',
    'KICKED',
    'BANNED'
);


ALTER TYPE public."MembershipStatus" OWNER TO zubyk_tl;

--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: zubyk_tl
--

CREATE TYPE public."UserRole" AS ENUM (
    'USER',
    'ADMIN'
);


ALTER TYPE public."UserRole" OWNER TO zubyk_tl;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Account; Type: TABLE; Schema: public; Owner: zubyk_tl
--

CREATE TABLE public."Account" (
    id text NOT NULL,
    "userId" text NOT NULL,
    type text NOT NULL,
    provider text NOT NULL,
    "providerAccountId" text NOT NULL,
    refresh_token text,
    access_token text,
    expires_at integer,
    token_type text,
    scope text,
    id_token text,
    session_state text
);


ALTER TABLE public."Account" OWNER TO zubyk_tl;

--
-- Name: Game; Type: TABLE; Schema: public; Owner: zubyk_tl
--

CREATE TABLE public."Game" (
    id text NOT NULL,
    name text NOT NULL,
    slug text,
    description text,
    "bannerUrl" text,
    "avatarUrl" text,
    "ownerId" text NOT NULL,
    "linkedTournamentId" text,
    "inviteCode" text NOT NULL,
    visibility public."GameVisibility" DEFAULT 'PRIVATE'::public."GameVisibility" NOT NULL,
    status public."GameStatus" DEFAULT 'ACTIVE'::public."GameStatus" NOT NULL,
    "allowJoinByCode" boolean DEFAULT true NOT NULL,
    "allowMemberPredictionsEdit" boolean DEFAULT true NOT NULL,
    timezone text,
    "scoringExact" integer DEFAULT 3 NOT NULL,
    "scoringOutcome" integer DEFAULT 1 NOT NULL,
    "scoringWrong" integer DEFAULT 0 NOT NULL,
    "defaultRoundWeight" integer DEFAULT 1 NOT NULL,
    "lockMinutesBeforeStart" integer DEFAULT 0 NOT NULL,
    "startsAt" timestamp(3) without time zone,
    "endsAt" timestamp(3) without time zone,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Game" OWNER TO zubyk_tl;

--
-- Name: GameInvite; Type: TABLE; Schema: public; Owner: zubyk_tl
--

CREATE TABLE public."GameInvite" (
    id text NOT NULL,
    "gameId" text NOT NULL,
    code text NOT NULL,
    "createdById" text,
    email text,
    "roleOnJoin" public."GameMemberRole" DEFAULT 'MEMBER'::public."GameMemberRole" NOT NULL,
    "maxUses" integer,
    "usedCount" integer DEFAULT 0 NOT NULL,
    "expiresAt" timestamp(3) without time zone,
    "revokedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."GameInvite" OWNER TO zubyk_tl;

--
-- Name: GameMatch; Type: TABLE; Schema: public; Owner: zubyk_tl
--

CREATE TABLE public."GameMatch" (
    id text NOT NULL,
    "gameId" text NOT NULL,
    "matchId" text NOT NULL,
    "customWeight" integer,
    "bonusLabel" text,
    "includeInLeaderboard" boolean DEFAULT true NOT NULL,
    "isLocked" boolean DEFAULT false NOT NULL,
    "predictionOpensAt" timestamp(3) without time zone,
    "predictionClosesAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."GameMatch" OWNER TO zubyk_tl;

--
-- Name: GameMember; Type: TABLE; Schema: public; Owner: zubyk_tl
--

CREATE TABLE public."GameMember" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "gameId" text NOT NULL,
    role public."GameMemberRole" DEFAULT 'MEMBER'::public."GameMemberRole" NOT NULL,
    status public."MembershipStatus" DEFAULT 'ACTIVE'::public."MembershipStatus" NOT NULL,
    nickname text,
    "joinedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "leftAt" timestamp(3) without time zone,
    "kickedAt" timestamp(3) without time zone,
    "lastSeenAt" timestamp(3) without time zone
);


ALTER TABLE public."GameMember" OWNER TO zubyk_tl;

--
-- Name: Match; Type: TABLE; Schema: public; Owner: zubyk_tl
--

CREATE TABLE public."Match" (
    id text NOT NULL,
    "externalId" text,
    "tournamentId" text NOT NULL,
    "roundId" text,
    "homeTeamId" text NOT NULL,
    "awayTeamId" text NOT NULL,
    venue text,
    "stageLabel" text,
    "matchdayLabel" text,
    "startTime" timestamp(3) without time zone NOT NULL,
    status public."MatchStatus" DEFAULT 'SCHEDULED'::public."MatchStatus" NOT NULL,
    "homeScore" integer,
    "awayScore" integer,
    "extraHomeScore" integer,
    "extraAwayScore" integer,
    "penaltyHome" integer,
    "penaltyAway" integer,
    "sourceUpdatedAt" timestamp(3) without time zone,
    "lockedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Match" OWNER TO zubyk_tl;

--
-- Name: Prediction; Type: TABLE; Schema: public; Owner: zubyk_tl
--

CREATE TABLE public."Prediction" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "gameId" text NOT NULL,
    "matchId" text NOT NULL,
    "predictedHome" integer NOT NULL,
    "predictedAway" integer NOT NULL,
    "pointsAwarded" integer DEFAULT 0 NOT NULL,
    "weightUsed" integer DEFAULT 1 NOT NULL,
    "weightedPointsAwarded" integer DEFAULT 0 NOT NULL,
    "multiplierUsed" integer DEFAULT 1 NOT NULL,
    "wasExact" boolean DEFAULT false NOT NULL,
    "wasOutcomeOnly" boolean DEFAULT false NOT NULL,
    "wasWrong" boolean DEFAULT false NOT NULL,
    "submittedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "lockedAt" timestamp(3) without time zone,
    "scoreCalculatedAt" timestamp(3) without time zone
);


ALTER TABLE public."Prediction" OWNER TO zubyk_tl;

--
-- Name: Round; Type: TABLE; Schema: public; Owner: zubyk_tl
--

CREATE TABLE public."Round" (
    id text NOT NULL,
    "tournamentId" text NOT NULL,
    name text NOT NULL,
    slug text,
    "order" integer,
    "defaultWeight" integer DEFAULT 1 NOT NULL,
    "startsAt" timestamp(3) without time zone,
    "endsAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Round" OWNER TO zubyk_tl;

--
-- Name: Season; Type: TABLE; Schema: public; Owner: zubyk_tl
--

CREATE TABLE public."Season" (
    id text NOT NULL,
    name text NOT NULL,
    "yearLabel" text,
    "isCurrent" boolean DEFAULT false NOT NULL,
    "startsAt" timestamp(3) without time zone,
    "endsAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Season" OWNER TO zubyk_tl;

--
-- Name: Session; Type: TABLE; Schema: public; Owner: zubyk_tl
--

CREATE TABLE public."Session" (
    id text NOT NULL,
    "sessionToken" text NOT NULL,
    "userId" text NOT NULL,
    expires timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Session" OWNER TO zubyk_tl;

--
-- Name: Team; Type: TABLE; Schema: public; Owner: zubyk_tl
--

CREATE TABLE public."Team" (
    id text NOT NULL,
    name text NOT NULL,
    "shortName" text,
    code text,
    logo text,
    country text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Team" OWNER TO zubyk_tl;

--
-- Name: Tournament; Type: TABLE; Schema: public; Owner: zubyk_tl
--

CREATE TABLE public."Tournament" (
    id text NOT NULL,
    name text NOT NULL,
    slug text,
    country text,
    logo text,
    "isActive" boolean DEFAULT true NOT NULL,
    "seasonId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Tournament" OWNER TO zubyk_tl;

--
-- Name: User; Type: TABLE; Schema: public; Owner: zubyk_tl
--

CREATE TABLE public."User" (
    id text NOT NULL,
    name text,
    email text,
    image text,
    "emailVerified" timestamp(3) without time zone,
    role public."UserRole" DEFAULT 'USER'::public."UserRole" NOT NULL,
    bio text,
    "favoriteTeamId" text,
    "favoriteColor" text,
    "profileBanner" text,
    "displayName" text,
    "isProfilePublic" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "lastSeenAt" timestamp(3) without time zone
);


ALTER TABLE public."User" OWNER TO zubyk_tl;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: zubyk_tl
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO zubyk_tl;

--
-- Data for Name: Account; Type: TABLE DATA; Schema: public; Owner: zubyk_tl
--

COPY public."Account" (id, "userId", type, provider, "providerAccountId", refresh_token, access_token, expires_at, token_type, scope, id_token, session_state) FROM stdin;
\.


--
-- Data for Name: Game; Type: TABLE DATA; Schema: public; Owner: zubyk_tl
--

COPY public."Game" (id, name, slug, description, "bannerUrl", "avatarUrl", "ownerId", "linkedTournamentId", "inviteCode", visibility, status, "allowJoinByCode", "allowMemberPredictionsEdit", timezone, "scoringExact", "scoringOutcome", "scoringWrong", "defaultRoundWeight", "lockMinutesBeforeStart", "startsAt", "endsAt", "archivedAt", "createdAt", "updatedAt") FROM stdin;
cmmx9kfe3000jhxlpbkhn6uud	Тестова гра для реальний мужиків	тестова-гра-для-реальний-мужиків	\N	\N	\N	cmmx9jkwv000hhxlpyfr2ssm8	cmmx9iqmi0002hxghsax1sjtz	47EKGPYD	UNLISTED	ACTIVE	t	t	Europe/Uzhgorod	3	1	0	1	15	2026-03-19 09:24:34.922	\N	\N	2026-03-19 09:24:34.923	2026-03-19 09:24:34.923
\.


--
-- Data for Name: GameInvite; Type: TABLE DATA; Schema: public; Owner: zubyk_tl
--

COPY public."GameInvite" (id, "gameId", code, "createdById", email, "roleOnJoin", "maxUses", "usedCount", "expiresAt", "revokedAt", "createdAt", "updatedAt") FROM stdin;
cmmx9kfe5000nhxlpy6r4p3ig	cmmx9kfe3000jhxlpbkhn6uud	VGEY-FM6S	cmmx9jkwv000hhxlpyfr2ssm8	\N	MEMBER	\N	0	\N	\N	2026-03-19 09:24:34.923	2026-03-19 09:24:34.923
\.


--
-- Data for Name: GameMatch; Type: TABLE DATA; Schema: public; Owner: zubyk_tl
--

COPY public."GameMatch" (id, "gameId", "matchId", "customWeight", "bonusLabel", "includeInLeaderboard", "isLocked", "predictionOpensAt", "predictionClosesAt", "createdAt", "updatedAt") FROM stdin;
cmmxa70370004dt1qxgdwwpdw	cmmx9kfe3000jhxlpbkhn6uud	cmmxa70330002dt1qamkglr02	\N	\N	t	f	\N	\N	2026-03-19 09:42:08.179	2026-03-19 09:42:08.179
cmn34tds20003e31qqjan3aqi	cmmx9kfe3000jhxlpbkhn6uud	cmn34tdq20001e31qokl3lkio	1	\N	t	f	\N	2026-04-07 21:59:00	2026-03-23 11:58:11.715	2026-03-23 11:58:11.715
cmn34ucxp0007e31qxvwrm0g0	cmmx9kfe3000jhxlpbkhn6uud	cmn34ucxl0005e31qk8j8c3qy	1	\N	t	f	\N	2026-04-08 21:59:00	2026-03-23 11:58:57.277	2026-03-23 11:58:57.277
cmn34v3d3000be31qpza09ybs	cmmx9kfe3000jhxlpbkhn6uud	cmn34v3cy0009e31qrhpkf6rn	1	\N	t	f	\N	2026-04-07 21:59:00	2026-03-23 11:59:31.528	2026-03-23 11:59:31.528
cmn30p1pp0005hxzreygzfeqc	cmmx9kfe3000jhxlpbkhn6uud	cmn30bbv20001hxzrkti7vt8i	\N	\N	t	t	\N	\N	2026-03-23 10:02:50.989	2026-03-23 14:12:39.723
cmn52zxo90004c3qbsslv9s0a	cmmx9kfe3000jhxlpbkhn6uud	cmn52zxm90002c3qbm9rpwbdk	3	\N	t	t	\N	2026-03-26 19:44:00	2026-03-24 20:42:50.553	2026-03-26 22:38:48.967
\.


--
-- Data for Name: GameMember; Type: TABLE DATA; Schema: public; Owner: zubyk_tl
--

COPY public."GameMember" (id, "userId", "gameId", role, status, nickname, "joinedAt", "leftAt", "kickedAt", "lastSeenAt") FROM stdin;
cmmx9kfe4000lhxlpjgi43j3p	cmmx9jkwv000hhxlpyfr2ssm8	cmmx9kfe3000jhxlpbkhn6uud	OWNER	ACTIVE	\N	2026-03-19 09:24:34.922	\N	\N	\N
cmmyzv48j0002dv29xi3sczlb	cmmyzumt10000dv290okxbj8q	cmmx9kfe3000jhxlpbkhn6uud	MEMBER	ACTIVE	\N	2026-03-20 14:28:29.874	\N	\N	\N
cmn1qe1lw0003h01qjhtb2ht2	cmn1ppgzb0001h01ql33ypakk	cmmx9kfe3000jhxlpbkhn6uud	MEMBER	ACTIVE	\N	2026-03-22 12:26:35.3	\N	\N	\N
cmn3fyr700002gf1qxhcb8qxq	cmn3fwu4d0000gf1q9kp36zc4	cmmx9kfe3000jhxlpbkhn6uud	MEMBER	ACTIVE	\N	2026-03-23 17:10:18.155	\N	\N	\N
cmn7tv0xs0002fa1q3gxn3501	cmn7tu5k80000fa1qy0r5s7nc	cmmx9kfe3000jhxlpbkhn6uud	MEMBER	ACTIVE	\N	2026-03-26 18:50:23.488	\N	\N	\N
\.


--
-- Data for Name: Match; Type: TABLE DATA; Schema: public; Owner: zubyk_tl
--

COPY public."Match" (id, "externalId", "tournamentId", "roundId", "homeTeamId", "awayTeamId", venue, "stageLabel", "matchdayLabel", "startTime", status, "homeScore", "awayScore", "extraHomeScore", "extraAwayScore", "penaltyHome", "penaltyAway", "sourceUpdatedAt", "lockedAt", "createdAt", "updatedAt") FROM stdin;
cmmxa70330002dt1qamkglr02	\N	cmmx9iqmi0002hxghsax1sjtz	cmmx9iqpx0004hxghqnlk1j3d	cmmx9irsj000ohxghy3rodg0o	cmmx9ir090009hxghm372qe1q	\N	\N	\N	2026-04-07 22:00:00	SCHEDULED	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-19 09:42:08.176	2026-03-19 09:42:08.176
cmn3276910006hxzrs54zou29	\N	cmmx9iqmi0002hxghsax1sjtz	cmn309mxh0000hxzrgwczbbcw	cmmx9ir090009hxghm372qe1q	cmmx9irqh000lhxgh1p06udt0	\N	\N	\N	1970-01-01 00:00:00	FINISHED	4	0	\N	\N	\N	\N	\N	\N	2026-03-23 10:44:56.293	2026-03-23 10:41:42.03
cmn32elj3000chxzr0tdnabn7	\N	cmmx9iqmi0002hxghsax1sjtz	cmn309mxh0000hxzrgwczbbcw	cmmx9ir39000bhxghzo41n8cq	cmmx9is2w000zhxghcf6hpuu9	\N	\N	\N	1970-01-01 00:00:00	FINISHED	4	1	\N	\N	\N	\N	\N	\N	2026-03-23 10:50:42.687	2026-03-23 10:49:31.11
cmn33rq3b000ghxzrcechhszw	\N	cmmx9iqmi0002hxghsax1sjtz	cmn309mxh0000hxzrgwczbbcw	cmmx9iqyk0008hxgh842jjrrq	cmmx9ir9s000fhxghvwedq0e3	\N	\N	\N	1970-01-01 00:00:00	FINISHED	7	2	\N	\N	\N	\N	\N	\N	2026-03-23 11:28:54.743	2026-03-23 11:28:10.07
cmn33w2uy000khxzrddjzqfi1	\N	cmmx9iqmi0002hxghsax1sjtz	cmn309mxh0000hxzrgwczbbcw	cmmx9irnn000khxgh2bx95p67	cmmx9irsj000ohxghy3rodg0o	\N	\N	\N	1970-01-01 00:00:00	FINISHED	0	3	\N	\N	\N	\N	\N	\N	2026-03-23 11:32:17.914	2026-03-23 11:31:37.615
cmn346zwn000ohxzrqkfm9hz8	\N	cmmx9iqmi0002hxghsax1sjtz	cmmx9iqpx0004hxghqnlk1j3d	cmmx9is1d000yhxghqr9lr4ve	cmmx9isde0016hxgh9195g1a3	\N	\N	\N	1970-01-01 00:00:00	FINISHED	2	0	\N	\N	\N	\N	\N	\N	2026-03-23 11:40:47.303	2026-03-23 11:39:52.194
cmn34ha51000yhxzrddk3sr2g	\N	cmmx9iqmi0002hxghsax1sjtz	cmn309mxh0000hxzrgwczbbcw	cmmx9irzm000whxghl1er4o41	cmmx9irif000ghxgh6d4k8bly	\N	\N	\N	1970-01-01 00:00:00	FINISHED	5	0	\N	\N	\N	\N	\N	\N	2026-03-23 11:48:47.125	2026-03-23 11:47:49.763
cmn34tdq20001e31qokl3lkio	\N	cmmx9iqmi0002hxghsax1sjtz	cmn34rio00012hxzrwlh791zt	cmmx9irxx000thxghs7g67ytr	cmmx9ir39000bhxghzo41n8cq	\N	\N	\N	2026-04-07 22:00:00	SCHEDULED	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-23 11:58:11.642	2026-03-23 11:58:11.642
cmn34ucxl0005e31qk8j8c3qy	\N	cmmx9iqmi0002hxghsax1sjtz	cmn34rio00012hxzrwlh791zt	cmmx9iqyk0008hxgh842jjrrq	cmmx9ir1t000ahxghypdyfzra	\N	\N	\N	2026-04-08 22:00:00	SCHEDULED	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-23 11:58:57.274	2026-03-23 11:58:57.274
cmn34v3cy0009e31qrhpkf6rn	\N	cmmx9iqmi0002hxghsax1sjtz	cmn34rio00012hxzrwlh791zt	cmmx9irzm000whxghl1er4o41	cmmx9is1d000yhxghqr9lr4ve	\N	\N	\N	2026-04-07 22:00:00	SCHEDULED	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-23 11:59:31.523	2026-03-23 11:59:31.523
cmn30bbv20001hxzrkti7vt8i	\N	cmmx9iqmi0002hxghsax1sjtz	cmn309mxh0000hxzrgwczbbcw	cmmx9is770012hxghqytqtvpq	cmmx9ir1t000ahxghypdyfzra	\N	\N	\N	1970-01-01 00:00:00	FINISHED	3	2	\N	\N	\N	\N	\N	\N	2026-03-23 09:52:10.958	2026-03-24 21:11:19.543
cmn52zxm90002c3qbm9rpwbdk	\N	cmn522p9p0000c355fwomemdt	\N	cmn52uutm0001c355a9qppqv3	cmn52wce80002c355dosgfde3	\N	\N	\N	2026-03-26 19:45:00	FINISHED	0	3	\N	\N	\N	\N	\N	2026-03-26 22:38:48.963	2026-03-24 20:42:50.479	2026-03-26 22:38:48.964
\.


--
-- Data for Name: Prediction; Type: TABLE DATA; Schema: public; Owner: zubyk_tl
--

COPY public."Prediction" (id, "userId", "gameId", "matchId", "predictedHome", "predictedAway", "pointsAwarded", "weightUsed", "weightedPointsAwarded", "multiplierUsed", "wasExact", "wasOutcomeOnly", "wasWrong", "submittedAt", "updatedAt", "lockedAt", "scoreCalculatedAt") FROM stdin;
cmmxc16vo0001db1q1y5r8z7b	cmmx9jkwv000hhxlpyfr2ssm8	cmmx9kfe3000jhxlpbkhn6uud	cmmxa70330002dt1qamkglr02	3	1	0	2	0	1	f	f	f	2026-03-19 10:33:36.275	2026-03-19 10:33:36.276	\N	\N
cmmyzvosv0004dv29n0sn4chj	cmmyzumt10000dv290okxbj8q	cmmx9kfe3000jhxlpbkhn6uud	cmmxa70330002dt1qamkglr02	1	3	0	2	0	1	f	f	f	2026-03-20 14:28:56.527	2026-03-20 14:28:56.527	\N	\N
cmn30fhda0002hxzrw6e2ob4i	cmn1ppgzb0001h01ql33ypakk	cmmx9kfe3000jhxlpbkhn6uud	cmn30bbv20001hxzrkti7vt8i	2	1	1	1	1	1	f	t	f	2026-03-23 09:55:24.718	2026-03-23 14:12:39.735	\N	2026-03-23 14:12:39.735
cmn30gyhw0003hxzrzmq87ddp	cmmx9jkwv000hhxlpyfr2ssm8	cmmx9kfe3000jhxlpbkhn6uud	cmn30bbv20001hxzrkti7vt8i	3	2	3	1	3	1	t	f	f	2026-03-23 09:56:33.573	2026-03-23 14:12:39.738	\N	2026-03-23 14:12:39.737
cmn7gc7as0001gg1qt0yxdgsn	cmn3fwu4d0000gf1q9kp36zc4	cmmx9kfe3000jhxlpbkhn6uud	cmn52zxm90002c3qbm9rpwbdk	2	1	0	3	0	1	f	f	t	2026-03-26 12:31:50.259	2026-03-26 22:38:48.979	\N	2026-03-26 22:38:48.978
cmn53a68u0003c355en3qqsjj	cmn3fwu4d0000gf1q9kp36zc4	cmmx9kfe3000jhxlpbkhn6uud	cmn30bbv20001hxzrkti7vt8i	1	2	0	1	0	1	f	f	f	2026-03-24 20:50:48.223	2026-03-24 20:50:07.864	\N	\N
cmn7k2k510001dw1qborghuox	cmn1ppgzb0001h01ql33ypakk	cmmx9kfe3000jhxlpbkhn6uud	cmn52zxm90002c3qbm9rpwbdk	2	1	0	3	0	1	f	f	t	2026-03-26 14:16:18.805	2026-03-26 22:38:48.981	\N	2026-03-26 22:38:48.98
cmn328t9w0007hxzrohyumszx	cmn1ppgzb0001h01ql33ypakk	cmmx9kfe3000jhxlpbkhn6uud	cmn3276910006hxzrs54zou29	2	0	1	1	1	1	f	f	f	2026-03-23 10:46:12.788	2026-03-23 10:45:15.042	\N	\N
cmn32a06t0008hxzro17cvpr5	cmmx9jkwv000hhxlpyfr2ssm8	cmmx9kfe3000jhxlpbkhn6uud	cmn3276910006hxzrs54zou29	2	1	1	1	1	1	f	f	f	2026-03-23 10:47:08.405	2026-03-23 10:46:21.311	\N	\N
cmn32btwz000bhxzr07vrzj5w	cmn1p87jb0000h01qi4448sue	cmmx9kfe3000jhxlpbkhn6uud	cmn3276910006hxzrs54zou29	2	1	1	1	1	1	f	f	f	2026-03-23 10:48:33.588	2026-03-23 10:47:13.31	\N	\N
cmn32g67r000dhxzrk3lds11i	cmn1ppgzb0001h01ql33ypakk	cmmx9kfe3000jhxlpbkhn6uud	cmn32elj3000chxzr0tdnabn7	3	1	1	1	1	1	f	f	f	2026-03-23 10:51:56.151	2026-03-23 10:51:03.132	\N	\N
cmn32gye6000ehxzrqliuavgm	cmmx9jkwv000hhxlpyfr2ssm8	cmmx9kfe3000jhxlpbkhn6uud	cmn32elj3000chxzr0tdnabn7	6	0	1	1	1	1	f	f	f	2026-03-23 10:52:32.67	2026-03-23 10:52:04.592	\N	\N
cmn32hvl5000fhxzr38ejwlvf	cmn1p87jb0000h01qi4448sue	cmmx9kfe3000jhxlpbkhn6uud	cmn32elj3000chxzr0tdnabn7	5	0	1	1	1	1	f	f	f	2026-03-23 10:53:15.69	2026-03-23 10:52:35.43	\N	\N
cmn33stiq000hhxzrhq4ec0yb	cmn1ppgzb0001h01ql33ypakk	cmmx9kfe3000jhxlpbkhn6uud	cmn33rq3b000ghxzrcechhszw	3	1	1	1	1	1	f	f	f	2026-03-23 11:29:45.842	2026-03-23 11:29:08.471	\N	\N
cmn33tmg2000ihxzrtzlrqnj0	cmmx9jkwv000hhxlpyfr2ssm8	cmmx9kfe3000jhxlpbkhn6uud	cmn33rq3b000ghxzrcechhszw	3	1	1	1	1	1	f	f	f	2026-03-23 11:30:23.331	2026-03-23 11:29:53.152	\N	\N
cmn33ucso000jhxzrxhgusvp6	cmn1p87jb0000h01qi4448sue	cmmx9kfe3000jhxlpbkhn6uud	cmn33rq3b000ghxzrcechhszw	3	0	1	1	1	1	f	f	f	2026-03-23 11:30:57.481	2026-03-23 11:30:26.141	\N	\N
cmn33x9xb000lhxzrdvu0a0hv	cmn1ppgzb0001h01ql33ypakk	cmmx9kfe3000jhxlpbkhn6uud	cmn33w2uy000khxzrddjzqfi1	2	2	0	1	0	1	f	f	f	2026-03-23 11:33:13.727	2026-03-23 11:32:41.767	\N	\N
cmn33xwg1000mhxzrw036k89m	cmmx9jkwv000hhxlpyfr2ssm8	cmmx9kfe3000jhxlpbkhn6uud	cmn33w2uy000khxzrddjzqfi1	2	3	1	1	1	1	f	f	f	2026-03-23 11:33:42.913	2026-03-23 11:33:20.822	\N	\N
cmn33yzm5000nhxzrcgqcy9s2	cmn1p87jb0000h01qi4448sue	cmmx9kfe3000jhxlpbkhn6uud	cmn33w2uy000khxzrddjzqfi1	2	2	0	1	0	1	f	f	f	2026-03-23 11:34:33.677	2026-03-23 11:35:49.072	\N	\N
cmn34e94h000vhxzrlxyn8exf	cmn1ppgzb0001h01ql33ypakk	cmmx9kfe3000jhxlpbkhn6uud	cmn346zwn000ohxzrqkfm9hz8	2	1	1	1	1	1	f	f	f	2026-03-23 11:46:25.841	2026-03-23 11:45:41.142	\N	\N
cmn34exss000whxzro21hipc3	cmmx9jkwv000hhxlpyfr2ssm8	cmmx9kfe3000jhxlpbkhn6uud	cmn346zwn000ohxzrqkfm9hz8	3	0	1	1	1	1	f	f	f	2026-03-23 11:46:57.82	2026-03-23 11:46:28.822	\N	\N
cmn34fo43000xhxzrz54surry	cmn1p87jb0000h01qi4448sue	cmmx9kfe3000jhxlpbkhn6uud	cmn346zwn000ohxzrqkfm9hz8	4	2	1	1	1	1	f	f	f	2026-03-23 11:47:31.924	2026-03-23 11:47:03.387	\N	\N
cmn34ifc7000zhxzr4gv6a6zm	cmn1ppgzb0001h01ql33ypakk	cmmx9kfe3000jhxlpbkhn6uud	cmn34ha51000yhxzrddk3sr2g	2	1	1	1	1	1	f	f	f	2026-03-23 11:49:40.519	2026-03-23 11:49:10.782	\N	\N
cmn34iyua0010hxzrv7ez1ue0	cmmx9jkwv000hhxlpyfr2ssm8	cmmx9kfe3000jhxlpbkhn6uud	cmn34ha51000yhxzrddk3sr2g	2	2	0	1	0	1	f	f	f	2026-03-23 11:50:05.795	2026-03-23 11:49:43.96	\N	\N
cmn34jkh30011hxzra5fhi3d2	cmn1p87jb0000h01qi4448sue	cmmx9kfe3000jhxlpbkhn6uud	cmn34ha51000yhxzrddk3sr2g	2	4	0	1	0	1	f	f	f	2026-03-23 11:50:33.832	2026-03-23 11:50:09.269	\N	\N
cmn34w145000de31qzpo6k5g3	cmmx9jkwv000hhxlpyfr2ssm8	cmmx9kfe3000jhxlpbkhn6uud	cmn34tdq20001e31qokl3lkio	1	2	0	1	0	1	f	f	f	2026-03-23 12:00:15.269	2026-03-23 12:00:15.27	\N	\N
cmn30hstq0004hxzroe5pjzu3	cmn1p87jb0000h01qi4448sue	cmmx9kfe3000jhxlpbkhn6uud	cmn30bbv20001hxzrkti7vt8i	1	2	0	1	0	1	f	f	t	2026-03-23 09:57:12.878	2026-03-23 14:12:39.733	\N	2026-03-23 14:12:39.732
cmn53bjfp0004c355r41xx0ux	cmn3fwu4d0000gf1q9kp36zc4	cmmx9kfe3000jhxlpbkhn6uud	cmn3276910006hxzrs54zou29	2	0	1	1	1	1	f	f	f	2026-03-24 20:51:51.974	2026-03-24 20:51:21.396	\N	\N
cmn53cjrd0005c355g5m52iin	cmn3fwu4d0000gf1q9kp36zc4	cmmx9kfe3000jhxlpbkhn6uud	cmn32elj3000chxzr0tdnabn7	2	0	1	1	1	1	f	f	f	2026-03-24 20:52:39.049	2026-03-24 20:52:03.863	\N	\N
cmn53dm5s0006c355ntdoeds9	cmn3fwu4d0000gf1q9kp36zc4	cmmx9kfe3000jhxlpbkhn6uud	cmn33rq3b000ghxzrcechhszw	2	0	1	1	1	1	f	f	f	2026-03-24 20:53:28.817	2026-03-24 20:52:59.2	\N	\N
cmn53g5i50007c3555t38qz2n	cmn3fwu4d0000gf1q9kp36zc4	cmmx9kfe3000jhxlpbkhn6uud	cmn33w2uy000khxzrddjzqfi1	2	2	0	1	0	1	f	f	f	2026-03-24 20:55:27.198	2026-03-24 20:54:20.226	\N	\N
cmn53hazg0008c355ag3xcge5	cmn3fwu4d0000gf1q9kp36zc4	cmmx9kfe3000jhxlpbkhn6uud	cmn346zwn000ohxzrqkfm9hz8	3	1	1	1	1	1	f	f	f	2026-03-24 20:56:20.956	2026-03-24 20:55:57.053	\N	\N
cmn53j8n90009c3554o6k9epv	cmn3fwu4d0000gf1q9kp36zc4	cmmx9kfe3000jhxlpbkhn6uud	cmn34ha51000yhxzrddk3sr2g	2	1	1	1	1	1	f	f	f	2026-03-24 20:57:51.237	2026-03-24 20:57:04.262	\N	\N
cmn55qwkt0001g8290zdpdwvs	cmmx9jkwv000hhxlpyfr2ssm8	cmmx9kfe3000jhxlpbkhn6uud	cmn52zxm90002c3qbm9rpwbdk	2	1	0	3	0	1	f	f	t	2026-03-24 21:59:48.077	2026-03-26 22:38:48.976	\N	2026-03-26 22:38:48.976
cmn7tvd070004fa1qglwbyhg1	cmn7tu5k80000fa1qy0r5s7nc	cmmx9kfe3000jhxlpbkhn6uud	cmn52zxm90002c3qbm9rpwbdk	3	1	0	3	0	1	f	f	t	2026-03-26 18:50:39.126	2026-03-26 22:38:48.983	\N	2026-03-26 22:38:48.982
\.


--
-- Data for Name: Round; Type: TABLE DATA; Schema: public; Owner: zubyk_tl
--

COPY public."Round" (id, "tournamentId", name, slug, "order", "defaultWeight", "startsAt", "endsAt", "createdAt", "updatedAt") FROM stdin;
cmmx9iqpx0004hxghqnlk1j3d	cmmx9iqmi0002hxghsax1sjtz	Knockout Phase Play-offs	knockout-phase-playoffs	1	2	2026-02-17 00:00:00	2026-02-25 23:59:59	2026-03-19 09:23:16.293	2026-03-19 09:23:16.293
cmmx9iqth0006hxghhxe26d24	cmmx9iqmi0002hxghsax1sjtz	Round of 16	round-of-16	2	3	2026-03-10 00:00:00	2026-03-18 23:59:59	2026-03-19 09:23:16.421	2026-03-19 09:23:16.421
cmn309mxh0000hxzrgwczbbcw	cmmx9iqmi0002hxghsax1sjtz	Round of 8	round-of-8	3	1	2026-02-17 00:00:00	2026-02-25 23:59:59	2026-03-23 09:50:51.989	2026-03-23 09:49:22.3
cmn34rio00012hxzrwlh791zt	cmmx9iqmi0002hxghsax1sjtz	Round of 4	round-of-4	4	1	2026-04-08 00:00:00	2026-04-15 23:59:59	2026-03-23 11:56:44.736	2026-03-23 11:55:32.366
\.


--
-- Data for Name: Season; Type: TABLE DATA; Schema: public; Owner: zubyk_tl
--

COPY public."Season" (id, name, "yearLabel", "isCurrent", "startsAt", "endsAt", "createdAt", "updatedAt") FROM stdin;
cmmx9iqiw0000hxghi27737t0	UEFA Season 2025/26	2025/26	t	2025-08-01 00:00:00	2026-06-30 23:59:59	2026-03-19 09:23:16.04	2026-03-19 09:23:16.04
\.


--
-- Data for Name: Session; Type: TABLE DATA; Schema: public; Owner: zubyk_tl
--

COPY public."Session" (id, "sessionToken", "userId", expires) FROM stdin;
\.


--
-- Data for Name: Team; Type: TABLE DATA; Schema: public; Owner: zubyk_tl
--

COPY public."Team" (id, name, "shortName", code, logo, country, "createdAt", "updatedAt") FROM stdin;
cmmx9iqvb0007hxghy2ko9t0x	Ajax	AJA	AJA	\N	Netherlands	2026-03-19 09:23:16.487	2026-03-19 09:23:16.487
cmmx9iqyk0008hxgh842jjrrq	Barcelona	BAR	BAR	\N	Spain	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9ir090009hxghm372qe1q	Liverpool	LIV	LIV	\N	England	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9ir1t000ahxghypdyfzra	Atletico Madrid	ATM	ATM	\N	Spain	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9ir39000bhxghzo41n8cq	Bayern Munich	BAY	BAY	\N	Germany	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9ir4k000chxghj0rc05dg	Manchester City	MCI	MCI	\N	England	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9ir67000dhxghvovmmf16	Benfica	BEN	BEN	\N	Portugal	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9ir81000ehxghdvjj8qao	Frankfurt	FRA	FRA	\N	Germany	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9ir9s000fhxghvwedq0e3	Newcastle	NEW	NEW	\N	England	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9irif000ghxgh6d4k8bly	Bodø/Glimt	BOD	BOD	\N	Norway	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9irk5000hhxghn3cjtuul	Olympiacos	OLY	OLY	\N	Greece	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9irlx000ihxghmeu58w4r	Marseille	MAR	MAR	\N	France	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9irnn000khxgh2bx95p67	Chelsea	CHE	CHE	\N	England	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9irn4000jhxghcejdqwdu	Athletic Club	ATH	ATH	\N	Spain	2026-03-19 09:23:16.487	2026-03-19 09:23:16.487
cmmx9irqv000mhxghaxm8i9t3	Pafos	PAF	PAF	\N	Cyprus	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9irqh000lhxgh1p06udt0	Galatasaray	GAL	GAL	\N	Turkey	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9irsj000ohxghy3rodg0o	Paris Saint-Germain	PSG	PSG	\N	France	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9irsi000nhxghrx410emk	Club Brugge	BRU	BRU	\N	Belgium	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9iru9000phxgh8j0m1a74	Copenhagen	COP	COP	\N	Denmark	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9iru9000qhxgh9r6rjwb0	Monaco	MON	MON	\N	France	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9irvv000rhxgh0x4znsu5	Inter	INT	INT	\N	Italy	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9irw1000shxghi9rkx5xh	PSV	PSV	PSV	\N	Netherlands	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9irxx000uhxghov2dh7y5	Slavia Praha	SLA	SLA	\N	Czech Republic	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9irxx000thxghs7g67ytr	Real Madrid	RMA	RMA	\N	Spain	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9irzk000vhxgh1ccm9fcc	Qarabag	QAR	QAR	\N	Azerbaijan	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9irzm000whxghl1er4o41	Sporting CP	SCP	SCP	\N	Portugal	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9is18000xhxghhjqv7i1d	Juventus	JUV	JUV	\N	Italy	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9is1d000yhxghqr9lr4ve	Arsenal	ARS	ARS	\N	England	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9is390010hxghnh8jroup	Napoli	NAP	NAP	\N	Italy	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9is2w000zhxghcf6hpuu9	Atalanta	ATA	ATA	\N	Italy	2026-03-19 09:23:16.487	2026-03-19 09:23:16.487
cmmx9is520011hxghwp94t1es	Kairat Almaty	KAI	KAI	\N	Kazakhstan	2026-03-19 09:23:16.488	2026-03-19 09:23:16.488
cmmx9is770012hxghqytqtvpq	Tottenham	TOT	TOT	\N	England	2026-03-19 09:23:16.489	2026-03-19 09:23:16.489
cmmx9is830013hxgh82zrdov8	Union SG	USG	USG	\N	Belgium	2026-03-19 09:23:16.489	2026-03-19 09:23:16.489
cmmx9is900014hxghqk1y3lzr	Villarreal	VIL	VIL	\N	Spain	2026-03-19 09:23:16.489	2026-03-19 09:23:16.489
cmmx9isbh0015hxghnextdjya	Borussia Dortmund	DOR	DOR	\N	Germany	2026-03-19 09:23:16.487	2026-03-19 09:23:16.487
cmmx9isde0016hxgh9195g1a3	Leverkusen	LEV	LEV	\N	Germany	2026-03-19 09:23:16.487	2026-03-19 09:23:16.487
cmn52uutm0001c355a9qppqv3	Ukraine	UKRAINE	UKR	\N	Ukraine	2026-03-24 20:38:53.578	2026-03-24 20:45:01.006
cmn52wce80002c355dosgfde3	Sweden	SWEDEN	SWE	\N	Sweden	2026-03-24 20:40:03.009	2026-03-24 20:45:01.006
\.


--
-- Data for Name: Tournament; Type: TABLE DATA; Schema: public; Owner: zubyk_tl
--

COPY public."Tournament" (id, name, slug, country, logo, "isActive", "seasonId", "createdAt", "updatedAt") FROM stdin;
cmmx9iqmi0002hxghsax1sjtz	Champions League	champions-league	Europe	CL	t	cmmx9iqiw0000hxghi27737t0	2026-03-19 09:23:16.17	2026-03-24 20:24:56.678
cmn522p9p0000c355fwomemdt	World Cup	world-cup	World	WC	t	cmmx9iqiw0000hxghi27737t0	2026-03-24 20:17:00.014	2026-03-24 20:43:48.507
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: zubyk_tl
--

COPY public."User" (id, name, email, image, "emailVerified", role, bio, "favoriteTeamId", "favoriteColor", "profileBanner", "displayName", "isProfilePublic", "createdAt", "updatedAt", "lastSeenAt") FROM stdin;
cmn1p87jb0000h01qi4448sue	Віталій Польник	polnuk15@gmail.com	https://lh3.googleusercontent.com/a/ACg8ocJD1bI0hd15sTxXoXF49hS_leZVNvAD5x4slyEtpB96mvAf4A=s96-c	2026-03-22 11:54:03.419	USER	\N	\N	\N	\N	\N	t	2026-03-22 11:54:03.421	2026-03-22 11:54:03.421	\N
cmn1ppgzb0001h01ql33ypakk	ivan labaychuk	labaychuk2001@gmail.com	https://lh3.googleusercontent.com/a/ACg8ocLbRSgMP6vLRMEz7os3jp2Wm4NEhPo3hXMlJhQB1eALILgUS1FV-g=s96-c	2026-03-22 12:07:28.783	USER	\N	\N	\N	\N	\N	t	2026-03-22 12:07:28.784	2026-03-22 12:07:28.784	\N
cmn3fwu4d0000gf1q9kp36zc4	Віталік Жига	zigavitalik@gmail.com	https://lh3.googleusercontent.com/a/ACg8ocJiq5qRzYTPWnRghAqIMsWIN9_jm3amVjpt0OrFEMOrudFQzA=s96-c	2026-03-23 17:08:48.247	USER	\N	\N	\N	\N	\N	t	2026-03-23 17:08:48.638	2026-03-23 17:08:48.638	\N
cmmyzumt10000dv290okxbj8q	Тарас Леонідович Зубик	zubyk_tl@fizmat.tnpu.edu.ua	https://lh3.googleusercontent.com/a/ACg8ocKT0NaNHqhDCtptYuYHGV6yVptrsc2sshUIyoBQI7jKWbckmA=s96-c	2026-03-24 19:34:58.64	USER	\N	\N	\N	\N	\N	t	2026-03-20 14:28:07.285	2026-03-24 19:35:00.304	\N
cmn7tu5k80000fa1qy0r5s7nc	Віктор Жила	viktormystore@gmail.com	https://lh3.googleusercontent.com/a/ACg8ocILsdIIJlsvzCzsvM4rz2bXzgFjfdM2kTBg5oqTF7cOSwQkzwOp=s96-c	2026-03-26 18:49:42.823	USER	Довбойоб	cmn52uutm0001c355a9qppqv3	Green	\N	My nick zhylavik	t	2026-03-26 18:49:42.824	2026-03-26 18:54:50.52	\N
cmmx9jkwv000hhxlpyfr2ssm8	Taras Zubyk	taszyb9@gmail.com	https://lh3.googleusercontent.com/a/ACg8ocIw4riwNdB8ZHI90ufwYnrk3wZE2DgNvXKD9NL8oJDY4hXVfg=s96-c	2026-03-20 14:22:12.336	ADMIN	\N	cmmx9ir39000bhxghzo41n8cq	Чорний	\N	Taras	t	2026-03-19 09:23:55.389	2026-03-29 18:08:34.865	\N
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: zubyk_tl
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
ce4080f2-e4da-4987-8085-a51fdcf1c21b	34f36dd88f545bf7350f89431280741bbef7985f34890dde54f2f4bfba80f0be	2026-03-19 09:18:29.098844+00	20260319091804_init	\N	\N	2026-03-19 09:18:06.141585+00	1
\.


--
-- Name: Account Account_pkey; Type: CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Account"
    ADD CONSTRAINT "Account_pkey" PRIMARY KEY (id);


--
-- Name: GameInvite GameInvite_pkey; Type: CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."GameInvite"
    ADD CONSTRAINT "GameInvite_pkey" PRIMARY KEY (id);


--
-- Name: GameMatch GameMatch_pkey; Type: CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."GameMatch"
    ADD CONSTRAINT "GameMatch_pkey" PRIMARY KEY (id);


--
-- Name: GameMember GameMember_pkey; Type: CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."GameMember"
    ADD CONSTRAINT "GameMember_pkey" PRIMARY KEY (id);


--
-- Name: Game Game_pkey; Type: CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Game"
    ADD CONSTRAINT "Game_pkey" PRIMARY KEY (id);


--
-- Name: Match Match_pkey; Type: CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Match"
    ADD CONSTRAINT "Match_pkey" PRIMARY KEY (id);


--
-- Name: Prediction Prediction_pkey; Type: CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Prediction"
    ADD CONSTRAINT "Prediction_pkey" PRIMARY KEY (id);


--
-- Name: Round Round_pkey; Type: CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Round"
    ADD CONSTRAINT "Round_pkey" PRIMARY KEY (id);


--
-- Name: Season Season_pkey; Type: CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Season"
    ADD CONSTRAINT "Season_pkey" PRIMARY KEY (id);


--
-- Name: Session Session_pkey; Type: CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_pkey" PRIMARY KEY (id);


--
-- Name: Team Team_pkey; Type: CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Team"
    ADD CONSTRAINT "Team_pkey" PRIMARY KEY (id);


--
-- Name: Tournament Tournament_pkey; Type: CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Tournament"
    ADD CONSTRAINT "Tournament_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: Account_provider_providerAccountId_key; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON public."Account" USING btree (provider, "providerAccountId");


--
-- Name: Account_userId_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "Account_userId_idx" ON public."Account" USING btree ("userId");


--
-- Name: GameInvite_code_key; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE UNIQUE INDEX "GameInvite_code_key" ON public."GameInvite" USING btree (code);


--
-- Name: GameInvite_expiresAt_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "GameInvite_expiresAt_idx" ON public."GameInvite" USING btree ("expiresAt");


--
-- Name: GameInvite_gameId_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "GameInvite_gameId_idx" ON public."GameInvite" USING btree ("gameId");


--
-- Name: GameMatch_gameId_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "GameMatch_gameId_idx" ON public."GameMatch" USING btree ("gameId");


--
-- Name: GameMatch_gameId_matchId_key; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE UNIQUE INDEX "GameMatch_gameId_matchId_key" ON public."GameMatch" USING btree ("gameId", "matchId");


--
-- Name: GameMatch_matchId_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "GameMatch_matchId_idx" ON public."GameMatch" USING btree ("matchId");


--
-- Name: GameMember_gameId_role_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "GameMember_gameId_role_idx" ON public."GameMember" USING btree ("gameId", role);


--
-- Name: GameMember_userId_gameId_key; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE UNIQUE INDEX "GameMember_userId_gameId_key" ON public."GameMember" USING btree ("userId", "gameId");


--
-- Name: GameMember_userId_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "GameMember_userId_idx" ON public."GameMember" USING btree ("userId");


--
-- Name: Game_inviteCode_key; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE UNIQUE INDEX "Game_inviteCode_key" ON public."Game" USING btree ("inviteCode");


--
-- Name: Game_linkedTournamentId_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "Game_linkedTournamentId_idx" ON public."Game" USING btree ("linkedTournamentId");


--
-- Name: Game_ownerId_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "Game_ownerId_idx" ON public."Game" USING btree ("ownerId");


--
-- Name: Game_slug_key; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE UNIQUE INDEX "Game_slug_key" ON public."Game" USING btree (slug);


--
-- Name: Game_visibility_status_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "Game_visibility_status_idx" ON public."Game" USING btree (visibility, status);


--
-- Name: Match_externalId_key; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE UNIQUE INDEX "Match_externalId_key" ON public."Match" USING btree ("externalId");


--
-- Name: Match_homeTeamId_awayTeamId_startTime_key; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE UNIQUE INDEX "Match_homeTeamId_awayTeamId_startTime_key" ON public."Match" USING btree ("homeTeamId", "awayTeamId", "startTime");


--
-- Name: Match_roundId_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "Match_roundId_idx" ON public."Match" USING btree ("roundId");


--
-- Name: Match_status_startTime_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "Match_status_startTime_idx" ON public."Match" USING btree (status, "startTime");


--
-- Name: Match_tournamentId_startTime_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "Match_tournamentId_startTime_idx" ON public."Match" USING btree ("tournamentId", "startTime");


--
-- Name: Prediction_gameId_matchId_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "Prediction_gameId_matchId_idx" ON public."Prediction" USING btree ("gameId", "matchId");


--
-- Name: Prediction_userId_gameId_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "Prediction_userId_gameId_idx" ON public."Prediction" USING btree ("userId", "gameId");


--
-- Name: Prediction_userId_gameId_matchId_key; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE UNIQUE INDEX "Prediction_userId_gameId_matchId_key" ON public."Prediction" USING btree ("userId", "gameId", "matchId");


--
-- Name: Round_slug_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "Round_slug_idx" ON public."Round" USING btree (slug);


--
-- Name: Round_tournamentId_name_key; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE UNIQUE INDEX "Round_tournamentId_name_key" ON public."Round" USING btree ("tournamentId", name);


--
-- Name: Round_tournamentId_order_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "Round_tournamentId_order_idx" ON public."Round" USING btree ("tournamentId", "order");


--
-- Name: Season_isCurrent_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "Season_isCurrent_idx" ON public."Season" USING btree ("isCurrent");


--
-- Name: Season_name_key; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE UNIQUE INDEX "Season_name_key" ON public."Season" USING btree (name);


--
-- Name: Session_sessionToken_key; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE UNIQUE INDEX "Session_sessionToken_key" ON public."Session" USING btree ("sessionToken");


--
-- Name: Session_userId_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "Session_userId_idx" ON public."Session" USING btree ("userId");


--
-- Name: Team_code_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "Team_code_idx" ON public."Team" USING btree (code);


--
-- Name: Team_name_key; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE UNIQUE INDEX "Team_name_key" ON public."Team" USING btree (name);


--
-- Name: Team_shortName_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "Team_shortName_idx" ON public."Team" USING btree ("shortName");


--
-- Name: Tournament_isActive_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "Tournament_isActive_idx" ON public."Tournament" USING btree ("isActive");


--
-- Name: Tournament_name_key; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE UNIQUE INDEX "Tournament_name_key" ON public."Tournament" USING btree (name);


--
-- Name: Tournament_seasonId_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "Tournament_seasonId_idx" ON public."Tournament" USING btree ("seasonId");


--
-- Name: Tournament_slug_key; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE UNIQUE INDEX "Tournament_slug_key" ON public."Tournament" USING btree (slug);


--
-- Name: User_displayName_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "User_displayName_idx" ON public."User" USING btree ("displayName");


--
-- Name: User_email_idx; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE INDEX "User_email_idx" ON public."User" USING btree (email);


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: zubyk_tl
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: Account Account_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Account"
    ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GameInvite GameInvite_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."GameInvite"
    ADD CONSTRAINT "GameInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: GameInvite GameInvite_gameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."GameInvite"
    ADD CONSTRAINT "GameInvite_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES public."Game"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GameMatch GameMatch_gameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."GameMatch"
    ADD CONSTRAINT "GameMatch_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES public."Game"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GameMatch GameMatch_matchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."GameMatch"
    ADD CONSTRAINT "GameMatch_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES public."Match"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GameMember GameMember_gameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."GameMember"
    ADD CONSTRAINT "GameMember_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES public."Game"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GameMember GameMember_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."GameMember"
    ADD CONSTRAINT "GameMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Game Game_linkedTournamentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Game"
    ADD CONSTRAINT "Game_linkedTournamentId_fkey" FOREIGN KEY ("linkedTournamentId") REFERENCES public."Tournament"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Game Game_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Game"
    ADD CONSTRAINT "Game_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Match Match_awayTeamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Match"
    ADD CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES public."Team"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Match Match_homeTeamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Match"
    ADD CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES public."Team"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Match Match_roundId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Match"
    ADD CONSTRAINT "Match_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES public."Round"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Match Match_tournamentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Match"
    ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES public."Tournament"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Prediction Prediction_gameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Prediction"
    ADD CONSTRAINT "Prediction_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES public."Game"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Prediction Prediction_matchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Prediction"
    ADD CONSTRAINT "Prediction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES public."Match"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Prediction Prediction_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Prediction"
    ADD CONSTRAINT "Prediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Round Round_tournamentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Round"
    ADD CONSTRAINT "Round_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES public."Tournament"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Session Session_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Tournament Tournament_seasonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."Tournament"
    ADD CONSTRAINT "Tournament_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES public."Season"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: User User_favoriteTeamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zubyk_tl
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_favoriteTeamId_fkey" FOREIGN KEY ("favoriteTeamId") REFERENCES public."Team"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: zubyk_tl
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON SEQUENCES TO zubyk_tl;


--
-- Name: DEFAULT PRIVILEGES FOR TYPES; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON TYPES TO zubyk_tl;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON FUNCTIONS TO zubyk_tl;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON TABLES TO zubyk_tl;


--
-- PostgreSQL database dump complete
--

\unrestrict JOm7l7a02RXPuHEfhGbH4icHGYjINH39Qit2OhLR8ORZm55thNdFEfXGOvDiR7N

