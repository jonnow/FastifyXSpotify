let authCode, authState, accessToken

require('dotenv').config()

const fs = require('fs')
const path = require('path')
const ERRORLOG = process.env.ERRORLOG

const fastify = require('fastify')({
  logger: true
})
const cookie = require('@fastify/cookie')
const querystring = require('querystring')
const session = require('@fastify/session')
const fetch = require('node-fetch')
const spotifyURLs = require('./utilities/spotifyURLs')

const client_id = process.env.CLIENT_ID
const client_secret = process.env.CLIENT_SECRET
const redirect_uri = process.env.REDIRECT_URI // this is only for validation, specified in the app page on Spotify

let user_id

fastify.register(require('@fastify/view'), {
    engine: {
        handlebars: require('handlebars')
    },
    layout: 'templates/layout.hbs',
    includeViewExtension: true,
    root: path.join(__dirname, 'views/'),
    viewExt: 'hbs'
})

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/public/'
})

fastify.register(require('@fastify/formbody'));

fastify.register(cookie)
fastify.register(session, { secret: 'a scret with a secret with minimum length of 32 characters'})

fastify.get('/', async(req, reply) => {
    return reply.view('index.hbs', {name: 'Jonathan!'})
})

fastify.get('/login', async( req, reply) => {
    // const data = await response.json()
    let state = generateRandomString(16);
    let scope = 'user-read-private user-read-email playlist-modify-private playlist-modify-public'

    reply.redirect('https://accounts.spotify.com/authorize?' + querystring.stringify({
        response_type: 'code',
        client_id: client_id,
        scope: scope,
        redirect_uri: redirect_uri,
        state: state
      })
    )
})

fastify.get('/refresh_token', async(req, reply) => {
  var refresh_token = req.query.refresh_token

  const params = new URLSearchParams();
  params.append('grant_type','refresh_token')
  params.append('refresh_token', refresh_token)

  const response = await fetch(spotifyURLs.authorizationToken, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + base64data,
    },
    body: params,
    json: true
  })

  const data = await response.json()
  console.log('got to here!!!')
})

fastify.get('/letmein', async(req, reply) => {
    if(Object.keys(req.query).length > 0) {
      authCode = req.query.code // An authorization code that can be exchanged for an Access Token.
      authState = req.query.state // The value of the state parameter supplied in the request.

      let buff = Buffer.from(client_id + ':' + client_secret);
      let base64data = buff.toString('base64')

      const params = new URLSearchParams();
      params.append('grant_type','authorization_code')
      params.append('code', authCode)
      params.append('redirect_uri', redirect_uri)

      const response = await fetch(spotifyURLs.authorizationToken, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + base64data,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
        json: true
      })

      if(response.ok) {
        let data = await response.json()
        const { access_token, token_type } = data;

        const me = await fetch(spotifyURLs.me, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${access_token}`
          },
        })

        const meData = await me.json()
        console.log('My data ', meData)
        user_id = meData.id

        reply.setCookie('access_token', access_token)
        reply.setCookie('user_id', user_id)
        
        return reply.view('logged-in.hbs', meData)
        
      } else {
        throw new Error('Response error: ' + response.status + ' ' + response.statusText)
      }
    } else {
      return reply.send({'failure': 'no query length'})
    }
})

// Link to create playlist page
fastify.get('/create-playlist', async(req, reply) => {
  return reply.view('create-playlist.hbs', {user_id})
})

// Post request to actually create the playlist
fastify.post('/create-playlist', async(req, reply) => {
  // At some point, change this over to be session data
  const access_token = req.cookies.access_token

  let createPlaylistUrl = spotifyURLs.createPlaylist.replace('{user_id}', req.cookies.user_id)
  let public = req.body.public == 'true' ? true : false
  let collab = req.body.collab == 'true' ? true : false

  let response = await fetch(createPlaylistUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      'name': req.body.name,
      'public': public,
      'collaborative': collab,
      'description': req.body.description,
    }),
    json: true
  })

  let data = await response.json()
  if(!response.status >= 200 && response.status < 300) {
    // Success, playlist created!
    return reply.view('playlist-success', data)
  }
  else {
    // Failed to create :(
    return reply.view('playlist-fail', data)
    
  }
})

// Don't use async handle for sync write and read file!!!
fastify.get('/log-error', (req, reply) => {
  const errorCode = req.query.errorCode,
        errorMsg = req.query.errorMsg

  const errorObj = {
    code: errorCode,
    message: errorMsg,
    date: new Date()
  }

  try {
    // open file stream
    fs.readFile(ERRORLOG, 'utf8', (err, data) => {
      let parsedErrors = JSON.parse(data),
          stringErrors

      parsedErrors.errors.push(errorObj)
      stringErrors = JSON.stringify(parsedErrors)

      // Write the file back with the array
      fs.writeFile(ERRORLOG, stringErrors, (err) => {
        // If an error occurs, throw an error
        if(err) throw err

        // otherwise continue
        console.log('Successfully logged error')

        return reply.view('error-logged')
      })
    })
    // save file stream
  } catch(err) {
    console.error('An error occurred when trying to log another error!', err)
    return reply.view('error-logging-failed')
  }



  // email Jonno to let know an error has occured

  
})

var generateRandomString = function(length) {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  
    for (var i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  };
  

const start = async () => {
    try {
      await fastify.listen({ port: 3000 })
    } catch (err) {
      fastify.log.error(err)
      process.exit(1)
    }
  }
  start()