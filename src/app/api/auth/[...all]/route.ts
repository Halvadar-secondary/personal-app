import { getAuth } from "@/server/auth/instance";

export function GET(req: Request) {
  return getAuth().handler(req);
}

export function POST(req: Request) {
  return getAuth().handler(req);
}
