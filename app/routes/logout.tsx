import { type ActionFunctionArgs } from "react-router";
import { logout } from "~/lib/session.server";

export async function action({ request }: ActionFunctionArgs) {
  return logout(request);
}