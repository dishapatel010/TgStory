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
      photo,
      video,
      from
    } = body.message;
    let USERNAME;
    if (from.username) {
      USERNAME = from.username.toLowerCase();
    } else {
      USERNAME = from.id
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
    const kvKey = `${USERNAME}_${fileUniqueId}`
    const secondsFromNow = 86400 // 24 hours
    if (photo && photo.length > 0) {
      await IMAGES.put(kvKey, uploadUrl, {
        expirationTtl: secondsFromNow
      }) //KV IMAGES
    } else if (video) {
      await IMAGES.put(kvKey, uploadUrl, {
        expirationTtl: secondsFromNow
      }) // VIDTOKV
    }

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
      return new Response(`404 not found`, {
        headers: {
          'Content-Type': 'text/html'
        },
        status: 404
      });
    }

    const kvStore = IMAGES; //KV IMAGES
    const keysObj = await kvStore.list({
      prefix: `${userId}_`,
      limit: 10
    });
    const keys = keysObj.keys;
    const names = keys.map(key => key.name);

    const userKeys = keys.filter(key => key.name.toLowerCase().startsWith(userId.toLowerCase() + "_"));

    // If no keys belong to the user, return a response with the list of keys
    if (userKeys.length === 0) {
      return new Response(`<!DOCTYPE html><html lang="en"> <head> <meta charset="UTF-8"> <title>Not Found</title> <meta name="viewport" content="width=device-width, initial-scale=1"> <style> html { height: 100%; } body { display: flex; flex-direction: column; justify-content: center; align-items: center; font-family: sans-serif; color: #888; height: 100%; margin: 0; padding: 0; } h1 { font-size: 2em; color: #555; font-weight: 400; margin-bottom: 0.5em; } p { font-size: 1em; margin: 0; } @media only screen and (max-width: 280px) { h1 { font-size: 1.5em; } } </style> </head> <body> <h1>ID Not Found</h1> <p>Sorry, the ID you are looking for could not be found. Please try again.</p> </body></html>`, {
        headers: {
          'Content-Type': 'text/html'
        },
        status: 404
      })
    }

    const images = [];
    const videos = [];

    // Iterate through userKeys and populate images and videos arrays
    for (const key of userKeys) {
      const url = await kvStore.get(key.name);

      if (url.endsWith(".jpg") || url.endsWith(".jpeg") || url.endsWith(".png")) {
        images.push({
          url: url,
          id: key.name.split("_")[1]
        });
      } else if (url.endsWith(".mp4")) {
        videos.push({
          url: url,
          id: key.name.split("_")[1]
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
        <amp-story-page id="${index}">
          <amp-story-grid-layer template="fill">
            <amp-video autoplay
              width="720"
              height="1280"
              layout="responsive"
              poster="${item.url.replace(".mp4", ".jpg")}">
              <source src="${item.url}" type="video/mp4">
            </amp-video>
          </amp-story-grid-layer>
        </amp-story-page>
      `;
          } else {
            // If it's an image, include an `amp-img` element
            return `
        <amp-story-page id="${index}">
          <amp-story-grid-layer template="fill">
            <amp-img src="${item.url}" alt="Slide ${index + 1}" layout="fill" object-fit="contain"></amp-img>
            <amp-image-lightbox layout="nodisplay">
              <amp-img src="${item.url}" layout="responsive"></amp-img>
            </amp-image-lightbox>
          </amp-story-grid-layer>
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
  <html>
    <head>
      <title>${userId} | Fstoriesbot</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,minimum-scale=1">
      <meta property="og:title" content="${userId}'s stories">
      <meta property="og:description" content="Check out ${userId}'s latest stories!">
      <meta property="og:image" content="https://graph.org/file/254f49876c30307a36db7.png">
      <meta property="og:url" content="https://github.com/dishapatel010/TgStory">
      <meta property="og:type" content="website">
      <script async src="https://cdn.ampproject.org/v0.js"></script>
      <script async custom-element="amp-story" src="https://cdn.ampproject.org/v0/amp-story-1.0.js"></script>
      <style>
      body {
        margin: 0;
        padding: 0;
        font-family: sans-serif;
        background-color: #f5f5f5;
      }
      #slideshow-container {
        width: 100%;
        height: 100vh;
        position: relative;
        overflow: hidden;
        cursor: pointer;
      }
      .slide {
        width: 100%;
        height: 100%;
        position: absolute;
        top: 0;
        left: 0;
        z-index: 10;
        opacity: 0;
        transition: opacity 0.5s;
        display: flex;
        justify-content: center;
        align-items: center;
        text-align: center;
        background-color: #000;
        color: #fff;
        font-size: 3em;
      }
      .slide.active {
        opacity: 1;
      }
      img {
        max-width: 100%;
        max-height: 100%;
      }
      #slideshow-navigation {
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .slideshow-button {
        background-color: #fff;
        border: none;
        border-radius: 50%;
        width: 10px;
        height: 10px;
        margin: 10px;
        cursor: pointer;
      }
      .slideshow-button.active {
        background-color: #000;
      }
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
    </style>
<style amp-custom>
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
      <amp-story standalone
                 title="Fstoriesbot"
                 publisher="IsThisUser"
                 publisher-logo-src="https://example.com/logo.png"
                 poster-portrait-src="https://example.com/poster-portrait.png"
                 poster-square-src="https://example.com/poster-square.png">
        ${mediaHtml}
      </amp-story>
      <script>
const slides = document.querySelectorAll('.slide');
const buttons = document.querySelectorAll('.slideshow-button');
let currentSlideIndex = 0;

function startSlideshow() {
  setInterval(() => {
    updateSlideshow();
  }, 5000);
}

function updateSlideshow() {
  slides[currentSlideIndex].classList.remove('active');
  buttons[currentSlideIndex].classList.remove('active');

  currentSlideIndex = (currentSlideIndex + 1) % slides.length;

  slides[currentSlideIndex].classList.add('active');
  buttons[currentSlideIndex].classList.add('active');
}

function goToSlide(index) {
  if (index < 0 || index >= slides.length) {
    return;
  }

  slides[currentSlideIndex].classList.remove('active');
  buttons[currentSlideIndex].classList.remove('active');

  currentSlideIndex = index;

  slides[currentSlideIndex].classList.add('active');
  buttons[currentSlideIndex].classList.add('active');
}

function init() {
  startSlideshow();

  for (let i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', () => {
      goToSlide(i);
    });
  }
}

window.addEventListener('load', init);
</script> 
</body>
</html>`;
  }
})();
