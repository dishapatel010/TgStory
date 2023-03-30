import { Env } from './types';

async function handleMainRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/db/all") {
    const { results } = await env.DB.prepare("SELECT * FROM TGSTORY").all();
    return Response.json(results);
  }

  return new Response(
    "Call /db/all to see db\nCall /bot botRoute"
  );
}

export default handleMainRequest;
