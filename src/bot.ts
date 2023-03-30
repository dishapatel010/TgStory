import { Env } from './types';

async function handleRequestBot(request: Request, env: Env): Promise<Response> {
  const customUsernames: string[] = [
    '622396347=panda',
    '803200597=senpai',
    '866874030=araara',
    '5071059420=baka'
  ];

  const tgToken: string = env.TOKEN;
  const graphApiUrl: string = 'https://graph.org/upload';
  const storyi: string = env.DOMAIN;

  const originalRequest: Request = request.clone();
  const body: any = await originalRequest.json();

  if (!body || !body.message) {
    return new Response(`ok`, {
      headers: {
        'Content-Type': 'text/html'
      },
      status: 200
    });
  }

  const {
    message_id,
    chat,
    text,
    photo,
    video,
    from
  } = body.message;

  let USERNAME: string;
  const userIndex: number = customUsernames.findIndex((elem: string) => elem.startsWith(from.id.toString()));

  if (userIndex !== -1) {
    USERNAME = customUsernames[userIndex].split('=')[1];
  } else if (from.username) {
    USERNAME = from.username.toLowerCase();
  } else {
    USERNAME = from.id.toString();
  }

  if (text === '/about') {
    // Customize these variables with your bot information
    const botName: string = '@Fstoriesbot | TgStory';
    const botVersion: string = '1.1';
    const developerName: string = '@IsThisUser';
    const description: string = 'Easily share images and videos with your friends.';
    const recentUpdates: string[] = [
      '- [feat]: customUsernames',
      '- [misc]: use delimiter |',
      '- note: database was rest on 18|03|2023 6:30 PM (18:30) GMT'
    ];

    const responseMessage: string = `
*${storyi}*
*${USERNAME}*
*${botName}*
Version: ${botVersion}
Developed by: ${developerName}
Description: ${description}
      
Recent Updates:
${recentUpdates.join('\n')}
    `;

    return new Response(
      JSON.stringify({
        method: "sendMessage",
        chat_id: chat.id,
        text: responseMessage,
        parse_mode: "MARKDOWN",
        disable_web_page_preview: "True",
        reply_to_message_id: message_id
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8'
        }
      });
  }

  if (!photo && !video) {
    return new Response(
      JSON.stringify({
        method: "sendMessage",
        chat_id: chat.id,
        text: `Hello, Stories in Telegram. Send new photos or videos & share the link with your friends - and you're done!\n\nDrop Star ⭐ [TgStory](https://github.com/dishapatel010/TgStory)`,
        parse_mode: "MARKDOWN",
        disable_web_page_preview: "True",
        reply_to_message_id: message_id
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8'
        }
      })
  }

  let largestFile;
  let fileId;
  if (photo && photo.length > 0) {
    const largestFile = photo.reduce((acc, cur) => (cur.width * cur.height) > (acc.width * acc.height) ? cur : acc, {
      width: 0,
      height: 0
    });
    fileId = largestFile.file_id;
  } else if (video) {
    fileId = video.file_id;
  }

  const response = await fetch(`https://api.telegram.org/bot${tgToken}/getFile?file_id=${fileId}`)
  const {
    result: {
      file_path,
      file_unique_id,
      file_size
    }
  } = await response.clone().json()

  if (file_size > 5000000) { // 5 MB
      return new Response(
        JSON.stringify({
          method: "sendMessage",
          chat_id: chat.id,
          text: `Sorry, the file size is too large. Please upload a file that is smaller than 5 MB.`,
          parse_mode: "MARKDOWN",
          disable_web_page_preview: "True",
          reply_to_message_id: message_id
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=UTF-8'
          }
        })
    }

    const fileResponse = await fetch(`https://api.telegram.org/file/bot${tgToken}/${file_path}`)
  const fileBuffer = await fileResponse.clone().arrayBuffer()

  const formData = new FormData()
  formData.append('file', new Blob([fileBuffer]))

  const uploadResponse = await fetch(graphApiUrl, {
    method: 'POST',
    body: formData
  })

  const uploadJson = await uploadResponse.clone().json()
  const uploadUrl = `https://graph.org${uploadJson[0].src}`

  // Check if the same file unique ID has already been saved for this user
  const stmt = await env.DB.prepare('SELECT COUNT(*) AS count FROM TGSTORY WHERE user_id = ? AND unique_id = ?').bind(from.id, file_unique_id);
const resultx = await stmt.first();

if (resultx.count > 0) {
  return new Response(
    JSON.stringify({
      method: "sendMessage",
      chat_id: chat.id,
      text: `This file is already in the database.`,
      parse_mode: "MARKDOWN",
      disable_web_page_preview: "True",
      reply_to_message_id: message_id
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=UTF-8'
      }
    });
}

  // If the number of saved URLs is already at the limit, delete the oldest entry
  const MAX_URLS = 20;
  const countQuery2 = await env.DB.prepare('SELECT COUNT(*) as count FROM TGSTORY WHERE user_id = ?').bind(from.id).all();
  const savedCount2 = countQuery2.count;

  if (savedCount2 >= MAX_URLS) {
    const oldestEntry = await env.DB.prepare('SELECT * FROM TGSTORY WHERE user_id = ? ORDER BY id LIMIT 1').bind(from.id).all();
    await env.DB.prepare('DELETE FROM TGSTORY WHERE id = ?').bind(oldestEntry.id).run();
  }

  // Save the uploaded URL to a DB using the user ID and a unique file ID as the key
  await env.DB.prepare('INSERT INTO TGSTORY (user_id, url, unique_id, file_size) VALUES (?, ?, ?, ?)').bind(from.id, uploadUrl, file_unique_id, file_size).run();

  // Send the link to the uploaded image/video as a reply to the user's message
  return new Response(
    JSON.stringify({
      method: "sendMessage",
      chat_id: chat.id,
      text: `done`,
      parse_mode: "MARKDOWN",
      disable_web_page_preview: "True",
      reply_to_message_id: message_id
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=UTF-8'
      }
    });
}

export default handleRequestBot;
