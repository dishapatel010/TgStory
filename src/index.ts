import { Env } from './types';
import handleRequestBot from './bot';
import handleMainRequest from './main';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/bot")) {
      return handleRequestBot(request, env);
    }

    return handleMainRequest(request, env);
  }
};
