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

    const body = await request.clone().text()
    const {
      message_id,
      chat,
      photo,
      from
    } = JSON.parse(body).message;
    if (!photo) {
      const tgResponse = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        body: JSON.stringify({
          chat_id: chat.id,
          text: `Give Photo`,
          reply_to_message_id: message_id
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      return new Response('', {
        status: 200
      })
    }
    const largestPhoto = photo.reduce((acc, cur) => (cur.width * cur.height) > (acc.width * acc.height) ? cur : acc, {
      width: 0,
      height: 0
    });
    const fileId = largestPhoto.file_id;

    const response = await fetch(`https://api.telegram.org/bot${tgToken}/getFile?file_id=${fileId}`)
    const {
      result: {
        file_path
      }
    } = await response.json()

    const fileResponse = await fetch(`https://api.telegram.org/file/bot${tgToken}/${file_path}`)
    const fileBuffer = await fileResponse.arrayBuffer()

    const formData = new FormData()
    formData.append('file', new Blob([fileBuffer]))

    const uploadResponse = await fetch(graphApiUrl, {
      method: 'POST',
      body: formData
    })
    const uploadJson = await uploadResponse.json()
    const uploadUrl = `https://graph.org${uploadJson[0].src}`

    // Save the uploaded URL to a KV store using the user ID and a unique file ID as the key
    const fileIdParts = uploadJson[0].src.split('/')
    const fileUniqueId = fileIdParts[fileIdParts.length - 1].split('.')[0]
    const kvKey = `${from.id}_${fileUniqueId}`
    const secondsFromNow = 86400 // 24 hours
    await IMAGES.put(kvKey, uploadUrl, {
      expirationTtl: secondsFromNow
    }) //KV IMAGES

    const tgResponse = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      method: 'POST',
      body: JSON.stringify({
        chat_id: chat.id,
        text: `Uploaded photo: ${storyi}${chat.id}`,
        reply_to_message_id: message_id
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    })

    return new Response('', {
      status: 200
    })
  }

  async function handleMainRequest(request) {
    const path = new URL(request.url).pathname;
    const userId = path.substr(1);
    const kvStore = IMAGES; //KV IMAGES
    const keysObj = await kvStore.list({
      prefix: `${userId}_`,
      limit: 10
    });
    const keys = keysObj.keys;
    const names = keys.map(key => key.name);

    const userKeys = keys.filter(key => key.name.toLowerCase().startsWith(userId.toLowerCase() + "_"));

    /* If the request is for the general route, display all images
    if (userId === "") {
      const images = await Promise.all(keys.map(async (key) => {
        const imageUrl = await kvStore.get(key.name);
        //console.log("Image URL:", imageUrl);
        return { url: imageUrl, id: key.name.split("_")[1] };
      }));
      images.sort((a, b) => a.id - b.id);
      const html = generateHtml(images);
      return new Response(html, { headers: { "content-type": "text/html" } });
    }*/

    // If no keys belong to the user, return a response with the list of keys
    if (userKeys.length === 0) {
      return new Response(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Not Found</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html {
        height: 100%;
      }

      body {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        font-family: sans-serif;
        color: #888;
        height: 100%;
        margin: 0;
        padding: 0;
      }

      h1 {
        font-size: 2em;
        color: #555;
        font-weight: 400;
        margin-bottom: 0.5em;
      }

      p {
        font-size: 1em;
        margin: 0;
      }

      @media only screen and (max-width: 280px) {
        h1 {
          font-size: 1.5em;
        }
      }
    </style>
  </head>
  <body>
    <h1>ID Not Found</h1>
    <p>Sorry, the ID you are looking for could not be found. Please try again.</p>
  </body>
</html>`, {
        headers: {
          'Content-Type': 'text/html'
        },
        status: 404
      })
    }

    const images = await Promise.all(userKeys.map(async (key) => {
      const imageUrl = await kvStore.get(key.name);
      return {
        url: imageUrl,
        id: key.name.split("_")[1]
      };
    }));
    images.sort((a, b) => a.id - b.id);
    const html = generateHtml(images);
    return new Response(html, {
      headers: {
        "content-type": "text/html"
      }
    });
  }

  function generateHtml(images) {
    return `<!DOCTYPE html>
<html>
  <head>
    <title>Slideshow </title>
    <style>
      body {
        margin: 0;
        padding: 0;
        font-family: sans-serif;
        background-color: #f5f5f5;
        /* Change body background color to distinguish from buttons */
      }

      #slideshow-container {
        width: 100%;
        height: 100vh;
        position: relative;
        overflow: hidden;
        cursor: pointer;
        /* Add cursor pointer to the slideshow container */
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
  </head>
  <body>
    <div id="slideshow-container" onclick="nextSlide();"> ${images .map( (image, index) => ` <div class="slide ${index === 0 ? 'active' : ''}" id="${index}">
        <img src="${image.url}" alt="Slide ${index + 1}">
      </div>` ) .join('')} </div>
    <script>
      const slides = document.querySelectorAll('.slide');
      const buttons = document.querySelectorAll('.slideshow-button');
      let currentSlideIndex = 0;

      function startSlideshow() {
        setInterval(() => {
          nextSlide();
        }, 5000);
      }

      function nextSlide() {
        slides[currentSlideIndex].classList.remove('active');
        currentSlideIndex = (currentSlideIndex + 1) % slides.length;
        slides[currentSlideIndex].classList.add('active');
      }

      function init() {
        startSlideshow();
      }
      window.addEventListener('load', init);
    </script>
  </body>
</html>`;
  }
})();
