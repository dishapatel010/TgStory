(() => {
  addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event.request));
  });

  async function handleRequest(request) {
    const url = new URL(request.url);

    // If the request path starts with /bot, handle it with the bot function
    if (url.pathname.startsWith("/bot")) {
      return handleRequestBot(request);
    }

    // Otherwise, handle the request with the main function
    return handleMainRequest(request);
  }

  async function handleRequestBot(request) {
    const customUsernames = [
      '622396347=panda',
      '5071059420=baka'
    ]

    const tgToken = TOKEN // ENV VAR
    const graphApiUrl = 'https://graph.org/upload'
    const storyi = DOMAIN // ENV VAR

    const originalRequest = request.clone()
    const body = await originalRequest.json()
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
    let USERNAME;
    const userIndex = customUsernames.findIndex((elem) => elem.startsWith(from.id));
    if (userIndex !== -1) {
      USERNAME = customUsernames[userIndex].split('=')[1];
    } else if (from.username) {
      USERNAME = from.username.toLowerCase();
    } else {
      USERNAME = from.id
    }

    if (text === '/delete') {
      const delkey = `${USERNAME}|`;
      const delx = await IMAGES.get(delkey, 'json');
      if (!delx) {
        return new Response(
          JSON.stringify({
            method: "sendMessage",
            chat_id: chat.id,
            text: `You don't have any stories saved.`,
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

      // Delete the user's KV store entry
      await IMAGES.delete(delkey);

      return new Response(
        JSON.stringify({
          method: "sendMessage",
          chat_id: chat.id,
          text: `All your stories have been deleted.`,
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

    if (!fileId) {
      return new Response(
        JSON.stringify({
          method: "sendMessage",
          chat_id: chat.id,
          text: "Sorry, I could not find any files in your message. Please try again with an image or video file.",
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

    const response = await fetch(`https://api.telegram.org/bot${tgToken}/getFile?file_id=${fileId}`)
    const {
      result: {
        file_path,
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

    // Save the uploaded URL to a KV store using the user ID and a unique file ID as the key
    const fileIdParts = uploadJson[0].src.split('/')
    const fileUniqueId = fileIdParts[fileIdParts.length - 1].split('.')[0]
    const kvKey = `${USERNAME}|`;
    const MAX_URLS = 20;
    let urls = await IMAGES.get(kvKey, 'json');
    if (!urls) {
      // If there are no saved URLs for this user, create a new empty array
      urls = [];
    }
    // Add the new URL to the beginning of the array
    urls.unshift(uploadUrl);
    // Limit the array to a maximum of 20 elements
    if (urls.length > MAX_URLS) {
      urls = urls.slice(0, MAX_URLS);
    }
    // Save the updated array back to KV as JSON
    await IMAGES.put(kvKey, JSON.stringify(urls), {
      metadata: {
        type: 'json'
      }
    });


    return new Response(
      JSON.stringify({
        method: "sendMessage",
        chat_id: chat.id,
        text: `Your story has been uploaded successfully! Share the link with your friends:\n[TgStory](${storyi}${USERNAME})`,
        parse_mode: "MARKDOWN",
        disable_web_page_preview: "False",
        reply_to_message_id: message_id
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8'
        }
      })
  }

  async function handleMainRequest(request) {
    const path = new URL(request.url).pathname;
    const pathParts = path.split("/").filter(Boolean);

    // Get the userId and isInstantView based on the pathParts
    let userId, isInstantView;
    if (pathParts.length === 1) {
      userId = pathParts[0].toLowerCase();
      isInstantView = false;
    } else if (pathParts.length === 2 && pathParts[1].toLowerCase() === "iv") {
      userId = pathParts[0].toLowerCase();
      isInstantView = true;
    } else {
      // Invalid URL
      return new Response(`<!DOCTYPE html>
<html lang="en">
  <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes">
        <title>Welcome to TG-Stories Bot</title>
        <meta name="author" content="TG-Stories Bot">
        <meta name="description" content="Share images & videos to Friends">
        <meta property="og:title" content="TG-Stories Bot">
        <meta property="og:description" content="Share images & videos to friends">
        <meta property="og:image" content="https://graph.org/file/254f49876c30307a36db7.png">
        <meta property="og:site_name" content="Nexiuo's" />
        <meta property="og:type" content="article">
        <meta property="og:locale" content="en_IN" />
        <meta property="article:published_time" content="2023-03-12T21:55:52Z">
        <meta property="article:author" content="TG-Stories Bot">
        <meta property="article:publisher" content="TG-Stories Bot">
        <meta property="article:section" content="Social Media">
        <meta property="article:tag" content="Telegram">
        <meta property="article:tag" content="Instant View">
        <meta property="tg:site_verification" content="g7j8/rPFXfhyrq5q0QQV7EsYWv4="/>
        <meta property="article:tag" content="TG-Stories Bot">
        <link rel="canonical" href="https://t.me/fstoriesbot">
    <style>
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 0;
        background-color: #f2f2f2;
        color: #222;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }

      .container {
        max-width: 800px;
        margin: auto;
        padding: 40px;
        box-sizing: border-box;
        background-color: #fff;
        border-radius: 4px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
        color: #222;
        flex-grow: 1;
      }

      h1,
      p {
        text-align: center;
      }

      h1 {
        font-size: 48px;
        color: #0047ab;
      }

      p {
        font-size: 24px;
        margin-bottom: 20px;
        line-height: 1.5;
      }

      button {
        display: block;
        margin: 0 auto;
        padding: 10px 20px;
        font-size: 24px;
        color: #fff;
        background-color: #0047ab;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }

      button:hover {
        background-color: #002d5c;
      }

      footer {
        color: #fff;
        background-color: #222;
        padding: 10px;
        text-align: center;
        font-size: 16px;
      }

      footer a {
        color: #fff;
        text-decoration: none;
      }

      footer.dark {
        background-color: #111;
      }
    </style>
  </head>

  <body>
    <div class="container">
      <h1>Welcome to TG-Stories Bot</h1>
      <p>Tg-Story is a simple Telegram bot that allows you to easily share images and videos with your friends. The bot also supports usernames and instant view, allowing your friends to quickly access your content without having to leave the app.</p>
      <button onClick="window.location.href='https://telegram.dog/Fstoriesbot'">Start Sharing</button>
    </div>
    <footer>
      <p>&copy; 2023 TG-Stories Bot &bull; <a href="https://github.com/dishapatel010/TgStory">Source Code</a></p>
    </footer>
    <script>
      const footer = document.querySelector('footer');
      const body = document.querySelector('body');

      function toggleTheme() {
        if (body.classList.contains('dark')) {
          body.classList.remove('dark');
          footer.classList.remove('dark');
        } else {
          body.classList.add('dark');
          footer.classList.add('dark');
        }
      }

      footer.addEventListener('click', toggleTheme);
    </script>
  </body>
</html>`, {
        headers: {
          'Content-Type': 'text/html'
        },
        status: 200
      });
    }

    const uname = `${userId}|`;
    let urlList = await IMAGES.get(uname, 'json');
    if (!urlList) {
      return new Response(`<!DOCTYPE html>
<html lang="en">
  <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes">
        <title>Welcome to TG-Stories Bot</title>
        <meta name="author" content="TG-Stories Bot">
        <meta name="description" content="Share images & videos to Friends">
        <meta property="og:title" content="TG-Stories Bot">
        <meta property="og:description" content="Share images & videos to friends">
        <meta property="og:image" content="https://graph.org/file/254f49876c30307a36db7.png">
        <meta property="og:site_name" content="nexiuo's" />
        <meta property="og:type" content="article">
        <meta property="og:locale" content="en_IN" />
        <meta property="article:published_time" content="2023-03-12T21:55:52Z">
        <meta property="article:author" content="TG-Stories Bot">
        <meta property="article:publisher" content="TG-Stories Bot">
        <meta property="article:section" content="Social Media">
        <meta property="article:tag" content="Telegram">
        <meta property="article:tag" content="Instant View">
        <meta property="tg:site_verification" content="g7j8/rPFXfhyrq5q0QQV7EsYWv4="/>
        <meta property="article:tag" content="TG-Stories Bot">
        <link rel="canonical" href="https://t.me/fstoriesbot">
    <style>
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 0;
        background-color: #f2f2f2;
        color: #222;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }

      .container {
        max-width: 800px;
        margin: auto;
        padding: 40px;
        box-sizing: border-box;
        background-color: #fff;
        border-radius: 4px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
        color: #222;
        flex-grow: 1;
      }

      h1,
      p {
        text-align: center;
      }

      h1 {
        font-size: 48px;
        color: #0047ab;
      }

      p {
        font-size: 24px;
        margin-bottom: 20px;
        line-height: 1.5;
      }

      button {
        display: block;
        margin: 0 auto;
        padding: 10px 20px;
        font-size: 24px;
        color: #fff;
        background-color: #0047ab;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }

      button:hover {
        background-color: #002d5c;
      }

      footer {
        color: #fff;
        background-color: #222;
        padding: 10px;
        text-align: center;
        font-size: 16px;
      }

      footer a {
        color: #fff;
        text-decoration: none;
      }

      footer.dark {
        background-color: #111;
      }
    </style>
  </head>

  <body>
    <div class="container">
      <h1>Welcome to TG-Stories Bot</h1>
      <p>Tg-Story is a simple Telegram bot that allows you to easily share images and videos with your friends. The bot also supports usernames and instant view, allowing your friends to quickly access your content without having to leave the app.</p>
      <button onClick="window.location.href='https://telegram.dog/Fstoriesbot'">Start Sharing</button>
    </div>
    <footer>
      <p>&copy; 2023 TG-Stories Bot &bull; <a href="https://github.com/dishapatel010/TgStory">Source Code</a></p>
    </footer>
    <script>
      const footer = document.querySelector('footer');
      const body = document.querySelector('body');

      function toggleTheme() {
        if (body.classList.contains('dark')) {
          body.classList.remove('dark');
          footer.classList.remove('dark');
        } else {
          body.classList.add('dark');
          footer.classList.add('dark');
        }
      }

      footer.addEventListener('click', toggleTheme);
    </script>
  </body>
</html>`, {
        headers: {
          'Content-Type': 'text/html'
        },
        status: 200
      })
    }

    let uarr = (urlList);
    const images = [];
    const videos = [];

    // Iterate through the urls and populate images and videos arrays
    for (const [index, url] of uarr.entries()) {
      if (url.endsWith(".jpg") || url.endsWith(".jpeg") || url.endsWith(".png")) {
        images.push({
          url: url,
          id: index + 1
        });
      } else if (url.endsWith(".mp4")) {
        videos.push({
          url: url,
          id: index + 1
        });
      }
    }

    // Merge the images and videos arrays
    const media = [...images, ...videos];

    // Sort the media array by ID
    media.sort((a, b) => a.id - b.id);

    let html;

    if (isInstantView) {
      // Generate the HTML for the media items using Instant View template
      const mediaHtml = media
        .map((item, index) => {
          if (item.url.endsWith(".mp4")) {
            // If it's a video, include an `video` element
            return `
            <video controls="" loop="" width="100%" height="100%">
              <source src="${item.url}" type="video/mp4">
            </video>
        `;
          } else {
            // If it's an image, include an `img` element
            return `
          <div class="image-container">
            <img src="${item.url}" width="720" height="1280" alt="Slide ${index + 1}">
          </div>
        `;
          }
        })
        .join("");

      html = generateInstantViewHtml(mediaHtml, userId);
    } else {
      // Generate the HTML for the media items using regular template
      const mediaHtml = media
        .map((item, index) => {
          if (item.url.endsWith(".mp4")) {
            // If it's a video, include an `amp-video` element
            return `
        <amp-story-page id="page-${index}">
          <amp-story-grid-layer template="fill">
            <amp-video autoplay
              width="720"
              height="1280"
              layout="responsive"
              object-fit="contain"
              poster="${item.url.replace(".mp4", ".jpg")}">
              <source src="${item.url}" type="video/mp4">
            </amp-video>
          </amp-story-grid-layer>
        </amp-story-page>
      `;
          } else {
            // If it's an image, include an `amp-story-grid-layer` with the `amp-image-lightbox` inside
            return `
        <amp-story-page id="page-${index}">
          <amp-story-grid-layer template="fill">
            <div id="slide-${index}" role="button" tabindex="0" on="tap:lightbox-${index}">
              <amp-img src="${item.url}" alt="Slide ${index + 1}" layout="fill" object-fit="contain"></amp-img>
              <amp-img
                src="${item.url}"
                layout="fill"
                object-fit="contain"
                alt="Open full-screen"
              ></amp-img>
            </div>
          </amp-story-grid-layer>
          <amp-story-page-outlink layout="nodisplay">
    <a href="https://github.com/dishapatel010/TgStory">Tg-Story</a>
</amp-story-page-outlink>
        </amp-story-page>
      `;
          }
        })
        .join("");

      html = generateRegularHtml(mediaHtml, userId);
    }

    return new Response(html, {
      headers: {
        "content-type": "text/html"
      }
    });
  }

  function generateInstantViewHtml(mediaHtml, userId) {
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes">
        <meta name="title" content="${userId}'s stories">
        <meta name="author" content="${userId}">
        <meta name="description" content="Check out ${userId}'s latest stories!">
        <meta property="og:title" content="${userId}'s stories">
        <meta property="og:description" content="Check out ${userId}'s latest stories!">
        <meta property="og:image" content="https://graph.org/file/254f49876c30307a36db7.png">
        <meta property="og:site_name" content="TG-Stories" />
        <meta property="og:type" content="article">
        <meta property="og:locale" content="en_IN" />
        <meta property="article:published_time" content="${new Date().toISOString()}">
        <meta property="article:author" content="${userId}">
        <meta property="article:publisher" content="Fstoriesbot">
        <meta property="article:section" content="Social Media">
        <meta property="article:tag" content="Telegram">
        <meta property="article:tag" content="Instant View">
        <meta property="tg:site_verification" content="g7j8/rPFXfhyrq5q0QQV7EsYWv4="/>
        <meta property="article:tag" content="Stories">
        <link rel="canonical" href="https://t.me/fstoriesbot">
        <title>${userId}'s stories | Fstoriesbot</title>
        <style>
          body {
            margin: 0;
            padding: 0;
            background-color: #000000;
            color: #ffffff;
          }
          .media-container {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
          }
          .image-container {
            margin: 0;
            padding: 0;
            display: block;
          }
          figure {
            margin: 0;
            padding: 0;
            display: block;
          }
          img {
            max-width: 100%;
            height: auto;
          }
          video {
            max-width: 100%;
            height: auto;
          }
        </style>
      </head>
      <body>
        <header>
          <h1>${userId}'s stories</h1>
          <p>By ${userId} • Fstoriesbot</p>
          <hr>
        </header>
        <div class="article">
        <article class="article__content">
          ${mediaHtml}
        </article>
        <footer>
          <hr>
          <p>Powered by <a href="https://telegram.dog/nexiuo" target="_blank">Instant View</a></p>
        </footer>
      </body>
    </html>`;
  }

  function generateRegularHtml(mediaHtml, userId) {
    return `<!DOCTYPE html>
  <html ⚡>
    <head>
      <title>${userId} | Fstoriesbot</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,minimum-scale=1">
      <meta property="og:title" content="${userId}'s stories">
      <meta property="og:description" content="Check out ${userId}'s latest stories!">
      <meta property="og:image" content="https://graph.org/file/254f49876c30307a36db7.png">
      <meta property="og:url" content="https://github.com/dishapatel010/TgStory">
      <meta property="og:type" content="website">
      <link rel="canonical" href="https://github.com/dishapatel010/TgStory">
      <script async src="https://cdn.ampproject.org/v0.js"></script>
      <script async custom-element="amp-video" src="https://cdn.ampproject.org/v0/amp-video-0.1.js"></script>
      <script async custom-element="amp-image-lightbox" src="https://cdn.ampproject.org/v0/amp-image-lightbox-0.1.js"></script>
      <script async custom-element="amp-story" src="https://cdn.ampproject.org/v0/amp-story-1.0.js"></script>
      <style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style><noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>
      <style amp-custom>
      amp-story-grid-layer {
        align-items: center;
        justify-content: center;
      }
      amp-story-page amp-img {
        object-fit: cover;
      }
      @media screen and (max-width: 768px) {
        .slide {
          font-size: 2em;
        }
      }
      @media screen and (max-width: 480px) {
        .slide {
          font-size: 1.5em;
        }
      }
     /* Set a standard size for amp-img elements */
        amp-img {
          max-width: 100vw;
          max-height: 90vh;
        }

        /* Rotate the image if it exceeds the standard size */
        amp-img[height][width] {
          object-fit: contain;
          transform: rotate(90deg);
        }
      </style>
    </head>
  <body>
      <amp-story supports-landscape
                 standalone
                 title="Fstoriesbot"
                 publisher="IsThisUser"
                 publisher-logo-src="https://example.com/logo.png"
                 poster-portrait-src="https://example.com/poster-portrait.png"
                 poster-square-src="https://example.com/poster-square.png">
        ${mediaHtml}
      </amp-story>
</body>
</html>`;
  }
})();
