const http = require("http")
const crypto = require("crypto")

const httpServer = http.createServer(function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html"})
    res.end("wasssssuppp")
})

httpServer.listen(8080, function() {
    console.log("server listening")
})

const upgradeChecksFailedResBody = '400 bad request.  The HTTP headers do not comply'
const upgradeChecksFailedResonse =
`HTTP/1.1 GET 400 Bad Request\r\n`
+ `Content-Type: text/plain\r\n`
+ `Content-Length: ${upgradeChecksFailedResBody.length}\r\n`
+ `\r\n`
+ `${upgradeChecksFailedResBody}`

httpServer.on("upgrade", function(req, socket, head) {
    console.log(req.headers)
    // {
    //   host: '127.0.0.1:8080',
    //   connection: 'Upgrade',
    //   pragma: 'no-cache',
    //   'cache-control': 'no-cache',
    //   'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    //   upgrade: 'websocket',
    //   origin: 'http://localhost:3000',
    //   'sec-websocket-version': '13',
    //   'accept-encoding': 'gzip, deflate, br, zstd',
    //   'accept-language': 'en-US,en;q=0.9',
    //   'sec-websocket-key': 'ZhriEsVbX/t5BULNj0Q+1w==',
    //   'sec-websocket-extensions': 'permessage-deflate; client_max_window_bits'
    // }

    // check it's a get request
    const methodCheck = req.method.toLowerCase() === "get"

    // check required headers
    const connectionCheck = req.headers.connection.toLowerCase() === "upgrade"
    const upgradeCheck = req.headers.upgrade.toLowerCase() === "websocket"
    const originCheck = req.headers.origin === "http://localhost:3000"
    const versionCheck = req.headers["sec-websocket-version"] === "13"

    if (!methodCheck || !connectionCheck || !upgradeCheck || !originCheck || !versionCheck) {
        socket.write(upgradeChecksFailedResonse)
        socket.end() // close the tcp connection
        return
    }

    // create upgrade response headers 
    // concat the key with the standard guid 258EAFA5-E914-47DA-95CA-C5AB0DC85B11)
    // sha hash it
    // base64 encode it
    // see: https://datatracker.ietf.org/doc/html/rfc6455#section-4.2
    const clientKey = req.headers['sec-websocket-key'] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
    const serverKey = crypto.createHash("sha1").update(clientKey).digest("base64")

    const upgradeHeaders = `HTTP/1.1 101 Switching Protocols\r\n` 
    + `Connection: Upgrade\r\n`
    + `Upgrade: websocket\r\n`
    + `Sec-Websocket-Accept: ${serverKey}\r\n\r\n`

    socket.write(upgradeHeaders)
    
    startWebsocketConnection(socket)
})

function startWebsocketConnection(socket) {
    console.log(`Websocket connection established on port (socket.remotePort): ${socket.remotePort}`)

    const websocketer = new WebSocketer(socket)

    socket.on("data", websocketer.handleChunk)
}

class WebSocketer {
    constructor(socket) {
        this._socket = socket
        this._bufferArray = ['hockey']
        this._bufferArrayLength = 0

        this.handleChunk = this.handleChunk.bind(this)
    }

    handleChunk(chunk) {
        console.log(`\n...handleChunk...`)

        this._bufferArray.push(chunk)
        this._bufferArrayLength += chunk.length

        const cheaders = this._chunkHeaders(chunk)
        console.log(`HEADERS`)
        console.log(`byte 1 ${cheaders.at(0).toString(2)}`)
        console.log(`byte 2 ${cheaders.at(1).toString(2)}`)

        const isFinal = this._chunkFin(chunk)
        console.log(`FIN: ${isFinal}`)

        const opCode = this._chunkOpCode(chunk)
        console.log(`OPCODE: ${opCode.toString(2).padStart(4, '0')}`)

        const payloadBitLength = this._chunkPayloadBitLength(chunk)
        console.log(`PAYLOAD BIT LENGTH: ${payloadBitLength}`)
        
        const payloadLength = this._chunkPayloadLength(chunk)
        console.log(`PAYLOAD LENGTH: ${payloadLength} bytes`)
    }

    _chunkHeaders(chunk) {
        return chunk.slice(0, 2)
    }

    _chunkFin(chunk) {
        const firstByte = this._chunkHeaders(chunk)[0]
        return !!(firstByte & 0b10000000)
    }

    _chunkOpCode(chunk) {
        const firstByte = this._chunkHeaders(chunk)[0]
        return firstByte & 0b00001111
    }

    _chunkMask(chunk) {
        const secondByte = this._chunkHeaders(chunk)[1]
        return !!(secondByte & 0b10000000)
    }

    _chunkPayloadBitLength(chunk) {
        const secondByte = this._chunkHeaders(chunk)[1]

        const val = secondByte & 0b01111111

        if (val === 127) {
            return 'long'
        } else if (val === 126) {
            return 'med'
        } else {
            return 'short'
        }
    }

    _chunkPayloadLength(chunk) {
        const bitlen = this._chunkPayloadBitLength(chunk)
 
        if (bitlen === 'long') {
            const bytes = chunk.slice(2, 10) 
            const payloadLength = Number(bytes.readUInt64BE())
            return payloadLength
        }

        if (bitlen === 'med') {
            const bytes = chunk.slice(2, 4)
            const payloadLength = bytes.readUInt16BE()
            return payloadLength
        }

        return chunk.at(1) & 0b01111111
        
    }
}